import { AlertTriangle, CalendarDays, Route, Send, UserPlus } from "./AssignmentIcons";

interface AssignmentSelectionBarProps {
  canCreate: boolean;
  employeeName?: string;
  employeeRole?: string;
  hasConflict: boolean;
  isCreating: boolean;
  onCreate: () => void;
  plannedDate: string;
  plannedStart: string;
  routeName?: string;
}

export function AssignmentSelectionBar({
  canCreate,
  employeeName,
  employeeRole,
  hasConflict,
  isCreating,
  onCreate,
  plannedDate,
  plannedStart,
  routeName,
}: AssignmentSelectionBarProps) {
  const ready = Boolean(employeeName && routeName && plannedDate && plannedStart);
  const disabled = !canCreate || !ready || hasConflict || isCreating;

  return (
    <section aria-label="Текущее назначение обхода" className={`assign-am-selection-bar ${hasConflict ? "has-conflict" : ""}`}>
      <div className="assign-am-selection-item">
        <UserPlus size={18} />
        <span>
          <small>Сотрудник</small>
          <strong>{employeeName || "Не выбран"}</strong>
          {employeeRole ? <em>{employeeRole}</em> : null}
        </span>
      </div>
      <div className="assign-am-selection-item">
        <Route size={18} />
        <span>
          <small>Маршрут</small>
          <strong>{routeName || "Не выбран"}</strong>
        </span>
      </div>
      <div className="assign-am-selection-item">
        <CalendarDays size={18} />
        <span>
          <small>Плановый старт</small>
          <strong>{formatPlannedStart(plannedDate, plannedStart)}</strong>
        </span>
      </div>
      {hasConflict ? (
        <span className="assign-am-selection-warning" role="status">
          <AlertTriangle size={17} />
          Есть конфликт назначения
        </span>
      ) : null}
      <button className="button primary assign-am-selection-create" disabled={disabled} onClick={onCreate} type="button">
        <Send size={17} />
        {isCreating ? "Создаём…" : "Создать заявку"}
      </button>
    </section>
  );
}

function formatPlannedStart(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day || !timeValue) return "Не указано";
  return `${day}.${month}.${year} · ${timeValue}`;
}