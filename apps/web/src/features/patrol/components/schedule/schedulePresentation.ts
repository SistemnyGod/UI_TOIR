import type { ScheduleCell, ScheduleMode } from "../../../../types";

export interface ScheduleDay {
  key: string;
  label: string;
  weekday: string;
  dayNumber: number;
  isToday: boolean;
  isWeekend: boolean;
}

export type ScheduleStatusFilter = "all" | "planned" | "active" | "completed" | "cancelled";

export function dateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseScheduleDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function scheduleDays(value: string, mode: ScheduleMode): ScheduleDay[] {
  const anchor = parseScheduleDate(value);
  const start = new Date(anchor);
  if (mode === "month") start.setDate(1);
  else start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const count = mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() : 7;
  const today = dateInput(new Date());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "");
    const name = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);
    const key = dateInput(date);
    return { key, label: mode === "month" ? `${shortDate} ${name}` : `${name} ${shortDate}`,
      weekday: name, dayNumber: date.getDate(), isToday: key === today, isWeekend: date.getDay() === 0 || date.getDay() === 6 };
  });
}

export function shiftSchedulePeriod(value: string, mode: ScheduleMode, direction: -1 | 1) {
  const date = parseScheduleDate(value);
  if (mode === "month") { date.setDate(1); date.setMonth(date.getMonth() + direction); }
  else date.setDate(date.getDate() + direction * 7);
  return dateInput(date);
}

export function schedulePeriodLabel(value: string, mode: ScheduleMode) {
  const days = scheduleDays(value, mode);
  if (mode === "month") return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(parseScheduleDate(value));
  const format = (key: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(parseScheduleDate(key));
  return `${format(days[0].key)} — ${format(days.at(-1)!.key)} ${parseScheduleDate(value).getFullYear()}`;
}

export function scheduleState(cell: ScheduleCell) {
  if (cell.requestStatus === "Отменена" || cell.assignmentStatus === "Отменено") return { label: "Отменён", tone: "cancelled" };
  if (cell.requestStatus === "Закрыта" || cell.assignmentStatus === "Завершено") return { label: "Выполнен", tone: "completed" };
  if (cell.assignmentStatus === "Ожидает" || cell.assignmentStatus === "Запланирован") return { label: "Назначен", tone: "planned" };
  if (cell.assignmentId || cell.requestStatus === "В работе") return { label: "В работе", tone: "active" };
  const states = {
    planned: { label: cell.requestStatus === "Новая" ? "Новая заявка" : "Назначен", tone: "planned" },
    alternate: { label: "Резерв", tone: "planned" },
    transfer: { label: "Перенос", tone: "exception" },
    vacation: { label: "Отпуск", tone: "exception" },
    sick: { label: "Больничный", tone: "exception" },
    empty: { label: "Не запланировано", tone: "empty" },
  };
  return states[cell.state];
}

export function isScheduleException(cell: ScheduleCell) {
  return scheduleState(cell).tone === "cancelled" || ["transfer", "vacation", "sick"].includes(cell.state);
}

export function filterScheduleCells(cells: ScheduleCell[], query: string, status: ScheduleStatusFilter) {
  const needle = query.trim().toLocaleLowerCase("ru-RU");
  return cells.filter(cell => (!needle || `${cell.employee} ${cell.route} ${cell.zone}`.toLocaleLowerCase("ru-RU").includes(needle))
    && (status === "all" || scheduleState(cell).tone === status));
}

export function scheduleTime(value?: string) {
  return value?.match(/\d{2}:\d{2}/)?.[0] || "—";
}

export function employeeInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("");
}
