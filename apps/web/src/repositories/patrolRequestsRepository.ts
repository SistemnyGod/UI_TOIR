import { patrolResults, serviceRequests } from "../data";
import { ApiClient, type ApiRequestOptions } from "../api/client";
import type { CreatePatrolRequestDto, PatrolRequestDto } from "../api/contracts";
import {
  createServiceRequestDraft,
  isServiceRequestList,
  type RequestModalState,
} from "../domain/serviceRequests";
import { isTerminalPatrolRequestStatus } from "../domain/patrolRequestStatus";
import type { CreateServiceRequestPayload, DataSourceMode, ServiceRequest } from "../types";

export const patrolRequestsStorageKey = "patrol360.patrolRequests";
export const patrolRequestsFallback = serviceRequests;
const patrolRequestPageSize = 200;

export interface PatrolRequestFilterOptions {
  statusGroup?: string;
  employeeId?: string;
  routeId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  query?: string;
}
export { isServiceRequestList };

export function resolveServiceRequests({
  apiRequests,
  dataSourceMode,
  localRequests,
}: {
  apiRequests: ServiceRequest[];
  dataSourceMode: DataSourceMode;
  localRequests: ServiceRequest[];
}) {
  return dataSourceMode === "api" ? apiRequests : localRequests;
}

export function createLocalPatrolRequest({
  payload,
  requestModal,
  requests,
}: {
  payload: CreateServiceRequestPayload;
  requestModal: RequestModalState;
  requests: ServiceRequest[];
}) {
  const sourceResult =
    requestModal?.kind === "create" && requestModal.sourceResultId
      ? patrolResults.find((result) => result.id === requestModal.sourceResultId)
      : undefined;
  const request = createServiceRequestDraft({
    payload,
    sourceResult,
    existingCount: requests.length,
  });

  return {
    request,
    requests: [request, ...requests],
  };
}

export function createApiPatrolRequestsRepository({
  baseUrl,
  fetcher,
}: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}) {
  const client = new ApiClient({ baseUrl, fetcher });

  return {
    async getPatrolRequest(id: string, options: ApiRequestOptions = {}) {
      const request = await client.get<PatrolRequestDto>(`/api/v1/patrol-requests/${encodeURIComponent(id)}`, options);
      return mapPatrolRequest(request);
    },
    async getPatrolRequestPage(filters: PatrolRequestFilterOptions = {}, paging = { page: 1, pageSize: 50 }, options: ApiRequestOptions = {}) {
      const rows = await client.get<PatrolRequestDto[]>(`/api/v1/patrol-requests${buildPatrolRequestQuery(filters, paging.page, paging.pageSize)}`, options);
      return { rows: rows.map(mapPatrolRequest), hasMore: rows.length === paging.pageSize };
    },
    async getPatrolRequests(filters: PatrolRequestFilterOptions = {}, options: ApiRequestOptions = {}) {
      const requests = await getAllPatrolRequestPages(client, filters, options);
      return requests.map(mapPatrolRequest);
    },

    async createPatrolRequest(payload: CreateServiceRequestPayload) {
      const request = await client.post<PatrolRequestDto, CreatePatrolRequestDto>("/api/v1/patrol-requests", {
        clientRequestId: payload.clientRequestId,
        employeeId: payload.employeeId,
        employeeName: payload.employee,
        routeId: payload.routeId,
        routeName: payload.route,
        sourceResultId: payload.sourceResultId,
        scheduledDate: payload.scheduledDate,
        scheduledTime: payload.scheduledTime || null,
        plannedAt: payload.plannedAt ?? null,
        shift: payload.shift ?? null,
        notifyEmployee: payload.notifyEmployee,
        notificationText: payload.notificationText,
        description: payload.description,
      });

      return mapPatrolRequest(request);
    },
  };
}

async function getAllPatrolRequestPages(client: ApiClient, filters: PatrolRequestFilterOptions, options: ApiRequestOptions) {
  const requests: PatrolRequestDto[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await client.get<PatrolRequestDto[]>(`/api/v1/patrol-requests${buildPatrolRequestQuery(filters, page)}`, options);
    requests.push(...batch);
    if (batch.length < patrolRequestPageSize) return requests;
  }
}

function mapPatrolRequest(request: PatrolRequestDto): ServiceRequest {
  const status = mapPatrolRequestStatus(request.status);
  return {
    id: request.id,
    assignmentId: request.assignmentId ?? undefined,
    requestKind: "patrol-assignment",
    title: request.number,
    status,
    priority: "Средний" as ServiceRequest["priority"],
    sourceResultId: request.sourceResultId ?? "",
    resultId: request.resultId ?? undefined,
    source: "API",
    employeeId: request.employeeId ?? undefined,
    routeId: request.routeId ?? undefined,
    route: request.routeName,
    point: "",
    employee: request.employeeName,
    scheduledDate: request.scheduledDate,
    scheduledTime: request.scheduledTime ?? "",
    notifyEmployee: request.notifyEmployee,
    notificationText: request.notificationText,
    createdAt: request.createdAt,
    dueAt: formatRequestDate(request.scheduledDate),
    responsible: request.employeeName,
    description: request.description,
    timeline: [`${request.number}: ${status}`],
    cancellationReasonCode: request.cancellationReasonCode ?? undefined,
    cancellationReasonText: request.cancellationReasonText ?? undefined,
    cancelledAt: request.cancelledAt ?? undefined,
    cancelledByUserName: request.cancelledByUserName ?? undefined,
    isCancelled: isCancelledPatrolRequestStatus(request.status),
  };
}

function formatRequestDate(value: string) {
  if (typeof value !== "string" || !value) return "Не указано";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function buildPatrolRequestQuery(filters: PatrolRequestFilterOptions, page: number, pageSize = patrolRequestPageSize) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.employeeId) query.set("employeeId", filters.employeeId);
  if (filters.routeId) query.set("routeId", filters.routeId);
  if (filters.status) query.set("status", filters.status);
  if (filters.statusGroup) query.set("statusGroup", filters.statusGroup);
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);
  if (filters.query) query.set("query", filters.query);
  return `?${query.toString()}`;
}

function mapPatrolRequestStatus(status: string): ServiceRequest["status"] {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("cancel") || normalized.includes("отмен")) {
    return "Отменена";
  }
  if (isTerminalPatrolRequestStatus(status)) {
    return "Закрыта";
  }

  if (["в пути", "в работе", "in_progress", "inprogress", "in progress", "приостановлена", "приостановлено", "paused", "задержка", "delayed", "просрочена", "просрочено", "overdue", "требует решения диспетчера", "dispatcher_review"].includes(normalized)) {
    return "В работе";
  }

  if (["назначена", "назначено", "отправлена", "отправлено", "assigned", "sent", "dispatched", "принята", "принято", "accepted", "ожидает", "ожидает принятия", "waiting"].includes(normalized)) {
    return "Назначена";
  }

  return "Новая";
}

function isCancelledPatrolRequestStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized.includes("cancel") || normalized.includes("отмен");
}
