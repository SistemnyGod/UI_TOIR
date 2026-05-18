import { patrolResults, serviceRequests } from "../data";
import { ApiClient } from "../api/client";
import type { CreatePatrolRequestDto, PatrolRequestDto } from "../api/contracts";
import {
  createServiceRequestDraft,
  isServiceRequestList,
  type RequestModalState,
} from "../domain/serviceRequests";
import type { CreateServiceRequestPayload, ServiceRequest } from "../types";

export const patrolRequestsStorageKey = "patrol360.patrolRequests";
export const patrolRequestsFallback = serviceRequests;
export { isServiceRequestList };

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

export function createApiPatrolRequestsRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    async createPatrolRequest(payload: CreateServiceRequestPayload) {
      const request = await client.post<PatrolRequestDto, CreatePatrolRequestDto>("/api/v1/patrol-requests", {
        employeeName: payload.employee,
        routeName: payload.route,
        scheduledDate: payload.scheduledDate,
        scheduledTime: payload.scheduledTime || null,
        notifyEmployee: payload.notifyEmployee,
        notificationText: payload.notificationText,
        description: payload.description,
      });

      return mapPatrolRequest(request);
    },
  };
}

function mapPatrolRequest(request: PatrolRequestDto): ServiceRequest {
  return {
    id: request.id,
    requestKind: "patrol-assignment",
    title: request.number,
    status: "Назначена" as ServiceRequest["status"],
    priority: "Средний" as ServiceRequest["priority"],
    sourceResultId: "",
    source: "API",
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
