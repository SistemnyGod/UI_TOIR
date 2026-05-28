import { assignableRoutes, employees } from "../data";
import { ApiClient, type ApiRequestOptions } from "../api/client";
import type {
  AssignmentCommandResultDto,
  AssignmentDto,
  CompleteAssignmentDto,
  CreateAssignmentDto,
  EmployeeDto,
  RouteDto,
} from "../api/contracts";
import type {
  ActivePatrol,
  CompleteAssignmentPayload,
  CreateAssignmentPayload,
  Employee,
  EmployeeDirectoryItem,
  RouteDirectoryItem,
  RouteOption,
} from "../types";

export const assignableEmployeesFallback = employees;
export const assignableRoutesFallback = assignableRoutes;

export interface AssignmentCommandResult {
  assignment: ActivePatrol;
  changed: boolean;
  message: string;
}

export function createApiAssignmentsRepository({
  baseUrl,
  fetcher,
}: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}) {
  const client = new ApiClient({ baseUrl, fetcher });

  return {
    async getAssignments(options: ApiRequestOptions = {}) {
      const assignments = await client.get<AssignmentDto[]>("/api/v1/assignments", options);
      return assignments.map(mapAssignment);
    },

    async getEmployees(options: ApiRequestOptions = {}) {
      const employees = await client.get<EmployeeDto[]>("/api/v1/employees", options);
      return employees.map(mapEmployeeDtoToAssignable);
    },

    async getRoutes(options: ApiRequestOptions = {}) {
      const routes = await client.get<RouteDto[]>("/api/v1/routes", options);
      return routes.map(mapRouteDtoToAssignable);
    },

    async createAssignment(payload: CreateAssignmentPayload) {
      const assignment = await client.post<AssignmentDto, CreateAssignmentDto>("/api/v1/assignments", mapCreateAssignmentPayload(payload));
      return mapAssignment(assignment);
    },

    async startAssignment(id: string) {
      const result = await client.post<AssignmentCommandResultDto>(`/api/v1/assignments/${id}/start`);
      return mapAssignmentCommandResult(result);
    },

    async cancelAssignment(id: string) {
      const result = await client.post<AssignmentCommandResultDto>(`/api/v1/assignments/${id}/cancel`);
      return mapAssignmentCommandResult(result);
    },

    async completeAssignment(id: string, payload?: CompleteAssignmentPayload) {
      const result = await client.post<AssignmentCommandResultDto, CompleteAssignmentDto>(
        `/api/v1/assignments/${id}/complete`,
        mapCompleteAssignmentPayload(payload),
      );
      return mapAssignmentCommandResult(result);
    },
  };
}

function mapCreateAssignmentPayload(payload: CreateAssignmentPayload): CreateAssignmentDto {
  return {
    comment: payload.comment,
    employeeId: payload.employeeId,
    notificationText: payload.notificationText,
    notifyEmployee: payload.notifyEmployee,
    patrolRequestId: payload.patrolRequestId,
    plannedAt: payload.plannedAt,
    plannedEndAt: payload.plannedEndAt,
    priority: payload.priority,
    routeId: payload.routeId,
    shift: payload.shift,
  };
}

function mapCompleteAssignmentPayload(payload?: CompleteAssignmentPayload): CompleteAssignmentDto {
  return {
    actualAt: payload?.actualAt,
    comment: payload?.comment,
    issueType: payload?.issueType,
    photoAttachments: payload?.photoAttachments,
    pointResults: payload?.pointResults,
    photos: payload?.photos,
    routePointId: payload?.routePointId,
    severity: payload?.severity,
    status: payload?.status,
  };
}

export function mapAssignment(assignment: AssignmentDto): ActivePatrol {
  return {
    id: assignment.id,
    patrolRequestId: assignment.patrolRequestId,
    employee: assignment.employeeName,
    employeeId: assignment.employeeId,
    routeId: assignment.routeId,
    route: assignment.routeName,
    zone: "территория из API",
    shift: normalizeShift(assignment.shift),
    currentPoint: assignment.startedAt ? "обход выполняется" : "ожидает старта",
    status: normalizeAssignmentStatus(assignment.status),
    progress: assignment.progressPercent,
    eta: assignment.eta || formatDateTime(assignment.plannedAt),
    deviation: assignment.finishedAt ? "закрыто" : "-",
    startedAt: assignment.startedAt ? formatDateTime(assignment.startedAt) : undefined,
  };
}

export function mapEmployeeToAssignable(employee: EmployeeDirectoryItem): Employee {
  return {
    id: employee.id,
    name: employee.fullName,
    role: employee.position,
    zone: employee.department || employee.zone,
    shift: normalizeShift(employee.shift),
    status: normalizeEmployeeStatus(employee.status),
    activity: employee.lastSeen || "-",
  };
}

export function mapRouteToAssignable(route: RouteDirectoryItem): RouteOption {
  return {
    id: route.id,
    name: route.name,
    zone: route.territory,
    duration: route.duration,
    distance: route.distance,
    points: route.points.length,
    controlPoints: route.points.filter((point) => point.requiresPhoto).length,
    priority: "Обычный",
    requiredEmployees: 1,
    loadedEmployees: 0,
  };
}

function mapEmployeeDtoToAssignable(employee: EmployeeDto): Employee {
  return {
    id: employee.id,
    name: employee.fullName,
    role: employee.position || "Сотрудник",
    zone: employee.department || "Без участка",
    shift: normalizeShift(employee.shift),
    status: normalizeEmployeeStatus(employee.status),
    activity: employee.lastSeenAt ? formatDateTime(employee.lastSeenAt) : "-",
  };
}

function mapRouteDtoToAssignable(route: RouteDto): RouteOption {
  const points = route.points ?? [];

  return {
    id: route.id,
    name: route.name,
    zone: route.territory || "Без территории",
    duration: route.duration || "-",
    distance: route.distance || "-",
    points: points.length,
    controlPoints: points.filter((point) => point.requiresPhoto).length,
    priority: "Обычный",
    requiredEmployees: 1,
    loadedEmployees: 0,
  };
}

function mapAssignmentCommandResult(result: AssignmentCommandResultDto): AssignmentCommandResult {
  return {
    assignment: mapAssignment(result.assignment),
    changed: result.changed,
    message: result.message,
  };
}

function normalizeShift(shift: string): ActivePatrol["shift"] {
  return shift === "Ночь" ? "Ночь" : "День";
}

function normalizeEmployeeStatus(status: string): Employee["status"] {
  if (status === "Офлайн") {
    return "Нет связи";
  }

  return "Свободен";
}

function normalizeAssignmentStatus(status: string): ActivePatrol["status"] {
  if (status === "В пути") return "В пути";
  if (status === "Задержка") return "Задержка";
  if (status === "Нет связи") return "Нет связи";
  if (status === "Завершает") return "Завершает";
  if (status === "Запланирован") return "Запланирован";
  if (status === "Завершено") return "Завершает";

  return "Ожидает";
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
