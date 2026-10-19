import type { ResultFilterOptions } from "../../../repositories/resultsRepository";
import type { PatrolResult, ResultMode, RouteDirectoryItem } from "../../../types";
import type { DurationSummary, ResultGroup } from "./resultTypes";
import { resultHasIssue } from "./resultPresentation";

const MIN_VALID_PATROL_DURATION_MINUTES = 1;
const MAX_VALID_PATROL_DURATION_MINUTES = 12 * 60;

export function buildMetrics(groups: ResultGroup[]) {
  const total = groups.length;
  const issues = groups.filter((group) => group.issuePoints > 0 || group.issues > 0).length;
  const withPhotos = groups.filter((group) => group.photos > 0).length;
  const clean = total - issues;
  const validDurations = groups.map((group) => group.duration.minutes).filter((minutes): minutes is number => typeof minutes === "number");
  const excludedDurations = total - validDurations.length;
  const averageDuration =
    validDurations.length > 0 ? formatDuration(Math.round(validDurations.reduce((sum, value) => sum + value, 0) / validDurations.length)) : "нет данных";
  const durationQualityLabel = excludedDurations > 0
    ? `${validDurations.length} из ${total}; исключено ${excludedDurations}`
    : `${validDurations.length} из ${total} валидных длительностей`;

  return { averageDuration, clean, durationQualityLabel, excludedDurations, issues, total, validDurationCount: validDurations.length, withPhotos };
}

export function buildCounters(groups: ResultGroup[]): Record<ResultMode, number> {
  return {
    all: groups.length,
    issues: groups.filter((group) => group.issuePoints > 0 || group.issues > 0).length,
    late: groups.filter(isLateGroup).length,
    photos: groups.filter((group) => group.photos > 0).length,
    noPhotos: groups.filter((group) => group.photos === 0).length,
  };
}

export function filterGroups(groups: ResultGroup[], mode: ResultMode, query: string, route = "all") {
  const normalizedQuery = normalizeText(query);

  return groups.filter((group) => {
    const matchesRoute = route === "all" || group.routeId === route || group.route === route;
    const matchesMode =
      mode === "all" ||
      (mode === "issues" && (group.issuePoints > 0 || group.issues > 0)) ||
      (mode === "late" && isLateGroup(group)) ||
      (mode === "photos" && group.photos > 0) ||
      (mode === "noPhotos" && group.photos === 0);
    const haystack = normalizeText([group.route, group.territory, group.employee, group.shift, group.comment, ...group.results.flatMap((result) => [result.point, result.comment, result.issueType])].join(" "));
    return matchesRoute && matchesMode && (!normalizedQuery || haystack.includes(normalizedQuery));
  });
}

export function buildResultApiFilters(mode: ResultMode, route: string, query: string): ResultFilterOptions {
  const filters: ResultFilterOptions = {};
  if (mode === "issues") {
    filters.status = "issue";
  } else if (mode === "late") {
    filters.status = "late";
  } else if (mode === "photos") {
    filters.hasPhotos = true;
  } else if (mode === "noPhotos") {
    filters.hasPhotos = false;
  }

  if (route !== "all") {
    filters.routeId = route;
  }

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    filters.query = normalizedQuery;
  }

  return filters;
}

export function buildRouteOptions(groups: ResultGroup[], routeDirectory: RouteDirectoryItem[]) {
  const routes = new Map<string, string>();
  routeDirectory.forEach((route) => {
    if (route.id) {
      routes.set(route.id, route.name);
    }
  });

  groups.forEach((group) => {
    if (group.routeId) {
      routes.set(group.routeId, group.route);
    }
  });

  return Array.from(routes, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

export function buildExportFilters(group: ResultGroup | undefined, mode: ResultMode, route: string, query: string): ResultFilterOptions {
  const assignmentId = group?.results.find((result) => result.assignmentId)?.assignmentId;
  if (assignmentId) {
    return { assignmentId };
  }

  const filters: ResultFilterOptions = {};
  if (mode === "issues") {
    filters.status = "issue";
  } else if (mode === "late") {
    filters.status = "late";
  } else if (mode === "photos") {
    filters.hasPhotos = true;
  } else if (mode === "noPhotos") {
    filters.hasPhotos = false;
  }

  if (route !== "all") {
    filters.routeId = group?.routeId ?? route;
  }

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    filters.query = normalizedQuery;
  }

  return filters;
}

export function buildResultGroups(results: PatrolResult[]): ResultGroup[] {
  const buckets = new Map<string, PatrolResult[]>();

  results.forEach((result) => {
    const key = result.assignmentId || `${result.employeeId || result.employee}:${result.routeId || result.route}:${result.plannedAt}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(result);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries())
    .map(([id, groupResults]) => {
      const sorted = [...groupResults].sort((left, right) => parseDate(left.actualAt) - parseDate(right.actualAt));
      const first = sorted[0];
      const okPoints = sorted.filter((result) => !isIssueResult(result)).length;
      const issuePoints = sorted.length - okPoints;
      const latePoints = sorted.filter(isLateResult).length;
      const photos = sorted.reduce((sum, result) => sum + getPhotoCount(result), 0);
      const firstScanAt = firstUseful(sorted[0]?.actualAt);
      const lastScanAt = firstUseful(sorted[sorted.length - 1]?.actualAt);
      const startedAt = firstUseful(first?.startedAt) ?? firstScanAt;
      const finishedAt = firstUseful(first?.finishedAt) ?? lastScanAt;
      const duration = summarizeDuration(startedAt, finishedAt);

      return {
        id,
        status: issuePoints > 0 ? "issue" : latePoints > 0 ? "late" : "ok",
        route: first?.route || "Маршрут не указан",
        routeId: first?.routeId,
        territory: first?.territory || "Территория не указана",
        employee: first?.employee || "Сотрудник не указан",
        employeeId: first?.employeeId || "",
        shift: displayShift(first?.shift),
        plannedAt: first?.plannedAt,
        startedAt,
        finishedAt,
        firstScanAt,
        lastScanAt,
        duration,
        photos,
        issues: issuePoints,
        points: sorted.length,
        okPoints,
        issuePoints,
        comment: firstUseful(first?.comment),
        results: sorted,
      };
    })
    .sort((left, right) => sortableTime(right) - sortableTime(left));
}

export function summarizeDuration(start?: string, finish?: string): DurationSummary {
  const started = parseDate(start);
  const finished = parseDate(finish);
  const minutes = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, Math.round((finished - started) / 60000)) : undefined;

  if (minutes === undefined) {
    return { label: "нет данных", hint: "Нет времени начала или окончания", tone: "muted" };
  }

  if (minutes < MIN_VALID_PATROL_DURATION_MINUTES || minutes > MAX_VALID_PATROL_DURATION_MINUTES) {
    return { label: "нет данных", hint: "Длительность вне допустимого диапазона", tone: "warning" };
  }

  return { label: formatDuration(minutes), hint: "По времени первой и последней фиксации", minutes, tone: "ok" };
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes < 60) {
    return `${totalMinutes} мин`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function getPhotoCount(result: PatrolResult): number {
  return Math.max(Number(result.photos) || 0, result.attachments?.length ?? 0);
}

function isIssueResult(result: PatrolResult): boolean {
  return resultHasIssue(result);
}

function isLateResult(result: PatrolResult): boolean {
  const status = normalizeText(result.status);
  const deviation = Number.parseInt(result.deviation, 10);

  return status.includes("late") || status.includes("проср") || Number.isFinite(deviation) && deviation > 0;
}

function isLateGroup(group: ResultGroup): boolean {
  return group.status === "late" || group.results.some(isLateResult);
}

function sortableTime(group: ResultGroup): number {
  const candidates = [group.lastScanAt, group.finishedAt, group.startedAt, group.plannedAt];

  for (const value of candidates) {
    const parsed = parseDate(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function isUsefulText(value?: string | null): boolean {
  const normalized = normalizeText(value);
  return Boolean(normalized && normalized !== "нет" && normalized !== "нет данных" && normalized !== "без комментария" && normalized !== "-");
}

function firstUseful(value?: string | null) {
  return isUsefulText(value) ? value ?? undefined : undefined;
}

export function displayShift(value?: string | null): string {
  const normalized = normalizeText(value);
  if (normalized.includes("night") || normalized.includes("ноч")) {
    return "Ночь";
  }

  return "День";
}

function parseDate(value?: string | null): number {
  if (!value) return Number.NaN;

  const normalized = value.replace(",", "");
  const match = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

