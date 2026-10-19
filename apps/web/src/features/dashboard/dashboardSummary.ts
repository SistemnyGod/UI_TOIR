import type { ActivePatrol, PatrolResult, ServiceRequest } from "../../types";
import { isTerminalPatrolRequestStatus } from "../../domain/patrolRequestStatus";
import { parseResultTime, resultHasIssue } from "../patrol/results/resultPresentation";

export type DashboardPeriod = "week" | "month";
export interface DashboardRange {
  from: Date;
  end: Date;
  through: Date;
  dateFrom: string;
  dateTo: string;
  label: string;
}
export interface DashboardPoint {
  key: string;
  point: string;
  route: string;
  count: number;
  latest: PatrolResult;
  results: PatrolResult[];
}
export interface DashboardReport {
  key: string;
  latest: PatrolResult;
  hasIssue: boolean;
  results: PatrolResult[];
}
export interface DashboardSummary {
  completed: number;
  withIssues: number;
  problemPoints: DashboardPoint[];
  latestReports: DashboardReport[];
}
export interface DashboardPlanItem {
  id: string;
  requestId?: string;
  time: string;
  timestamp: number;
  route: string;
  employee: string;
  assigned: boolean;
  status: string;
}

export function dashboardDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dashboardRange(period: DashboardPeriod, now = new Date()): DashboardRange {
  const from = new Date(now.getFullYear(), now.getMonth(), period === "month" ? 1 : now.getDate());
  if (period === "week") from.setDate(from.getDate() - (from.getDay() + 6) % 7);
  const end = period === "month" ? new Date(from.getFullYear(), from.getMonth() + 1, 0) : new Date(from);
  if (period === "week") end.setDate(end.getDate() + 6);
  const short = (date: Date) => date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(/\./g, "");
  const label = period === "month"
    ? from.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(/\s*г\.$/, "")
    : `${short(from)} — ${short(end)} ${end.getFullYear()}`;
  return { from, end, through: now, dateFrom: dashboardDayKey(from), dateTo: dashboardDayKey(now), label };
}

export function dashboardResultTime(result: PatrolResult) {
  for (const value of [result.actualAt, result.finishedAt, result.startedAt, result.plannedAt]) {
    const timestamp = parseResultTime(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function reportKey(result: PatrolResult) {
  return result.assignmentId || JSON.stringify([result.employeeId || result.employee, result.routeId || result.route, result.plannedAt]);
}

export function dashboardPointKey(result: PatrolResult) {
  // Legacy reports without an ID must not merge equally named points on different routes.
  return result.pointId ? `point:${result.pointId}` : JSON.stringify([result.routeId || result.route, result.point]);
}

export function buildLatestAssignmentResults(results: PatrolResult[]) {
  const latest = new Map<string, PatrolResult>();
  for (const result of results) {
    const key = reportKey(result);
    const previous = latest.get(key);
    if (!previous || dashboardResultTime(result) > dashboardResultTime(previous)) latest.set(key, result);
  }
  return [...latest.values()].sort((a, b) => dashboardResultTime(b) - dashboardResultTime(a));
}

export function buildDashboardSummary(results: PatrolResult[], range: DashboardRange): DashboardSummary {
  const unique = new Map(results.map((result) => [result.id, result]));
  const inPeriod = [...unique.values()].filter((result) => {
    const time = dashboardResultTime(result);
    return time >= range.from.getTime() && time <= range.through.getTime();
  }).sort((a, b) => dashboardResultTime(b) - dashboardResultTime(a) || a.id.localeCompare(b.id));
  const reports = new Map<string, DashboardReport>();
  const points = new Map<string, DashboardPoint>();
  for (const result of inPeriod) {
    const key = reportKey(result);
    const report = reports.get(key) ?? { key, latest: result, hasIssue: false, results: [] };
    report.results.push(result);
    report.hasIssue ||= resultHasIssue(result);
    reports.set(key, report);
    const pointKey = dashboardPointKey(result);
    const point = points.get(pointKey) ?? { key: pointKey, point: result.point, route: result.route, latest: result, count: 0, results: [] };
    point.results.push(result);
    if (resultHasIssue(result)) {
      if (point.count === 0) point.latest = result;
      point.count++;
    }
    points.set(pointKey, point);
  }
  return {
    completed: reports.size,
    withIssues: [...reports.values()].filter((report) => report.hasIssue).length,
    problemPoints: [...points.values()].filter((point) => point.count > 0)
      .sort((a, b) => b.count - a.count || dashboardResultTime(b.latest) - dashboardResultTime(a.latest) || a.key.localeCompare(b.key)),
    latestReports: [...reports.values()].slice(0, 3),
  };
}

export function isDashboardPatrolInProgress(patrol: ActivePatrol) {
  return ["В пути", "Задержка", "Нет связи", "Завершает"].includes(patrol.status);
}

export function buildDashboardPlan(requests: ServiceRequest[], patrols: ActivePatrol[], now = new Date()) {
  const today = dashboardDayKey(now);
  const items: DashboardPlanItem[] = [];
  const requestIds = new Set<string>();
  for (const request of requests) {
    if (isTerminalPatrolRequestStatus(request.status) || request.isCancelled || request.scheduledDate !== today) continue;
    const timestamp = Date.parse(`${today}T${request.scheduledTime || "00:00"}`);
    if (!Number.isFinite(timestamp)) continue;
    requestIds.add(request.id);
    const assigned = Boolean(request.employeeId || request.employee?.trim());
    items.push({ id: `request:${request.id}`, requestId: request.id, time: request.scheduledTime || "—", timestamp, route: request.route, employee: request.employee?.trim() || (assigned ? "Сотрудник не указан" : "Не назначен"), assigned, status: request.status });
  }
  for (const patrol of patrols) {
    if (!["Запланирован", "Ожидает"].includes(patrol.status) || (patrol.patrolRequestId && requestIds.has(patrol.patrolRequestId))) continue;
    const timestamp = parseResultTime(patrol.plannedAtIso || patrol.plannedAt);
    if (!Number.isFinite(timestamp) || dashboardDayKey(new Date(timestamp)) !== today) continue;
    const assigned = Boolean(patrol.employeeId || patrol.employee?.trim());
    items.push({ id: `assignment:${patrol.id}`, time: new Date(timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), timestamp, route: patrol.route, employee: patrol.employee?.trim() || (assigned ? "Сотрудник не указан" : "Не назначен"), assigned, status: patrol.status });
  }
  return items.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export function dashboardShortName(name: string) {
  const [last, ...rest] = name.trim().split(/\s+/);
  return [last, rest.map((part) => `${part[0]}.`).join("")].filter(Boolean).join(" ") || "Не указан";
}
