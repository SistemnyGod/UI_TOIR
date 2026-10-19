import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../../../api/client";
import type { CreateServiceRequestPayload, EmployeeDirectoryItem, PatrolResult, RouteDirectoryItem } from "../../../../types";
import { Button, Chip, ModalShell, useDialogCloseGuard } from "../../../../shared/ui";
import { buildNotificationText, getDateInputValue } from "./requestModalUtils";
import "./requestCreateModal.css";

export function RequestCreateModal({
  sourceResult,
  sourceResultId,
  employeeOptions,
  routeOptions,
  onClose,
  onDirtyChange,
  onSubmitCreate,
}: {
  sourceResult?: PatrolResult;
  sourceResultId?: string;
  employeeOptions: EmployeeDirectoryItem[];
  routeOptions: RouteDirectoryItem[];
  onClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSubmitCreate: (payload: CreateServiceRequestPayload) => void | Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState(() => findEmployeeOption(employeeOptions, sourceResult?.employee)?.id ?? employeeOptions[0]?.id ?? "");
  const [routeId, setRouteId] = useState(() => findRouteOption(routeOptions, sourceResult?.route)?.id ?? routeOptions[0]?.id ?? "");
  const [scheduledDate, setScheduledDate] = useState(getDateInputValue(new Date()));
  const [scheduledTime, setScheduledTime] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [description, setDescription] = useState(
    sourceResult ? `Повторно проверить точку ${sourceResult.point}. Комментарий результата: ${sourceResult.comment}` : "",
  );
  const formId = useId();
  const initial = useRef({ employeeId, routeId, scheduledDate, scheduledTime, description });
  const { requestClose, discardDialog } = useDialogCloseGuard({
    dirty: () => JSON.stringify({ employeeId, routeId, scheduledDate, scheduledTime, description }) !== JSON.stringify(initial.current),
    pending,
    onClose,
  });
  const selectedEmployee = useMemo(() => employeeOptions.find((item) => item.id === employeeId), [employeeId, employeeOptions]);
  const selectedRoute = useMemo(() => routeOptions.find((item) => item.id === routeId), [routeId, routeOptions]);
  const defaultNotificationText = useMemo(
    () => buildNotificationText({ employee: selectedEmployee?.fullName ?? "", route: selectedRoute?.name ?? "", scheduledDate, scheduledTime }),
    [scheduledDate, scheduledTime, selectedEmployee?.fullName, selectedRoute?.name],
  );

  function markDirty() {
    onDirtyChange(true);
  }

  useEffect(() => {
    if (!employeeOptions.length || employeeId) {
      return;
    }

    const id = findEmployeeOption(employeeOptions, sourceResult?.employee)?.id ?? employeeOptions[0].id;
    initial.current.employeeId = id;
    setEmployeeId(id);
  }, [employeeOptions, employeeId, sourceResult?.employee]);

  useEffect(() => {
    if (!routeOptions.length || routeId) {
      return;
    }

    const id = findRouteOption(routeOptions, sourceResult?.route)?.id ?? routeOptions[0].id;
    initial.current.routeId = id;
    setRouteId(id);
  }, [routeOptions, routeId, sourceResult?.route]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (!selectedEmployee || !selectedRoute) { setError("Выбранный сотрудник или маршрут недоступен. Проверьте выбор перед отправкой."); return; }

    const plannedAt = scheduledTime ? new Date(`${scheduledDate}T${scheduledTime}:00`) : null;
    if (!plannedAt || Number.isNaN(plannedAt.getTime())) {
      setError("Укажите дату и время старта обхода.");
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const payload: CreateServiceRequestPayload = {
        employeeId: selectedEmployee.id,
        employee: selectedEmployee.fullName,
        routeId: selectedRoute.id,
        route: selectedRoute.name,
        sourceResultId: sourceResult?.id ?? sourceResultId,
        scheduledDate,
        scheduledTime,
        plannedAt: plannedAt.toISOString(),
        shift: selectedEmployee.shift,
        notifyEmployee: true,
        notificationText: defaultNotificationText,
        description: description.trim() || "Заявка на проведение обхода территории.",
      };
      const fingerprint = JSON.stringify(payload);
      if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
      await onSubmitCreate({ ...payload, clientRequestId: operation.current.id });
      if (alive.current) onDirtyChange(false);
    } catch (failure) {
      if (!alive.current) return;
      const fields = failure instanceof ApiError ? Object.values(failure.errors ?? {}).flat().join(" ") : "";
      setError(fields || (failure instanceof Error ? failure.message : "Не удалось создать заявку. Повторите попытку."));
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  return (
    <><ModalShell
      className="request-create-modal"
      onClose={() => { if (!busy.current) requestClose(); }}
      pending={pending}
      subtitle="Выберите сотрудника, маршрут и дату. Уведомление сотруднику отправляется автоматически после создания заявки."
      title="Заявка на проведение обхода"
      actions={<>
        <Button disabled={pending} onClick={requestClose} variant="ghost">Отмена</Button>
        <Button disabled={pending} form={formId} type="submit" variant="primary">{pending ? "Отправляем…" : "Создать заявку"}</Button>
      </>}
    >
      <form id={formId} aria-busy={pending} className="request-modal request-create-form" onSubmit={submit}>
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      <fieldset className="request-create-fields" disabled={pending}>

      {sourceResult ? (
        <div className="source-card">
          <div>
            <strong>Основание: {sourceResult.point}</strong>
            <span>
              {sourceResult.route} · {sourceResult.employee}
            </span>
          </div>
          <Chip>{sourceResult.status}</Chip>
        </div>
      ) : null}

      <div className="request-create-layout">
        <div className="request-create-primary">
          <div className="form-grid two request-form-grid">
            <label>
              Сотрудник
              <select
                name="employeeId"
                onChange={(event) => {
                  markDirty();
                  setEmployeeId(event.currentTarget.value);
                }}
                required
                value={employeeId}
              >
                {employeeOptions.length === 0 ? <option value="">Сотрудники не загружены</option> : null}
                {employeeId && !selectedEmployee ? <option value={employeeId}>Сотрудник недоступен — выберите другого</option> : null}
                {employeeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Маршрут обхода
              <select
                name="routeId"
                onChange={(event) => {
                  markDirty();
                  setRouteId(event.currentTarget.value);
                }}
                required
                value={routeId}
              >
                {routeOptions.length === 0 ? <option value="">Маршруты не загружены</option> : null}
                {routeId && !selectedRoute ? <option value={routeId}>Маршрут недоступен — выберите другой</option> : null}
                {routeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Дата обхода
              <input
                name="scheduledDate"
                onChange={(event) => {
                  markDirty();
                  setScheduledDate(event.currentTarget.value);
                }}
                required
                type="date"
                value={scheduledDate}
              />
            </label>
            <label>
              Время старта
              <input
                name="scheduledTime"
                onChange={(event) => {
                  markDirty();
                  setScheduledTime(event.currentTarget.value);
                }}
                type="time"
                required
                value={scheduledTime}
              />
              <span className="field-help">Обязательно для назначения обхода</span>
            </label>
            <label className="full-label">
              Комментарий к заявке
              <textarea
                name="description"
                onChange={(event) => {
                  markDirty();
                  setDescription(event.currentTarget.value);
                }}
                placeholder="Например: проверить внешний периметр и зафиксировать состояние ворот"
                value={description}
              />
            </label>
          </div>
        </div>

        <aside className="request-create-summary">
          <div className="request-summary-card">
            <strong>Отправка заявки</strong>
            <span>После создания заявка попадет в Обход, назначение создастся на сервере, сотрудник получит уведомление.</span>
          </div>
          <div className="request-summary-row">
            <span>Сотрудник</span>
            <strong>{selectedEmployee?.fullName ?? "Не выбран"}</strong>
            <small>{selectedEmployee ? `${selectedEmployee.position || "Должность не указана"} · ${selectedEmployee.shift || "смена не указана"}` : "Выберите сотрудника"}</small>
          </div>
          <div className="request-summary-row">
            <span>Маршрут</span>
            <strong>{selectedRoute?.name ?? "Не выбран"}</strong>
            <small>{selectedRoute ? `${selectedRoute.points?.length ?? 0} точек · ${selectedRoute.duration || "длительность не указана"}` : "Выберите маршрут"}</small>
          </div>
          <div className="request-summary-row">
            <span>План</span>
            <strong>{formatRequestDateTime(scheduledDate, scheduledTime)}</strong>
            <small>Время старта обязательно</small>
          </div>
          <details className="request-notification-preview">
            <summary>Сообщение сотруднику</summary>
            <p>{defaultNotificationText}</p>
          </details>
        </aside>
      </div>

      </fieldset>
      </form>
    </ModalShell>{discardDialog}</>
  );
}

function findEmployeeOption(options: EmployeeDirectoryItem[], name?: string) {
  if (!name) return undefined;
  return options.find((item) => item.fullName === name);
}

function findRouteOption(options: RouteDirectoryItem[], name?: string) {
  if (!name) return undefined;
  return options.find((item) => item.name === name);
}

function formatRequestDateTime(date: string, time: string) {
  const parsed = new Date(`${date}T00:00:00`);
  const dateText = Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);

  return time ? `${dateText}, ${time}` : dateText;
}
