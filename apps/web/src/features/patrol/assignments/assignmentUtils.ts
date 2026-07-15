import type { ActivePatrol, DataSourceMode, ServiceRequest } from "../../../types";
import { isTerminalPatrolRequestStatus } from "../../../domain/patrolRequestStatus";

export function assignmentStatusText(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("отмен") || normalized.includes("cancel")) return "Отменено";
  if (normalized.includes("завершено") || normalized.includes("completed") || normalized.includes("finished")) return "Завершено";
  if (normalized.includes("зад") || normalized.includes("проср") || normalized.includes("late") || normalized.includes("overdue") || value === "Задержка") return "Просрочено";
  if (normalized.includes("завершает")) return "Проверка";
  if (normalized.includes("ож") || normalized.includes("назнач") || normalized.includes("заплан") || normalized.includes("planned") || normalized.includes("waiting")) return "Ожидает начала";
  return "Выполняется";
}

export function assignmentStatusTone(value: string) {
  const text = assignmentStatusText(value);
  if (text === "Отменено" || text === "Просрочено") return "danger";
  if (text === "Ожидает начала" || text === "Проверка") return "warning";
  return "success";
}

export function isAssignmentCurrent(assignment: ActivePatrol) {
  const text = assignmentStatusText(assignment.status);
  return text !== "Завершено" && text !== "Отменено";
}

export function isRequestCurrent(request: ServiceRequest) {
  return !isTerminalPatrolRequestStatus(request.status);
}

export function priorityText(value: string) {
  if (value.includes("Вы") || value === "Высокий") return "Высокий";
  if (value.includes("Сред") || value === "Средний") return "Средний";
  return "Обычный";
}

export function isAssignableRequest(request: ServiceRequest) {
  if (request.assignmentId || isTerminalPatrolRequestStatus(request.status)) {
    return false;
  }

  return request.status === "Новая" || request.status === "В работе";
}

export function shouldCreateAssignmentAfterRequest({
  dataSourceMode,
  hasSelectedRequest,
  hasLinkedAssignment,
}: {
  dataSourceMode: DataSourceMode;
  hasSelectedRequest: boolean;
  hasLinkedAssignment?: boolean;
}) {
  if (dataSourceMode !== "api") return true;
  return hasSelectedRequest && !hasLinkedAssignment;
}
