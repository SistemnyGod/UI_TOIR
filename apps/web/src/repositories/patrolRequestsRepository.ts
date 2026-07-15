import { patrolResults, serviceRequests } from "../data";
import { ApiClient, type ApiRequestOptions } from "../api/client";
import type { CreatePatrolRequestDto, PatrolRequestDto } from "../api/contracts";
import {
  createServiceRequestDraft,
  isServiceRequestList,
  type RequestModalState,
} from "../domain/serviceRequests";
import type { CreateServiceRequestPayload, DataSourceMode, ServiceRequest } from "../types";

export const patrolRequestsStorageKey = "patrol360.patrolRequests";
export const patrolRequestsFallback = serviceRequests;
const patrolRequestPageSize = 500;

export interface PatrolRequestFilterOptions {
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
    async getPatrolRequests(filters: PatrolRequestFilterOptions = {}, options: ApiRequestOptions = {}) {
      const requests = await getAllPatrolRequests(client, filters, options);
      return requests.map(mapPatrolRequest);
    },

    async createPatrolRequest(payload: CreateServiceRequestPayload) {
      const request = await client.post<PatrolRequestDto, CreatePatrolRequestDto>("/api/v1/patrol-requests", {
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

async function getAllPatrolRequests(client: ApiClient, filters: PatrolRequestFilterOptions, options: ApiRequestOptions) {
  const requests: PatrolRequestDto[] = [];
  let page = 1;

  while (true) {
    const pageRequests = await client.get<PatrolRequestDto[]>(
      `/api/v1/patrol-requests${buildPatrolRequestQuery(filters, page)}`,
      options,
    );
    requests.push(...pageRequests);

    if (pageRequests.length < patrolRequestPageSize) {
      return requests;
    }

    page += 1;
  }
}

function mapPatrolRequest(request: PatrolRequestDto): ServiceRequest {
  return {
    id: request.id,
    assignmentId: request.assignmentId ?? undefined,
    requestKind: "patrol-assignment",
    title: request.number,
    status: mapPatrolRequestStatus(request.status),
    priority: "Средний" as ServiceRequest["priority"],
    sourceResultId: request.sourceResultId ?? "",
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
    dueAt: request.scheduledTime ?? "",
    responsible: request.employeeName,
    description: request.description,
    timeline: [`${request.number}: ${request.status}`],
  };
}

function buildPatrolRequestQuery(filters: PatrolRequestFilterOptions, page: number) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(patrolRequestPageSize) });
  if (filters.employeeId) query.set("employeeId", filters.employeeId);
  if (filters.routeId) query.set("routeId", filters.routeId);
  if (filters.status) query.set("status", filters.status);
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);
  if (filters.query) query.set("query", filters.query);
  return `?${query.toString()}`;
}

function mapPatrolRequestStatus(status: string): ServiceRequest["status"] {
  const normalized = status.trim().toLowerCase();
  if (normalized === "закрыта" || normalized === "закрыто" || normalized === "завершена" || normalized === "завершено" || normalized === "отменена" || normalized === "cancelled" || normalized === "completed" || normalized === "closed") {
    return "Закрыта";
  }

  if (normalized === "в работе" || normalized === "inprogress" || normalized === "in progress") {
    return "В работе";
  }

  if (normalized === "назначена" || normalized === "отправлена" || normalized === "assigned" || normalized === "sent") {
    return "Назначена";
  }

  return "Новая";
}
