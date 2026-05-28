import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CreateServiceRequestPayload, EmployeeDirectoryItem, PatrolResult, RouteDirectoryItem } from "../../types";
import { Chip } from "../ui";
import { buildNotificationText, getDateInputValue } from "./requestModalUtils";

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
  const [description, setDescription] = useState(
    sourceResult ? `Повторно проверить точку ${sourceResult.point}. Комментарий результата: ${sourceResult.comment}` : "",
  );
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
    if (!employeeOptions.length || selectedEmployee) {
      return;
    }

    setEmployeeId(findEmployeeOption(employeeOptions, sourceResult?.employee)?.id ?? employeeOptions[0].id);
  }, [employeeOptions, selectedEmployee, sourceResult?.employee]);

  useEffect(() => {
    if (!routeOptions.length || selectedRoute) {
      return;
    }

    setRouteId(findRouteOption(routeOptions, sourceResult?.route)?.id ?? routeOptions[0].id);
  }, [routeOptions, selectedRoute, sourceResult?.route]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployee || !selectedRoute) {
      return;
    }

    const plannedAt = scheduledTime ? new Date(`${scheduledDate}T${scheduledTime}:00`) : null;
    if (plannedAt && Number.isNaN(plannedAt.getTime())) {
      return;
    }

    onSubmitCreate({
      employeeId: selectedEmployee.id,
      employee: selectedEmployee.fullName,
      routeId: selectedRoute.id,
      route: selectedRoute.name,
      sourceResultId: sourceResult?.id ?? sourceResultId,
      scheduledDate,
      scheduledTime,
      plannedAt: plannedAt?.toISOString(),
      shift: selectedEmployee.shift,
      notifyEmployee: true,
      notificationText: defaultNotificationText,
      description: description.trim() || "Заявка на проведение обхода территории.",
    });
  }

  return (
    <form
      aria-label="Создание заявки на обход"
      aria-modal="true"
      className="modal-window request-modal request-create-modal"
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={submit}
      role="dialog"
    >
      <div className="modal-head">
        <div>
          <span className="modal-kicker">Новая заявка</span>
          <h2>Заявка на проведение обхода</h2>
          <p>Выберите сотрудника, маршрут и дату. Уведомление сотруднику отправляется автоматически после создания заявки.</p>
        </div>
        <button aria-label="Закрыть" className="modal-close" onClick={onClose} type="button">
          ×
        </button>
      </div>

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
                value={scheduledTime}
              />
              <span className="field-help">Можно оставить пустым</span>
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
            <small>Время можно не указывать</small>
          </div>
          <div className="request-notification-preview">
            <strong>Сообщение сотруднику</strong>
            <span>{defaultNotificationText}</span>
          </div>
        </aside>
      </div>

      <div className="modal-actions">
        <button className="button ghost" onClick={onClose} type="button">
          Отмена
        </button>
        <button className="button primary" type="submit">
          Создать заявку
        </button>
      </div>
    </form>
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
