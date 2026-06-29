import type { ActivePatrol, DataSourceMode, ServiceRequest } from "../../../types";

export function assignmentStatusText(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("отмен")) return "Отменено";
  if (normalized.includes("завершено")) return "Завершено";
  if (normalized.includes("зад") || value === "Задержка") return "Просрочено";
  if (normalized.includes("завершает")) return "Проверка";
  if (normalized.includes("ож") || normalized.includes("назнач") || normalized.includes("заплан")) return "Ожидает начала";
  return "Выполняется";
}

export function assignmentStatusTone(value: string) {
  const text = assignmentStatusText(value);
  if (text === "Отменено" || text === "Просрочено") return "danger";
  if (text === "Ожидает начала" || text === "Проверка") return "warning";
  return "success";
}

export function isAssignmentCurrent(assignment: ActivePatrol) {
  const status = assignment.status.toLowerCase();
  return !status.includes("заверш") && !status.includes("отмен") && !status.includes("закры");
}

export function isRequestCurrent(request: ServiceRequest) {
  const status = request.status.toLowerCase();
  return !status.includes("закры") && !status.includes("отмен");
}

export function priorityText(value: string) {
  if (value.includes("Вы") || value === "Высокий") return "Высокий";
  if (value.includes("Сред") || value === "Средний") return "Средний";
  return "Обычный";
}

export function isAssignableRequest(request: ServiceRequest) {
  return request.status === "Новая" || request.status === "В работе";
}

export function shouldCreateAssignmentAfterRequest({
  dataSourceMode,
  hasSelectedRequest,
}: {
  dataSourceMode: DataSourceMode;
  hasSelectedRequest: boolean;
}) {
  return dataSourceMode !== "api" || hasSelectedRequest;
}

