import type { PatrolResult } from "../../../types";
import type { ResultGroup } from "./resultTypes";

const emptyTexts = new Set(["", "-", "нет", "none", "null", "нет данных", "без комментария", "без замечаний"]);
export function usefulResultText(value?: string | null) { return !emptyTexts.has((value ?? "").trim().toLowerCase()); }
export function getResultPointMeta(result: PatrolResult) {
  const status = (result.status ?? "").trim().toLowerCase();
  const issueType = (result.issueType ?? "").trim().toLowerCase();
  if (["skipped", "unavailable", "метка недоступна", "недоступна", "утеряна"].includes(status)
      || ["skipped", "unavailable", "метка недоступна", "недоступна", "утеряна"].includes(issueType)) return { key: "unavailable", label: "Метка недоступна" } as const;
  if (["issue", "problem", "failed", "замечание", "неисправно", "неисправен"].includes(status)
      || usefulResultText(issueType)) return { key: "issue", label: "Неисправно" } as const;
  return { key: "ok", label: "Исправно" } as const;
}
export function resultHasIssue(result: PatrolResult) { return getResultPointMeta(result).key !== "ok"; }
export function resultAttachmentCount(result: PatrolResult) { return Math.max(Number(result.photos) || 0, result.attachments?.length ?? 0); }
export function parseResultTime(value?: string | null) {
  if (!value) return NaN;
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:,?\s+(\d{2}):(\d{2}))?/);
  if (match) return new Date(+match[3], +match[2] - 1, +match[1], +(match[4] ?? 0), +(match[5] ?? 0)).getTime();
  return Date.parse(value);
}
export function resultDateTime(value?: string | null) {
  const parsed = parseResultTime(value);
  if (!Number.isFinite(parsed)) return { date: "Нет даты", time: "—" };
  const date = new Date(parsed);
  return { date: date.toLocaleDateString("ru-RU"), time: date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) };
}
export function resultShift(value: string) { return /night|ноч/i.test(value) ? "Ночь" : "День"; }
export function groupResultTime(group: ResultGroup) {
  for (const value of [group.lastScanAt, group.finishedAt, group.startedAt, group.plannedAt]) {
    const time = parseResultTime(value); if (Number.isFinite(time)) return time;
  }
  return 0;
}
export type ResultDatePeriod = "all" | "today" | "week" | "month";
export function resultDateRange(period: ResultDatePeriod, now = new Date()) {
  if (period === "all") return {};
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - (period === "week" ? 6 : period === "month" ? 29 : 0));
  const dayKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return { dateFrom: dayKey(from), dateTo: dayKey(now) };
}
export function filterResultJournal(groups: ResultGroup[], dateRange: { dateFrom?: string; dateTo?: string }, shift: string, order: string) {
  const from = dateRange.dateFrom ? new Date(`${dateRange.dateFrom}T00:00:00`).getTime() : -Infinity;
  const to = dateRange.dateTo ? new Date(`${dateRange.dateTo}T23:59:59.999`).getTime() : Infinity;
  return groups.filter((group) => {
    const time = groupResultTime(group);
    return time >= from && time <= to && (shift === "all" || resultShift(group.shift) === shift);
  }).sort((a, b) => (order === "oldest" ? 1 : -1) * (groupResultTime(a) - groupResultTime(b)) || a.id.localeCompare(b.id));
}

export function buildResultJournalCsv(groups: ResultGroup[]) {
  const cell = (value: string | number) => {
    let text = String(value); if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [["Дата", "Время", "Маршрут", "Сотрудник", "Смена", "Точки", "Замечания", "Медиа"], ...groups.map((group) => {
    const time = resultDateTime(group.lastScanAt ?? group.finishedAt ?? group.firstScanAt);
    return [time.date, time.time, group.route, group.employee, resultShift(group.shift), group.points, group.issuePoints, group.photos];
  })];
  return `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
}

export function buildPatrolReportCsv(groups: ResultGroup[]) {
  const rows = [["Дата", "Время", "Маршрут", "Сотрудник", "Смена", "Точка", "Состояние", "Комментарий", "Замечание", "Вложения"], ...groups.flatMap((group) => group.results.map((result) => {
    const time = resultDateTime(result.actualAt);
    return [time.date, time.time, group.route, group.employee, resultShift(group.shift), result.point, getResultPointMeta(result).label, usefulResultText(result.comment) ? result.comment : "", usefulResultText(result.issueType) ? result.issueType : "", (result.attachments ?? []).map((item) => item.fileName).join(", ")];
  }))];
  const cell = (value: string) => {
    const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
}
