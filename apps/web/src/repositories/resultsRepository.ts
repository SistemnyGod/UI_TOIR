import { patrolResults } from "../data";
import { ApiClient, buildApiUrl, type ApiRequestOptions } from "../api/client";
import type { ResultDetailDto, ResultListItemDto } from "../api/contracts";
import type { PatrolResult, ResultMode } from "../types";

export const patrolResultsFallback = patrolResults;

export interface ResultMetrics {
  total: number;
  issues: number;
  late: number;
  withoutPhotos: number;
}

export function filterPatrolResults(results: PatrolResult[], mode: ResultMode) {
  return results.filter((result) => {
    if (mode === "issues") return result.status === "Замечание" || result.status === "Не подтверждено";
    if (mode === "late") return result.status === "Просрочено";
    if (mode === "photos") return result.photos > 0;
    return true;
  });
}

export function getResultMetrics(results: PatrolResult[]): ResultMetrics {
  return {
    total: results.length,
    issues: results.filter((item) => item.status === "Замечание").length,
    late: results.filter((item) => item.status === "Просрочено").length,
    withoutPhotos: results.filter((item) => item.photos === 0).length,
  };
}

export function findPatrolResult(results: PatrolResult[], resultId: string) {
  return results.find((result) => result.id === resultId) ?? results[0];
}

export interface ResultFilterOptions {
  employeeId?: string;
  routeId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function createApiResultsRepository({
  baseUrl,
  fetcher,
}: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}) {
  const client = new ApiClient({ baseUrl, fetcher });

  return {
    async getResults(filters: ResultFilterOptions = {}, options: ApiRequestOptions = {}) {
      const query = buildResultQuery(filters);
      const results = await client.get<ResultListItemDto[]>(`/api/v1/results${query}`, options);
      return results.map(mapResult);
    },

    async getResult(resultId: string, options: ApiRequestOptions = {}) {
      const result = await client.get<ResultDetailDto>(`/api/v1/results/${resultId}`, options);
      return mapResult(result);
    },

    async exportResults(filters: ResultFilterOptions = {}, options: ApiRequestOptions = {}) {
      return client.download(`/api/v1/results/export${buildResultQuery(filters)}`, { method: "GET" }, options);
    },
  };
}

function buildResultQuery(filters: ResultFilterOptions) {
  const query = new URLSearchParams();

  if (filters.status) query.set("status", filters.status);
  if (filters.routeId) query.set("routeId", filters.routeId);
  if (filters.employeeId) query.set("employeeId", filters.employeeId);
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function mapResult(result: ResultListItemDto | ResultDetailDto): PatrolResult {
  return {
    id: result.id,
    assignmentId: result.assignmentId ?? undefined,
    status: normalizeStatus(result.status),
    point: result.point,
    pointId: result.pointId ?? "",
    employee: result.employee,
    employeeId: result.employeeId ?? "",
    routeId: result.routeId ?? undefined,
    route: result.route,
    territory: result.territory,
    shift: normalizeShift(result.shift),
    plannedAt: formatDateTime(result.plannedAt),
    actualAt: formatDateTime(result.actualAt),
    deviation: result.deviation,
    comment: result.comment,
    photos: Math.max(result.photos, "attachments" in result ? result.attachments.length : 0),
    issueType: result.issueType,
    severity: normalizeSeverity(result.severity),
    source: "mobile",
    attachments:
      "attachments" in result
        ? result.attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            sizeBytes: attachment.sizeBytes,
            createdAt: formatDateTime(attachment.createdAt),
            downloadUrl: buildApiUrl(`/api/v1/results/${result.id}/attachments/${attachment.id}`),
          }))
        : undefined,
    chronology:
      "chronology" in result && result.chronology.length > 0
        ? result.chronology
        : [`План: ${formatDateTime(result.plannedAt)}`, `Факт: ${formatDateTime(result.actualAt)}`, result.comment],
  };
}

function normalizeStatus(status: string): PatrolResult["status"] {
  if (status === "Замечание" || status === "Просрочено" || status === "Не подтверждено") {
    return status;
  }

  return "Подтверждено";
}

function normalizeShift(shift: string): PatrolResult["shift"] {
  return shift === "Ночь" ? "Ночь" : "День";
}

function normalizeSeverity(severity: string): PatrolResult["severity"] {
  if (severity === "Низкая" || severity === "Средняя" || severity === "Высокая") {
    return severity;
  }

  return "-";
}

function formatDateTime(value: string) {
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
