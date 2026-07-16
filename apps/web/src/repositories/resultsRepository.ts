import { patrolResults } from "../data";
import { ApiClient, buildApiUrl, type ApiRequestOptions } from "../api/client";
import type { ResultDetailDto, ResultListItemDto } from "../api/contracts";
import type { PatrolResult, PatrolResultAttachment } from "../types";

export const patrolResultsFallback = patrolResults;
export const resultPageSize = 100;

export function findPatrolResult(results: PatrolResult[], resultId: string) {
  return results.find((result) => result.id === resultId) ?? results[0];
}

export function isBackendResultId(resultId: string | undefined | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resultId ?? "");
}

export interface ResultFilterOptions {
  employeeId?: string;
  routeId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  assignmentId?: string;
  query?: string;
  hasPhotos?: boolean;
}

export interface ResultPage {
  hasMore: boolean;
  page: number;
  pageSize: number;
  results: PatrolResult[];
  total: number;
  totalPages: number;
}

interface ResultPageEnvelopeDto {
  items: Array<{
    assignmentId: string | null;
    resultId: string | null;
    results: ResultListItemDto[];
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
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
      const page = await getResultPage(client, filters, options);
      return page.results;
    },

    async getResultPage(filters: ResultFilterOptions = {}, options: ApiRequestOptions & { page?: number } = {}): Promise<ResultPage> {
      return getResultPage(client, filters, options);
    },

    async getResult(resultId: string, options: ApiRequestOptions = {}) {
      if (!isBackendResultId(resultId)) {
        throw new Error("Result id is not a backend API id");
      }

      const result = await client.get<ResultDetailDto>(`/api/v1/results/${resultId}`, options);
      return mapResult(result);
    },

    async exportResults(filters: ResultFilterOptions = {}, options: ApiRequestOptions = {}) {
      return client.download(`/api/v1/results/export${buildResultQuery(filters)}`, { method: "GET" }, options);
    },
  };
}

export async function downloadResultAttachment(attachment: PatrolResultAttachment) {
  const client = new ApiClient();
  return client.download(attachment.downloadUrl);
}

async function getResultPage(client: ApiClient, filters: ResultFilterOptions, options: ApiRequestOptions & { page?: number }): Promise<ResultPage> {
  const page = options.page ?? 1;
  const envelope = await client.get<ResultPageEnvelopeDto>(
    `/api/v3/results${buildResultQuery(filters, { page, pageSize: resultPageSize })}`,
    options,
  );

  return {
    hasMore: envelope.hasNext,
    page: envelope.page,
    pageSize: envelope.pageSize,
    // v3 preserves the server's group page boundary. Flatten only after the
    // complete group response has arrived, so a load-more never splits a patrol.
    results: envelope.items.flatMap((group) => group.results.map(mapResult)),
    total: envelope.total,
    totalPages: envelope.totalPages,
  };
}

function buildResultQuery(filters: ResultFilterOptions, paging?: { page: number; pageSize: number }) {
  const query = new URLSearchParams();

  if (filters.status) query.set("status", filters.status);
  if (filters.routeId) query.set("routeId", filters.routeId);
  if (filters.employeeId) query.set("employeeId", filters.employeeId);
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);
  if (filters.assignmentId) query.set("assignmentId", filters.assignmentId);
  if (filters.query) query.set("query", filters.query);
  if (filters.hasPhotos !== undefined) query.set("hasPhotos", String(filters.hasPhotos));
  if (paging) {
    query.set("page", String(paging.page));
    query.set("pageSize", String(paging.pageSize));
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function mapResult(result: ResultListItemDto | ResultDetailDto): PatrolResult {
  const plannedAt = formatDateTime(result.plannedAt);
  const actualAt = formatDateTime(result.actualAt);
  const startedAt = result.startedAt ? formatDateTime(result.startedAt) : undefined;
  const finishedAt = result.finishedAt ? formatDateTime(result.finishedAt) : undefined;
  const comment = normalizeComment(result.comment);

  return {
    id: result.id,
    assignmentId: result.assignmentId ?? undefined,
    status: normalizeStatus(result.status) as PatrolResult["status"],
    point: result.point,
    pointId: result.pointId ?? "",
    employee: result.employee,
    employeeId: result.employeeId ?? "",
    routeId: result.routeId ?? undefined,
    route: result.route,
    territory: result.territory,
    shift: normalizeShift(result.shift) as PatrolResult["shift"],
    plannedAt,
    actualAt,
    startedAt,
    finishedAt,
    deviation: result.deviation,
    comment,
    photos: Math.max(result.photos, "attachments" in result ? result.attachments.length : 0),
    issueType: normalizeIssueType(result.issueType),
    severity: normalizeSeverity(result.severity) as PatrolResult["severity"],
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
        : [`План: ${plannedAt}`, `Факт: ${actualAt}`, comment],
  };
}

function normalizeStatus(status: string) {
  const key = statusKey(status);
  if (key === "skipped") return "skipped";
  if (key === "manual") return "manual";

  if (key === "issue") return "Замечание";
  if (key === "late") return "Просрочено";
  if (key === "unconfirmed") return "Не подтверждено";

  return "Подтверждено";
}

function normalizeShift(shift: string) {
  const value = normalizeText(shift);
  if (value.includes("ноч") || value.includes("night")) return "Ночь";

  return "День";
}

function normalizeSeverity(severity: string) {
  const value = normalizeText(severity);

  if (!value || value === "-") return "-";
  if (value.includes("выс") || value.includes("high")) return "Высокая";
  if (value.includes("сред") || value.includes("medium")) return "Средняя";
  if (value.includes("низ") || value.includes("low")) return "Низкая";

  return "-";
}

function normalizeIssueType(issueType: string) {
  const value = issueType.trim();
  return value && value !== "-" ? value : "нет";
}

function normalizeComment(comment: string) {
  const value = comment.trim();
  return value && value !== "-" ? value : "без комментария";
}

function statusKey(status: string) {
  const value = normalizeText(status);

  if (value.includes("замеч") || value.includes("issue") || value.includes("problem")) return "issue";
  if (value.includes("проср") || value.includes("late") || value.includes("overdue")) return "late";
  if (value.includes("не подтверж") || value.includes("unconfirmed")) return "unconfirmed";

  if (value.includes("skipped") || value.includes("unavailable")) return "skipped";
  if (value.includes("manual")) return "manual";

  return "confirmed";
}

function normalizeText(value: string | undefined | null) {
  return String(value ?? "").trim().toLowerCase();
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
