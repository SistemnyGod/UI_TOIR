import { AssignmentCancellationDialog } from "../../assignments/AssignmentCancellationDialog";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell, CalendarDays, ChevronDown, Clock3, MapPin, Moon, RotateCcw, UserRound } from "lucide-react";
import { Button, Chip, Field, ModalShell, useDialogCloseGuard } from "../../../../shared/ui";
import { scheduleState } from "./schedulePresentation";
import { loadAssignmentShiftSettings } from "../../assignments/assignmentStorage";
import type {
  CancelAssignmentPayload,
  CreateServiceRequestPayload,
  CompleteAssignmentPayload,
  EmployeeDirectoryItem,
  PatrolResult,
  RouteDirectoryItem,
  ScheduleCell,
  ServiceRequest,
} from "../../../../types";

type MaybePromise<T> = T | Promise<T>;
type AssignmentCommand = "start" | "cancel" | "complete";

interface ScheduleEditPanelProps {
  canManage?: boolean;
  employees: EmployeeDirectoryItem[];
  resultHistory?: PatrolResult[];
  resultHistoryMode?: "day" | "recent";
  routes: RouteDirectoryItem[];
  selected?: ScheduleCell;
  onClose: () => void;
  onCreateScheduledRequest: (payload: CreateServiceRequestPayload) => MaybePromise<ServiceRequest>;
  onNotify: (message: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onRunAssignmentCommand: (
    assignmentId: string,
    command: AssignmentCommand,
    payload?: CompleteAssignmentPayload | CancelAssignmentPayload,
  ) => MaybePromise<void>;
}

export function ScheduleEditPanel({
  canManage = true,
  employees,
  resultHistory = [],
  resultHistoryMode = "day",
  routes,
  selected,
  onClose,
  onCreateScheduledRequest,
  onNotify,
  onOpenRequestById,
  onRunAssignmentCommand,
}: ScheduleEditPanelProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [shift, setShift] = useState<"Дневная" | "Ночная">("Дневная");
  const [notifyEmployee, setNotifyEmployee] = useState(true);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [commandSaving, setCommandSaving] = useState<AssignmentCommand | null>(null);
  const [showQuickCompleteConfirm, setShowQuickCompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelErrors, setCancelErrors] = useState<Record<string, string>>({});
  const [selectedResultId, setSelectedResultId] = useState("");
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(selected?.state === "empty");
  const inFlight = useRef(false);
  const createOperation = useRef<{ fingerprint: string; id: string } | null>(null);
  const initializedCell = useRef<string | undefined>(undefined);
  const initialForm = useRef("");
  const timeWasEdited = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId),
    [employeeId, employees],
  );
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === routeId),
    [routeId, routes],
  );
  const selectedResult = useMemo(
    () => resultHistory.find((result) => result.id === selectedResultId) ?? resultHistory[0],
    [resultHistory, selectedResultId],
  );
  const existingRoute = routes.find(route => route.id === selected?.routeId);
  const routeRequiresChecklist = !existingRoute || getCompletionRoutePoints(existingRoute).length > 0;

  useEffect(() => {
    if (!selected || initializedCell.current === selected.id) return;
    initializedCell.current = selected.id;
    setShowQuickCompleteConfirm(false);
    setShowCancelConfirm(false);
    setCancelErrors({});
    setShowForm(selected.state === "empty");
    inFlight.current = false;
    createOperation.current = null;
    setFormError("");
    setSaving(false);
    setCommandSaving(null);
    resetFormFromSelected(selected, employees, routes);
  }, [employees, routes, selected]);

  useEffect(() => {
    setSelectedResultId(current => resultHistory.some(result => result.id === current) ? current : resultHistory[0]?.id ?? "");
  }, [resultHistory, selected?.id]);

  const busy = saving || Boolean(commandSaving);
  const currentForm = JSON.stringify({ employeeId, routeId, date, time, shift, notifyEmployee, description });
  const { requestClose, discardDialog } = useDialogCloseGuard({
    dirty: () => showForm && Boolean(initialForm.current) && currentForm !== initialForm.current,
    pending: busy,
    onClose,
  });

  if (!selected) {
    return null;
  }

  const isExisting = selected.state !== "empty";
  const canRunCommand = Boolean(canManage && selected.assignmentId && !busy);

  function closeEditor() {
    if (!inFlight.current) requestClose();
  }

  function changeShift(value: ScheduleCell["shift"]) {
    setShift(value);
    if (!timeWasEdited.current) {
      const settings = loadAssignmentShiftSettings();
      setTime(value === "Ночная" ? settings.nightStart : settings.dayStart);
    }
  }

  function resetFormFromSelected(
    cell: ScheduleCell,
    employeeOptions: EmployeeDirectoryItem[],
    routeOptions: RouteDirectoryItem[],
  ) {
    const shiftSettings = loadAssignmentShiftSettings();
    const values = {
      employeeId: cell.employeeId || employeeOptions.find(employee => employee.status !== "Отпуск")?.id || "",
      routeId: cell.routeId || routeOptions.find(route => route.status !== "Архив")?.id || "",
      date: cell.date || toDateInput(new Date()),
      time: normalizeTime(cell.scheduledTime) || (cell.shift === "Ночная" ? shiftSettings.nightStart : shiftSettings.dayStart),
      shift: cell.shift,
      notifyEmployee: cell.notifyEmployee ?? true,
      description: cell.description || cell.notificationText || "",
    };
    initialForm.current = JSON.stringify(values);
    timeWasEdited.current = Boolean(normalizeTime(cell.scheduledTime));
    setEmployeeId(values.employeeId);
    setRouteId(values.routeId);
    setDate(values.date);
    setTime(values.time);
    setShift(cell.shift);
    setNotifyEmployee(values.notifyEmployee);
    setDescription(values.description);
  }

  function applyResultToPlan(result: PatrolResult) {
    if (!canManage || busy) return;
    setShowForm(true);
    const resultEmployee = employees.find((employee) => employee.id === result.employeeId || employee.fullName === result.employee);
    const resultRoute = routes.find((route) => route.id === result.routeId || route.name === result.route);

    setSelectedResultId(result.id);

    if (resultEmployee) {
      setEmployeeId(resultEmployee.id);
    }

    if (resultRoute) {
      setRouteId(resultRoute.id);
    }

    changeShift(result.shift === "Ночь" ? "Ночная" : "Дневная");
    setNotifyEmployee(true);
    setDescription(createResultNotificationText(result));
    onNotify("Данные результата подставлены в плановый обход");
  }

  async function submitScheduleItem() {
    if (inFlight.current || !showForm) return;
    setFormError("");
    if (!canManage) {
      onNotify("Недостаточно прав для планирования обходов");
      return;
    }

    if (!selectedEmployee || !selectedRoute || !date || !time) {
      setFormError("Выберите сотрудника, маршрут, дату и время обхода");
      return;
    }
    if (selectedEmployee.status === "Отпуск") {
      setFormError("Сотрудник находится в отпуске. Выберите другого сотрудника.");
      return;
    }
    if (selectedRoute.status === "Архив") {
      setFormError("Маршрут находится в архиве. Выберите действующий маршрут.");
      return;
    }

    inFlight.current = true;
    setSaving(true);
    const cellId = selected?.id;
    try {
      const notificationText = notifyEmployee
        ? description.trim() || `Назначен обход ${selectedRoute.name} на ${formatDate(date)} ${time}.`
        : "";

      const payload: CreateServiceRequestPayload = {
        employeeId: selectedEmployee.id,
        employee: selectedEmployee.fullName,
        routeId: selectedRoute.id,
        route: selectedRoute.name,
        scheduledDate: date,
        scheduledTime: time,
        shift,
        notifyEmployee,
        notificationText,
        description: description.trim(),
      };
      const fingerprint = JSON.stringify(payload);
      if (createOperation.current?.fingerprint !== fingerprint) createOperation.current = { fingerprint, id: crypto.randomUUID() };
      await onCreateScheduledRequest({ ...payload, clientRequestId: createOperation.current.id });
      if (!mounted.current || initializedCell.current !== cellId) return;
      onNotify(notifyEmployee ? "Плановый обход создан, уведомление подготовлено" : "Плановый обход создан");
      onClose();
    } catch (error) {
      if (mounted.current && initializedCell.current === cellId) setFormError(error instanceof Error ? error.message : "Не удалось сохранить плановый обход");
    } finally {
      if (mounted.current && initializedCell.current === cellId) { inFlight.current = false; setSaving(false); }
    }
  }

  async function runCommand(command: AssignmentCommand, payload?: CompleteAssignmentPayload | CancelAssignmentPayload) {
    if (!canManage || inFlight.current || showForm) return;
    const assignmentId = selected?.assignmentId;
    if (!assignmentId) {
      onNotify("Для этой ячейки нет связанного назначения");
      return;
    }

    if (command === "complete" && !showQuickCompleteConfirm) {
      if (routeRequiresChecklist) {
        onNotify("Быстрое завершение недоступно: маршрут требует чек-лист точек. Завершите обход на экране назначений.");
        return;
      }

      setShowQuickCompleteConfirm(true);
      return;
    }

    if (command === "cancel" && !payload) {
      setCancelErrors({});
      setShowCancelConfirm(true);
      return;
    }

    inFlight.current = true;
    setShowQuickCompleteConfirm(false);
    setCommandSaving(command);
    const cellId = selected.id;
    try {
      await onRunAssignmentCommand(
        assignmentId,
        command,
        command === "complete"
          ? createScheduleCompletionPayload(selected)
          : command === "cancel" && payload && "reasonCode" in payload
            ? payload
            : undefined,
      );
      if (!mounted.current || initializedCell.current !== cellId) return;
      if (command === "cancel") {
        setShowCancelConfirm(false);
        setCancelErrors({});
      }
      onClose();
    } catch (error) {
      if (!mounted.current || initializedCell.current !== cellId) return;
      const message = error instanceof Error ? error.message : "Не удалось обновить назначение";
      if (command === "cancel") setCancelErrors({ form: message });
      else setFormError(message);
    } finally {
      if (mounted.current && initializedCell.current === cellId) { inFlight.current = false; setCommandSaving(null); }
    }
  }

  return (
    <>
      <ModalShell
      className="schedule-plan-modal plan-editor"
      onClose={closeEditor}
      pending={busy}
      subtitle={showForm ? `${date ? formatDate(date) : "Выберите дату"} · ${shift}` : `${selected.day} · ${selected.shift}`}
      title={isExisting ? showForm ? "Повторный плановый обход" : "Плановый обход" : "Создание планового обхода"}
      actions={<>
        <Button disabled={busy} onClick={closeEditor} variant="ghost">{showForm ? "Отмена" : "Закрыть"}</Button>
        {showForm && canManage ? <Button disabled={busy || !selectedEmployee || !selectedRoute} isLoading={saving} onClick={() => void submitScheduleItem()} variant="primary">{saving ? "Сохранение…" : "Сохранить заявку"}</Button>
          : isExisting && canManage ? <Button disabled={busy} onClick={() => setShowForm(true)} variant="primary"><RotateCcw size={16} />Создать повторный обход</Button> : null}
      </>}
    >
      <div className="schedule-plan-modal-status">
        <Chip tone={showForm ? "blue" : undefined}>{showForm ? "Новая заявка" : getSelectedChipLabel(selected)}</Chip>
      </div>

      {isExisting && !showForm ? (
        <>
          <dl className="plan-record-summary">
            <Field label="Маршрут" value={selected.route || "—"} />
            <Field label="Сотрудник" value={selected.employee || "—"} />
            <Field label="Плановый старт" value={formatScheduleStart(selected)} />
            <Field label="Смена" value={selected.shift} />
          </dl>
          {selected.description || selected.notificationText ? <div className="plan-record-comment"><span>Комментарий к обходу</span><p>{selected.description || selected.notificationText}</p></div> : null}

          {showQuickCompleteConfirm ? (
            <div className="schedule-quick-complete">
              <strong>Быстрое завершение из расписания</strong>
              <p>
                Результат будет сохранен как "Подтверждено" с текущим временем и общим комментарием.
                Для замечаний по точкам и фотографий используйте полную форму результата в назначениях.
              </p>
              <div>
                <Button
                  disabled={commandSaving === "complete"}
                  onClick={() => setShowQuickCompleteConfirm(false)}
                  variant="ghost"
                >
                  Отмена
                </Button>
                <Button
                  disabled={!canRunCommand}
                  onClick={() => void runCommand("complete")}
                  variant="primary"
                >
                  {commandSaving === "complete" ? "Завершение..." : "Подтвердить быстрое завершение"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="schedule-command-bar">
            {selected.requestId ? (
            <Button
              disabled={busy}
              onClick={() => { if (selected.requestId) { onClose(); onOpenRequestById(selected.requestId); } }}
              variant="ghost"
            >
              Открыть заявку
            </Button>
            ) : null}
            {selected.assignmentId && !["completed", "cancelled"].includes(scheduleState(selected).tone) ? <>
            {selected.assignmentStatus === "Запланирован" || selected.assignmentStatus === "Ожидает" ? <Button
              disabled={!canRunCommand}
              onClick={() => void runCommand("start")}
              variant="ghost"
            >
              {commandSaving === "start" ? "Запуск..." : "Начать обход"}
            </Button> : null}
            <Button
              disabled={!canRunCommand || routeRequiresChecklist}
              onClick={() => void runCommand("complete")}
              title={routeRequiresChecklist ? "Маршрут требует чек-лист точек. Завершите обход на экране назначений." : undefined}
              variant="ghost"
            >
              {commandSaving === "complete" ? "Завершение..." : "Быстро завершить"}
            </Button>
            <Button
              className="danger-outline"
              disabled={!canRunCommand}
              onClick={() => void runCommand("cancel")}
              variant="danger"
            >
              {commandSaving === "cancel" ? "Отмена..." : "Отменить"}
            </Button>
            </> : null}
          </div>
          {selected.assignmentId && routeRequiresChecklist ? <p className="plan-command-note">Для завершения этого маршрута заполните чек-лист точек во вкладке «Назначения».</p> : null}
        </>
      ) : null}

      {showForm ? <>
      <div className="plan-editor-section-heading"><h3>{isExisting ? "Новый обход на основе выбранного" : "Параметры обхода"}</h3>{isExisting ? <p>Исходная заявка сохранится в истории. Укажите дату и время нового обхода.</p> : null}</div>
      <fieldset className="schedule-plan-form" disabled={!canManage || saving || Boolean(commandSaving)}>
        <legend className="sr-only">Параметры обхода</legend>
        <SchedulePlanField icon={<UserRound size={19} />} label="Сотрудник">
          <select aria-label="Сотрудник" value={employeeId} onChange={(event) => setEmployeeId(event.currentTarget.value)}>
            <option value="">Выберите сотрудника</option>
            {employees.map((employee) => (
              <option disabled={employee.status === "Отпуск"} key={employee.id} value={employee.id}>
                {employee.fullName} · {employee.status === "Отпуск" ? "В отпуске" : employee.position || employee.department}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="schedule-plan-field-caret" size={18} />
        </SchedulePlanField>

        <SchedulePlanField icon={<MapPin size={19} />} label="Маршрут">
          <select aria-label="Маршрут" value={routeId} onChange={(event) => setRouteId(event.currentTarget.value)}>
            <option value="">Выберите маршрут</option>
            {routes.map((route) => (
              <option disabled={route.status === "Архив"} key={route.id} value={route.id}>
                {route.name} · {route.status === "Архив" ? "В архиве" : `${route.points.length} точек`}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="schedule-plan-field-caret" size={18} />
        </SchedulePlanField>

        <div className="schedule-plan-field-row">
          <SchedulePlanField icon={<CalendarDays size={18} />} label="Дата">
            <input aria-label="Дата" value={date} onChange={(event) => setDate(event.currentTarget.value)} type="date" />
          </SchedulePlanField>
          <SchedulePlanField icon={<Clock3 size={18} />} label="Время начала">
            <input aria-label="Время начала" value={time} onChange={(event) => { timeWasEdited.current = true; setTime(event.currentTarget.value); }} type="time" />
          </SchedulePlanField>
        </div>

        <SchedulePlanField icon={<Moon size={18} />} label="Смена">
          <select aria-label="Смена" value={shift} onChange={(event) => changeShift(event.currentTarget.value as "Дневная" | "Ночная")}>
            <option value="Дневная">Дневная</option>
            <option value="Ночная">Ночная</option>
          </select>
          <ChevronDown aria-hidden="true" className="schedule-plan-field-caret" size={18} />
        </SchedulePlanField>

        <label className={`schedule-plan-notify-row ${notifyEmployee ? "is-checked" : ""}`}>
          <span className="schedule-plan-notify-label">
            <Bell size={18} />
            Уведомить сотрудника
          </span>
          <input
            className="schedule-plan-notify-input"
            checked={notifyEmployee}
            onChange={(event) => setNotifyEmployee(event.currentTarget.checked)}
            type="checkbox"
          />
          <span className="schedule-plan-switch" aria-hidden="true">
            <span />
          </span>
        </label>

        <label className="schedule-plan-message">
          <span>Комментарий к обходу <small>(необязательно)</small></span>
          <textarea
            aria-label="Комментарий к обходу"
            maxLength={500}
            onChange={(event) => setDescription(event.currentTarget.value)}
            placeholder="Введите сообщение..."
            value={description}
          />
          <small>{notifyEmployee ? "Комментарий будет включён в уведомление сотруднику." : "Комментарий сохранится в заявке."}</small>
          <em>{description.length} / 500</em>
        </label>
      </fieldset>
      </> : null}
      {formError ? <p className="plan-form-error" role="alert">{formError}</p> : null}

      <ScheduleResultHistory
        canManage={canManage && !busy}
        resultHistory={resultHistory}
        resultHistoryMode={resultHistoryMode}
        selectedResult={selectedResult}
        selectedResultId={selectedResultId}
        onApplyResult={applyResultToPlan}
        onSelectResult={setSelectedResultId}
      />

      </ModalShell>
      {showCancelConfirm ? (
        <ScheduleCancelAssignmentModal
          errors={cancelErrors}
          saving={commandSaving === "cancel"}
          selected={selected}
          onClose={() => {
            if (commandSaving) return;
            setShowCancelConfirm(false);
            setCancelErrors({});
          }}
          onSubmit={(payload) => runCommand("cancel", payload)}
        />
      ) : null}
      {discardDialog}
    </>
  );
}

function ScheduleCancelAssignmentModal({ selected, ...props }: {
  errors: Record<string, string>;
  onClose: () => void;
  onSubmit: (payload: CancelAssignmentPayload) => void | Promise<void>;
  saving?: boolean;
  selected: ScheduleCell;
}) {
  return <AssignmentCancellationDialog {...props} className="schedule-cancel-modal" summary={{ employee: selected.employee, route: selected.route, plannedAt: formatScheduleStart(selected), status: getSelectedChipLabel(selected) }} />;
}

function SchedulePlanField({ children, icon, label }: { children: ReactNode; icon: ReactNode; label: string }) {
  return (
    <label className="schedule-plan-field">
      <span>{label}</span>
      <div className="schedule-plan-field-control">
        <span className="schedule-plan-field-icon" aria-hidden="true">
          {icon}
        </span>
        {children}
      </div>
    </label>
  );
}

function ScheduleResultHistory({
  canManage,
  resultHistory,
  resultHistoryMode,
  selectedResult,
  selectedResultId,
  onApplyResult,
  onSelectResult,
}: {
  canManage: boolean;
  resultHistory: PatrolResult[];
  resultHistoryMode: "day" | "recent";
  selectedResult?: PatrolResult;
  selectedResultId: string;
  onApplyResult: (result: PatrolResult) => void;
  onSelectResult: (id: string) => void;
}) {
  const visibleResults = resultHistory.slice(0, 10);

  if (resultHistory.length === 0) {
    return null;
  }

  const title = resultHistoryMode === "recent" ? "Недавние результаты за 90 дней" : "История результатов за день";
  const note = resultHistoryMode === "recent"
    ? `${resultHistory.length} последних результатов по сотруднику или маршруту`
    : `${resultHistory.length} результатов для быстрого назначения`;

  return (
    <section className="schedule-result-history" aria-label={title}>
      <div className="schedule-result-history-head">
        <div>
          <strong>{title}</strong>
          <span>{note}</span>
        </div>
      </div>

      <div className="schedule-result-layout">
          <div className="schedule-result-list" role="list">
            {visibleResults.map((result) => (
              <button
                className={`schedule-result-row ${result.id === selectedResultId ? "is-active" : ""}`}
                key={result.id}
                onClick={() => onSelectResult(result.id)}
                type="button"
              >
                <span className={getResultStatusClassName(result)}>{result.status}</span>
                <strong>{result.route}</strong>
                <small>
                  {result.employee} · {result.actualAt}
                </small>
              </button>
            ))}
          </div>

          {selectedResult ? (
            <article className="schedule-result-detail">
              <div className="schedule-result-detail-title">
                <div>
                  <strong>{selectedResult.route}</strong>
                  <span>{selectedResult.employee}</span>
                </div>
                <span className={getResultStatusClassName(selectedResult)}>{selectedResult.status}</span>
              </div>
              <dl>
                <Field label="Точка" value={selectedResult.point || "-"} />
                <Field label="Факт" value={selectedResult.actualAt || "-"} />
                <Field label="Отклонение" value={selectedResult.deviation || "-"} />
                <Field label="Замечание" value={selectedResult.issueType || "-"} />
                <Field label="Комментарий" value={selectedResult.comment || "Без комментария"} />
                <Field label="Фото" value={`${selectedResult.photos || 0}`} />
              </dl>
              <Button
                disabled={!canManage}
                onClick={() => onApplyResult(selectedResult)}
                variant="ghost"
              >
                Назначить по результату
              </Button>
            </article>
          ) : null}
      </div>
    </section>
  );
}

function getSelectedChipLabel(selected: ScheduleCell) {
  return scheduleState(selected).label;
}

function createResultNotificationText(result: PatrolResult) {
  const parts = [
    `Назначен повторный обход ${result.route}`,
    result.point ? `по точке ${result.point}` : "",
    result.status ? `после результата: ${result.status}` : "",
    result.issueType && result.issueType !== "-" ? `замечание: ${result.issueType}` : "",
    result.comment ? `комментарий: ${result.comment}` : "",
  ].filter(Boolean);

  return `${parts.join(". ")}.`;
}

function getResultStatusClassName(result: PatrolResult) {
  const hasIssue = result.status !== "Подтверждено" || (result.issueType && result.issueType !== "-");
  return `schedule-result-status ${hasIssue ? "is-issue" : "is-ok"}`;
}

function normalizeTime(value?: string) {
  if (!value) return "";
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function formatScheduleStart(selected: ScheduleCell) {
  const date = selected.date ? formatDate(selected.date) : "Дата не указана";
  return `${date}${selected.scheduledTime ? `, ${selected.scheduledTime}` : ""}`;
}

function createScheduleCompletionPayload(selected: ScheduleCell): CompleteAssignmentPayload {
  return {
    actualAt: new Date().toISOString(),
    comment: `Завершено из расписания: ${selected.route || "обход"}.`,
    photos: 0,
    status: "Подтверждено",
  };
}

function getCompletionRoutePoints(route?: RouteDirectoryItem) {
  return (route?.points ?? []).filter((point) => {
    const status = String(point.status);
    return status !== "Черновик" && status !== "Draft";
  });
}
