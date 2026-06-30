import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, CalendarDays, ChevronDown, Clock3, MapPin, Moon, UserRound, X } from "lucide-react";
import { Chip, Field } from "../../../../shared/ui";
import type {
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
  routes: RouteDirectoryItem[];
  selected?: ScheduleCell;
  onClose: () => void;
  onCreateScheduledRequest: (payload: CreateServiceRequestPayload) => MaybePromise<ServiceRequest>;
  onNotify: (message: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onRunAssignmentCommand: (assignmentId: string, command: AssignmentCommand, payload?: CompleteAssignmentPayload) => MaybePromise<void>;
}

export function ScheduleEditPanel({
  canManage = true,
  employees,
  resultHistory = [],
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
  const [selectedResultId, setSelectedResultId] = useState("");

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
  const routeRequiresChecklist = (selectedRoute?.points.length ?? 0) > 0;

  useEffect(() => {
    if (!selected) return;
    setShowQuickCompleteConfirm(false);
    resetFormFromSelected(selected, employees, routes);
  }, [employees, routes, selected]);

  useEffect(() => {
    setSelectedResultId(resultHistory[0]?.id ?? "");
  }, [resultHistory, selected?.id]);

  if (!selected) {
    return null;
  }

  const isExisting = selected.state !== "empty";
  const canRunCommand = Boolean(canManage && selected.assignmentId && !commandSaving);

  function resetFormFromSelected(
    cell: ScheduleCell,
    employeeOptions: EmployeeDirectoryItem[],
    routeOptions: RouteDirectoryItem[],
  ) {
    setEmployeeId(cell.employeeId || employeeOptions[0]?.id || "");
    setRouteId(cell.routeId || routeOptions[0]?.id || "");
    setDate(cell.date || toDateInput(new Date()));
    setTime(normalizeTime(cell.scheduledTime) || (cell.shift === "Ночная" ? "19:00" : "08:00"));
    setShift(cell.shift);
    setNotifyEmployee(cell.notifyEmployee ?? true);
    setDescription(cell.notificationText || "");
  }

  function applyResultToPlan(result: PatrolResult) {
    const resultEmployee = employees.find((employee) => employee.id === result.employeeId || employee.fullName === result.employee);
    const resultRoute = routes.find((route) => route.id === result.routeId || route.name === result.route);

    setSelectedResultId(result.id);

    if (resultEmployee) {
      setEmployeeId(resultEmployee.id);
    }

    if (resultRoute) {
      setRouteId(resultRoute.id);
    }

    setShift(result.shift === "Ночь" ? "Ночная" : "Дневная");
    setNotifyEmployee(true);
    setDescription(createResultNotificationText(result));
    onNotify("Данные результата подставлены в плановый обход");
  }

  async function submitScheduleItem() {
    if (!canManage) {
      onNotify("Недостаточно прав для планирования обходов");
      return;
    }

    if (!selectedEmployee || !selectedRoute || !date || !time) {
      onNotify("Выберите сотрудника, маршрут, дату и время обхода");
      return;
    }

    setSaving(true);
    try {
      const notificationText = notifyEmployee
        ? description.trim() || `Назначен обход ${selectedRoute.name} на ${formatDate(date)} ${time}.`
        : "";

      await onCreateScheduledRequest({
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
      });
      onNotify(notifyEmployee ? "Плановый обход создан, уведомление подготовлено" : "Плановый обход создан");
      onClose();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось сохранить плановый обход");
    } finally {
      setSaving(false);
    }
  }

  async function runCommand(command: AssignmentCommand) {
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

    setShowQuickCompleteConfirm(false);
    setCommandSaving(command);
    try {
      await onRunAssignmentCommand(assignmentId, command, command === "complete" ? createScheduleCompletionPayload(selected) : undefined);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось обновить назначение");
    } finally {
      setCommandSaving(null);
    }
  }

  return (
    <aside className="edit-modal schedule-plan-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-plan-modal-title">
      <div className="drawer-title">
        <div>
          <h2 id="schedule-plan-modal-title">{isExisting ? "Плановый обход" : "Создание планового обхода"}</h2>
          <p>
            {selected.day} · {selected.shift}
          </p>
        </div>
        <div className="schedule-plan-modal-head-actions">
          <Chip>{getSelectedChipLabel(selected)}</Chip>
          <button className="icon-button schedule-plan-close-button" onClick={onClose} type="button" aria-label="Закрыть">
            <X aria-hidden="true" size={18} strokeWidth={2.6} />
          </button>
        </div>
      </div>

      {isExisting ? (
        <>
          <dl className="meta-list">
            <Field label="Текущий маршрут" value={selected.route || "-"} />
            <Field label="Текущий сотрудник" value={selected.employee || "-"} />
            <Field label="Статус" value={getSelectedChipLabel(selected)} />
            <Field label="Уведомление" value={selected.notifyEmployee ? "подготовлено" : "не требуется"} />
          </dl>

          {showQuickCompleteConfirm ? (
            <div className="schedule-quick-complete">
              <strong>Быстрое завершение из расписания</strong>
              <p>
                Результат будет сохранен как "Подтверждено" с текущим временем и общим комментарием.
                Для замечаний, выбора точки, severity и фото используйте полную форму результата в назначениях.
              </p>
              <div>
                <button
                  className="button ghost"
                  disabled={commandSaving === "complete"}
                  onClick={() => setShowQuickCompleteConfirm(false)}
                  type="button"
                >
                  Отмена
                </button>
                <button
                  className="button primary"
                  disabled={!canRunCommand}
                  onClick={() => void runCommand("complete")}
                  type="button"
                >
                  {commandSaving === "complete" ? "Завершение..." : "Подтвердить быстрое завершение"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="schedule-command-bar">
            <button
              className="button ghost"
              disabled={!selected.requestId}
              onClick={() => selected.requestId && onOpenRequestById(selected.requestId)}
              type="button"
            >
              Открыть заявку
            </button>
            <button
              className="button ghost"
              disabled={!canRunCommand}
              onClick={() => void runCommand("start")}
              type="button"
            >
              {commandSaving === "start" ? "Запуск..." : "Начать обход"}
            </button>
            <button
              className="button ghost"
              disabled={!canRunCommand || routeRequiresChecklist}
              onClick={() => void runCommand("complete")}
              title={routeRequiresChecklist ? "Маршрут требует чек-лист точек. Завершите обход на экране назначений." : undefined}
              type="button"
            >
              {commandSaving === "complete" ? "Завершение..." : "Быстро завершить"}
            </button>
            <button
              className="button danger-outline"
              disabled={!canRunCommand}
              onClick={() => void runCommand("cancel")}
              type="button"
            >
              {commandSaving === "cancel" ? "Отмена..." : "Отменить"}
            </button>
          </div>
        </>
      ) : null}

      <div className="schedule-plan-form">
        <SchedulePlanField icon={<UserRound size={19} />} label="Сотрудник">
          <select value={employeeId} onChange={(event) => setEmployeeId(event.currentTarget.value)}>
            <option value="">Выберите сотрудника</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} · {employee.position || employee.department}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="schedule-plan-field-caret" size={18} />
        </SchedulePlanField>

        <SchedulePlanField icon={<MapPin size={19} />} label="Маршрут">
          <select value={routeId} onChange={(event) => setRouteId(event.currentTarget.value)}>
            <option value="">Выберите маршрут</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name} · {route.points.length} точек
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="schedule-plan-field-caret" size={18} />
        </SchedulePlanField>

        <div className="schedule-plan-field-row">
          <SchedulePlanField icon={<CalendarDays size={18} />} label="Дата">
            <input value={date} onChange={(event) => setDate(event.currentTarget.value)} type="date" />
          </SchedulePlanField>
          <SchedulePlanField icon={<Clock3 size={18} />} label="Время начала">
            <input value={time} onChange={(event) => setTime(event.currentTarget.value)} type="time" />
          </SchedulePlanField>
        </div>

        <SchedulePlanField icon={<Moon size={18} />} label="Смена">
          <select value={shift} onChange={(event) => setShift(event.currentTarget.value as "Дневная" | "Ночная")}>
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
          <span>Сообщение сотруднику <small>(необязательно)</small></span>
          <textarea
            maxLength={500}
            onChange={(event) => setDescription(event.currentTarget.value)}
            placeholder="Введите сообщение..."
            value={description}
          />
          <em>{description.length} / 500</em>
        </label>
      </div>

      <ScheduleResultHistory
        canManage={canManage}
        resultHistory={resultHistory}
        selectedResult={selectedResult}
        selectedResultId={selectedResultId}
        onApplyResult={applyResultToPlan}
        onSelectResult={setSelectedResultId}
      />

      <div className="drawer-actions">
        <button
          className="button ghost"
          disabled={saving}
          onClick={onClose}
          type="button"
        >
          Отмена
        </button>
        <button
          className="button primary"
          disabled={!canManage || saving || !selectedEmployee || !selectedRoute}
          onClick={() => void submitScheduleItem()}
          type="button"
        >
          {saving ? "Сохранение..." : isExisting ? "Создать еще обход" : "Сохранить заявку"}
        </button>
      </div>
    </aside>
  );
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
  selectedResult,
  selectedResultId,
  onApplyResult,
  onSelectResult,
}: {
  canManage: boolean;
  resultHistory: PatrolResult[];
  selectedResult?: PatrolResult;
  selectedResultId: string;
  onApplyResult: (result: PatrolResult) => void;
  onSelectResult: (id: string) => void;
}) {
  const visibleResults = resultHistory.slice(0, 10);

  if (resultHistory.length === 0) {
    return null;
  }

  return (
    <section className="schedule-result-history" aria-label="История результатов за день">
      <div className="schedule-result-history-head">
        <div>
          <strong>История результатов за день</strong>
          <span>{resultHistory.length} результатов для быстрого назначения</span>
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
              <button
                className="button ghost"
                disabled={!canManage}
                onClick={() => onApplyResult(selectedResult)}
                type="button"
              >
                Назначить по результату
              </button>
            </article>
          ) : null}
      </div>
    </section>
  );
}

function getSelectedChipLabel(selected: ScheduleCell) {
  if (selected.state === "sick") return "Больничный";
  if (selected.state === "vacation") return "Отпуск";
  if (selected.state === "empty") return "Свободно";
  if (selected.state === "alternate") return "Резерв";
  if (selected.state === "transfer") return "Перенос";
  return "Назначен";
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

function createScheduleCompletionPayload(selected: ScheduleCell): CompleteAssignmentPayload {
  return {
    actualAt: new Date().toISOString(),
    comment: `Завершено из расписания: ${selected.route || "обход"}.`,
    photos: 0,
    status: "Подтверждено",
  };
}
