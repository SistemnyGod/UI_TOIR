import { useEffect, useMemo, useState } from "react";
import { Chip, EmptyState, Field } from "../../../../shared/ui";
import type {
  CreateServiceRequestPayload,
  CompleteAssignmentPayload,
  EmployeeDirectoryItem,
  RouteDirectoryItem,
  ScheduleCell,
  ServiceRequest,
} from "../../../../types";

type MaybePromise<T> = T | Promise<T>;
type AssignmentCommand = "start" | "cancel" | "complete";

interface ScheduleEditPanelProps {
  canManage?: boolean;
  employees: EmployeeDirectoryItem[];
  routes: RouteDirectoryItem[];
  selected?: ScheduleCell;
  onCreateScheduledRequest: (payload: CreateServiceRequestPayload) => MaybePromise<ServiceRequest>;
  onNotify: (message: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onRunAssignmentCommand: (assignmentId: string, command: AssignmentCommand, payload?: CompleteAssignmentPayload) => MaybePromise<void>;
}

export function ScheduleEditPanel({
  canManage = true,
  employees,
  routes,
  selected,
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

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId),
    [employeeId, employees],
  );
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === routeId),
    [routeId, routes],
  );
  const routeRequiresChecklist = (selectedRoute?.points.length ?? 0) > 0;

  useEffect(() => {
    if (!selected) return;
    setShowQuickCompleteConfirm(false);
    resetFormFromSelected(selected, employees, routes);
  }, [employees, routes, selected]);

  if (!selected) {
    return (
      <aside className="edit-modal">
        <EmptyState
          title="Ячейка плана не выбрана"
          description="Выберите свободную или заполненную ячейку, чтобы создать заявку на обход или управлять назначением."
        />
      </aside>
    );
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
    <aside className="edit-modal">
      <div className="drawer-title">
        <div>
          <h2>{isExisting ? "Плановый обход" : "Создание планового обхода"}</h2>
          <p>
            {selected.day} · {selected.shift}
          </p>
        </div>
        <Chip>{getSelectedChipLabel(selected)}</Chip>
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

      <div className="form-stack schedule-plan-form">
        <label>
          Сотрудник
          <select value={employeeId} onChange={(event) => setEmployeeId(event.currentTarget.value)}>
            <option value="">Выберите сотрудника</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} · {employee.position || employee.department}
              </option>
            ))}
          </select>
        </label>

        <label>
          Маршрут
          <select value={routeId} onChange={(event) => setRouteId(event.currentTarget.value)}>
            <option value="">Выберите маршрут</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name} · {route.points.length} точек
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid two">
          <label>
            Дата
            <input value={date} onChange={(event) => setDate(event.currentTarget.value)} type="date" />
          </label>
          <label>
            Время
            <input value={time} onChange={(event) => setTime(event.currentTarget.value)} type="time" />
          </label>
          <label>
            Смена
            <select value={shift} onChange={(event) => setShift(event.currentTarget.value as "Дневная" | "Ночная")}>
              <option value="Дневная">Дневная</option>
              <option value="Ночная">Ночная</option>
            </select>
          </label>
          <label className="schedule-check">
            <input
              checked={notifyEmployee}
              onChange={(event) => setNotifyEmployee(event.currentTarget.checked)}
              type="checkbox"
            />
            Уведомить сотрудника
          </label>
        </div>

        <label className="full-label">
          Сообщение сотруднику
          <textarea
            maxLength={1000}
            onChange={(event) => setDescription(event.currentTarget.value)}
            placeholder="Например: Назначен обход северного периметра. Начало смены в 08:00."
            value={description}
          />
        </label>
      </div>

      <div className="drawer-actions">
        <button
          className="button ghost"
          disabled={saving}
          onClick={() => {
            resetFormFromSelected(selected, employees, routes);
            onNotify("Изменения в форме отменены");
          }}
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

function getSelectedChipLabel(selected: ScheduleCell) {
  if (selected.state === "sick") return "Больничный";
  if (selected.state === "vacation") return "Отпуск";
  if (selected.state === "empty") return "Свободно";
  if (selected.state === "alternate") return "Резерв";
  if (selected.state === "transfer") return "Перенос";
  return "Назначен";
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
