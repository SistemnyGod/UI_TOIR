import type { ActivePatrol, ServiceRequest } from "../../../types";
import type { ShiftTimeSettings } from "./assignmentTypes";
import { assignmentStatusText } from "./assignmentUtils";

export interface AssignmentHistoryEvent {
  id: string;
  meta: string;
  route: string;
  sortAt: number;
  status: string;
  title: string;
}

export interface CalendarDay {
  date: Date;
  inCurrentMonth: boolean;
  value: string;
}

export function createAssignmentHistoryEvents(assignment: ActivePatrol): AssignmentHistoryEvent[] {
  const events: AssignmentHistoryEvent[] = [];
  const startedAt = assignment.startedAt || assignment.startedAtIso
    ? formatAssignmentEventTime(assignment.startedAt, assignment.startedAtIso)
    : undefined;
  const plannedAt = formatAssignmentEventTime(assignment.plannedAt ?? assignment.eta, assignment.plannedAtIso);
  const finishedAt = assignment.finishedAt || assignment.finishedAtIso
    ? formatAssignmentEventTime(assignment.finishedAt, assignment.finishedAtIso)
    : undefined;

  if (finishedAt) {
    const plannedTimestamp = parseAssignmentEventTime(assignment.plannedAtIso, assignment.plannedAt ?? assignment.eta);
    const finishedTimestamp = parseAssignmentEventTime(assignment.finishedAtIso, assignment.finishedAt);
    const canUsePlannedAsFallback = plannedTimestamp > 0 && finishedTimestamp > 0 && plannedTimestamp <= finishedTimestamp;
    const startMeta = startedAt ? `Начато: ${startedAt}` : canUsePlannedAsFallback ? `План: ${plannedAt}` : "Старт не зафиксирован";
    events.push({
      id: `assignment-${assignment.id}-finished`,
      meta: `${startMeta} · Завершено: ${finishedAt}`,
      route: assignment.route,
      sortAt: parseAssignmentEventTime(assignment.finishedAtIso, assignment.finishedAt),
      status: "Завершено",
      title: "Обход завершен",
    });
  }

  if (startedAt) {
    events.push({
      id: `assignment-${assignment.id}-started`,
      meta: `Начато: ${startedAt}`,
      route: assignment.route,
      sortAt: parseAssignmentEventTime(assignment.startedAtIso, assignment.startedAt),
      status: finishedAt ? "До завершения" : "В работе",
      title: "Обход начат",
    });
  }

  if (events.length === 0) {
    events.push({
      id: `assignment-${assignment.id}-planned`,
      meta: `План: ${plannedAt}`,
      route: assignment.route,
      sortAt: parseAssignmentEventTime(assignment.plannedAtIso, assignment.plannedAt ?? assignment.eta),
      status: assignmentStatusText(assignment.status),
      title: "Назначение создано",
    });
  }

  return events;
}

export function formatAssignmentActionTime(assignment: ActivePatrol) {
  if (assignment.finishedAt || assignment.finishedAtIso) {
    return `Завершено: ${formatAssignmentEventTime(assignment.finishedAt, assignment.finishedAtIso)}`;
  }

  if (assignment.startedAt || assignment.startedAtIso) {
    return `Начато: ${formatAssignmentEventTime(assignment.startedAt, assignment.startedAtIso)}`;
  }

  return `План: ${formatAssignmentEventTime(assignment.plannedAt ?? assignment.eta, assignment.plannedAtIso)}`;
}

export function formatAssignmentEventTime(displayValue?: string, isoValue?: string) {
  if (displayValue && displayValue !== "-") return displayValue;
  if (isoValue) return formatDateTimeLabel(isoValue);
  return "время не указано";
}

export function parseAssignmentEventTime(isoValue?: string, displayValue?: string) {
  if (isoValue) {
    const parsedIso = Date.parse(isoValue);
    if (Number.isFinite(parsedIso)) return parsedIso;
  }

  const parsedDisplay = displayValue ? parseRuDateTime(displayValue) : 0;
  return Number.isFinite(parsedDisplay) ? parsedDisplay : 0;
}

export function parseRequestScheduledAt(request: ServiceRequest) {
  const scheduledTime = request.scheduledTime || "00:00";
  const parsed = Date.parse(`${request.scheduledDate}T${scheduledTime}:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRuDateTime(value: string) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2})$/);
  if (!match) return 0;

  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5])).getTime();
}

export function formatDateTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function toDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatMonthLabel(value: Date) {
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatPeriodLabel(dateFrom: string, dateTo: string) {
  if (dateFrom && dateTo) return dateFrom === dateTo ? formatDate(dateFrom) : `${formatDate(dateFrom)} - ${formatDate(dateTo)}`;
  if (dateFrom) return `с ${formatDate(dateFrom)}`;
  if (dateTo) return `по ${formatDate(dateTo)}`;
  return "Все даты";
}

export function parseDateKey(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function addMonths(value: Date, offset: number) {
  return new Date(value.getFullYear(), value.getMonth() + offset, 1);
}

export function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildCalendarDays(month: Date): CalendarDay[] {
  const start = startOfMonth(month);
  const mondayOffset = (start.getDay() + 6) % 7;
  const firstVisibleDate = new Date(start);
  firstVisibleDate.setDate(start.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisibleDate);
    date.setDate(firstVisibleDate.getDate() + index);

    return {
      date,
      inCurrentMonth: date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear(),
      value: toDateInputValue(date),
    };
  });
}

export function normalizeDateRange(from: string, to: string) {
  if (!from || !to) return { from, to };
  return from <= to ? { from, to } : { from: to, to: from };
}

export function getCalendarDayClass(value: string, inCurrentMonth: boolean, from: string, to: string) {
  const range = normalizeDateRange(from, to);
  const classes = ["date-range-calendar-day"];

  if (!inCurrentMonth) classes.push("outside");
  if (value === toDateInputValue(new Date())) classes.push("today");
  if (value === range.from) classes.push("selected", "range-start");
  if (range.to && value === range.to) classes.push("selected", "range-end");
  if (range.from && range.to && value > range.from && value < range.to) classes.push("in-range");

  return classes.join(" ");
}

export function shiftText(value: string) {
  return isNightShift(value) ? "3 смена" : "1 смена";
}

export function shiftTime(value: string, settings: ShiftTimeSettings) {
  return isNightShift(value)
    ? formatShiftRange(settings.nightStart, settings.nightEnd)
    : formatShiftRange(settings.dayStart, settings.dayEnd);
}

export function shiftStartTime(value: string, settings: ShiftTimeSettings) {
  return isNightShift(value) ? settings.nightStart : settings.dayStart;
}

export function formatShiftRange(start: string, end: string) {
  return `${start} - ${end}`;
}

function isNightShift(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("н") || normalized.includes("ноч");
}

export function employeeStatusText(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "в обходе") return "В обходе";
  if (normalized === "нет связи" || normalized === "офлайн") return "Офлайн";
  if (normalized === "перерыв") return "Перерыв";
  return "Онлайн";
}
