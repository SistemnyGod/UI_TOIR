import { useMemo, useState } from "react";
import { CalendarDays, Check, List, Moon, Plus, Sun } from "lucide-react";
import { Button, EmptyState } from "../../../../shared/ui";
import type { DataSourceStatus, ScheduleCell, ScheduleMode } from "../../../../types";
import { employeeInitials, isScheduleException, parseScheduleDate, scheduleState, scheduleTime, type ScheduleDay } from "./schedulePresentation";

interface ScheduleGridPanelProps {
  errorMessage?: string;
  mode: ScheduleMode;
  scheduleCells: ScheduleCell[];
  status: DataSourceStatus;
  days: ScheduleDay[];
  selectedCellId: string;
  canManage: boolean;
  hasFilters: boolean;
  onRetry: () => void | Promise<void>;
  onSelectCell: (id: string) => void;
  onCreateDay: (date: string, template?: ScheduleCell) => void;
  onResetFilters: () => void;
}

export function ScheduleGridPanel({ errorMessage, mode, scheduleCells, status, days, selectedCellId, canManage,
  hasFilters, onRetry, onSelectCell, onCreateDay, onResetFilters }: ScheduleGridPanelProps) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const grouped = new Map<string, { cell: ScheduleCell; days: Map<string, ScheduleCell[]> }>();
    for (const cell of scheduleCells) {
      const key = `${cell.employeeId}:${cell.shift}`;
      const row = grouped.get(key) ?? { cell, days: new Map<string, ScheduleCell[]>() };
      row.days.set(cell.date, [...(row.days.get(cell.date) ?? []), cell]);
      grouped.set(key, row);
    }
    return [...grouped.values()];
  }, [scheduleCells]);
  const events = useMemo(() => scheduleCells.filter(cell => cell.state !== "empty").sort((a, b) =>
    a.date.localeCompare(b.date) || scheduleTime(a.scheduledTime).localeCompare(scheduleTime(b.scheduledTime)) || a.employee.localeCompare(b.employee, "ru")), [scheduleCells]);
  const byDay = useMemo(() => {
    const grouped = new Map<string, ScheduleCell[]>();
    for (const cell of events) grouped.set(cell.date, [...(grouped.get(cell.date) ?? []), cell]);
    return grouped;
  }, [events]);
  const exceptions = events.filter(isScheduleException);
  const isList = view === "list" || mode === "exceptions";
  const visibleEvents = mode === "exceptions" ? exceptions : events;

  return (
    <section className="plan-calendar-panel" aria-label="Расписание обходов">
      <div className="plan-calendar-heading">
        <div><h2>{mode === "exceptions" ? "Исключения за период" : mode === "month" ? "Месячный план" : "Недельный план"}</h2>
          <p>{mode === "exceptions" ? "Отменённые обходы, переносы и отсутствие сотрудников" : `${new Set(scheduleCells.map(cell => cell.employeeId)).size} сотрудников · ${events.length} обходов${hasFilters ? " по фильтру" : ""}`}</p></div>
        {mode !== "exceptions" ? <div className="plan-view-switch" aria-label="Отображение плана">
          <button aria-pressed={view === "calendar"} onClick={() => setView("calendar")} type="button"><CalendarDays size={16} />Сетка</button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")} type="button"><List size={16} />Список</button>
        </div> : null}
      </div>
      {errorMessage ? <div className="plan-load-error" role="alert">{errorMessage}<Button onClick={() => void onRetry()} size="sm" variant="ghost">Повторить</Button></div> : null}
      {status === "loading" && !scheduleCells.length ? <EmptyState title="Расписание загружается" description="Получаем сотрудников и маршруты." />
        : !scheduleCells.length ? <EmptyState title={hasFilters ? "Ничего не найдено" : "Нет сотрудников для планирования"}
          description={hasFilters ? "Измените поиск или фильтры, чтобы увидеть другие обходы." : "Добавьте сотрудников в справочник или выберите всех сотрудников вместо избранных."}
          action={hasFilters ? <Button onClick={onResetFilters} variant="ghost">Сбросить фильтры</Button> : undefined} />
        : isList ? <ScheduleAgenda events={visibleEvents} selectedCellId={selectedCellId} onSelectCell={onSelectCell} emptyTitle={mode === "exceptions" ? "Исключений за период нет" : "Обходов по выбранному фильтру нет"} />
        : mode === "week" ? <div className="plan-grid-scroll" tabIndex={0} aria-label="Недельная сетка, прокрутка по сотрудникам и дням">
          <table className="plan-week-table"><caption className="sr-only">Недельный план обходов по сотрудникам</caption>
            <thead><tr><th scope="col" className="plan-person-column">Сотрудник / смена</th>{days.map(day => <th scope="col" key={day.key} className={`${day.isToday ? "is-today" : ""} ${day.isWeekend ? "is-weekend" : ""}`}><span>{day.weekday}</span><strong>{day.label.replace(day.weekday, "").trim()}</strong>{day.isToday ? <small>Сегодня</small> : null}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={`${row.cell.employeeId}:${row.cell.shift}`}>
              <th scope="row" className="plan-person-column"><div className="plan-person"><span className="plan-avatar" aria-hidden="true">{employeeInitials(row.cell.employee)}</span><div><strong>{row.cell.employee}</strong><small>{row.cell.shift === "Ночная" ? <Moon size={13} /> : <Sun size={13} />}{row.cell.shift}</small></div></div></th>
              {days.map(day => {
                const cells = row.days.get(day.key) ?? [];
                return <td key={day.key} className={`${day.isToday ? "is-today" : ""} ${day.isWeekend ? "is-weekend" : ""}`}>
                  {!cells.length ? <button className="schedule-cell empty plan-empty-cell" disabled={!canManage} onClick={() => onCreateDay(day.key, row.cell)} aria-label={`Создать обход: ${row.cell.employee}, ${day.label}, ${row.cell.shift}`} type="button"><Plus size={17} /><span>Добавить</span></button> : null}
                  {cells.sort((a, b) => scheduleTime(a.scheduledTime).localeCompare(scheduleTime(b.scheduledTime))).map(cell => cell.state === "empty"
                    ? <button className="schedule-cell empty plan-empty-cell" disabled={!canManage} key={cell.id} onClick={() => onSelectCell(cell.id)} aria-label={`Создать обход: ${cell.employee}, ${cell.day}`} type="button"><Plus size={17} /><span>Добавить</span></button>
                    : <ScheduleEvent key={cell.id} cell={cell} selected={selectedCellId === cell.id} onSelectCell={onSelectCell} />)}
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        : <div className="plan-grid-scroll" tabIndex={0} aria-label="Месячный календарь, прокрутка по дням">
          <div className="plan-month-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(day => <span key={day}>{day}</span>)}</div>
          <div className="plan-month-grid">
            {Array.from({ length: (parseScheduleDate(days[0].key).getDay() + 6) % 7 }, (_, index) => <div className="plan-month-padding" aria-hidden="true" key={`pad-${index}`} />)}
            {days.map(day => {
              const cells = byDay.get(day.key) ?? [];
              const expanded = expandedDays.has(day.key);
              return <section aria-label={day.label} className={`plan-month-day ${day.isToday ? "is-today" : ""} ${day.isWeekend ? "is-weekend" : ""}`} key={day.key}>
                <div className="plan-month-day-head"><strong>{day.dayNumber}</strong>{cells.length ? <span>{cells.length}</span> : null}
                  {canManage ? <button aria-label={`Создать обход ${day.label}`} onClick={() => onCreateDay(day.key)} type="button"><Plus size={15} /></button> : null}</div>
                {(expanded ? cells : cells.slice(0, 2)).map(cell => <ScheduleEvent compact key={cell.id} cell={cell} selected={selectedCellId === cell.id} onSelectCell={onSelectCell} />)}
                {cells.length > 2 ? <button className="plan-more" onClick={() => setExpandedDays(old => { const next = new Set(old); if (next.has(day.key)) next.delete(day.key); else next.add(day.key); return next; })} type="button">{expanded ? "Свернуть" : `Ещё ${cells.length - 2}`}</button> : null}
              </section>;
            })}
          </div>
        </div>}
      <div className="plan-calendar-foot"><div className="plan-legend"><span><i className="planned" />Назначен</span><span><i className="active" />В работе</span><span><i className="completed" />Выполнен</span><span><i className="cancelled" />Отменён</span></div>
        <small>{canManage ? "Нажмите на обход для просмотра, на свободную ячейку — для создания" : "Режим просмотра"}</small></div>
    </section>
  );
}

function ScheduleEvent({ cell, compact = false, selected, onSelectCell }: { cell: ScheduleCell; compact?: boolean; selected: boolean; onSelectCell: (id: string) => void }) {
  const state = scheduleState(cell);
  return <button aria-label={`${cell.route}, ${cell.employee}, ${cell.day}, ${scheduleTime(cell.scheduledTime)}, ${state.label}`} aria-pressed={selected}
    className={`schedule-cell plan-event ${state.tone} ${selected ? "selected" : ""} ${compact ? "is-compact" : ""}`} onClick={() => onSelectCell(cell.id)} type="button">
    <span className="plan-event-time">{scheduleTime(cell.scheduledTime)}{state.tone === "completed" ? <Check size={13} aria-hidden="true" /> : null}</span>
    <strong>{cell.route || state.label}</strong><small>{compact ? cell.employee : state.label}</small>
  </button>;
}

function ScheduleAgenda({ events, selectedCellId, onSelectCell, emptyTitle }: { events: ScheduleCell[]; selectedCellId: string; onSelectCell: (id: string) => void; emptyTitle: string }) {
  if (!events.length) return <EmptyState title={emptyTitle} description="Выберите другую дату или создайте новый обход." />;
  return <div className="plan-agenda">{events.map(cell => <button className={`plan-agenda-row ${selectedCellId === cell.id ? "selected" : ""}`} key={cell.id} onClick={() => onSelectCell(cell.id)} type="button">
    <time dateTime={cell.date}><strong>{cell.day}</strong><span>{scheduleTime(cell.scheduledTime)}</span></time>
    <div><strong>{cell.route}</strong><span>{cell.employee}</span></div><span className={`plan-status ${scheduleState(cell).tone}`}>{scheduleState(cell).label}</span>
  </button>)}</div>;
}
