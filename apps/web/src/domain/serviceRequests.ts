import type { CreateServiceRequestPayload, PatrolResult, ServiceRequest } from "../types";

export type RequestModalState =
  | { kind: "view"; requestId: string }
  | { kind: "create"; sourceResultId?: string }
  | null;

export function isServiceRequestList(value: unknown): value is ServiceRequest[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ServiceRequest).id === "string" &&
        typeof (item as ServiceRequest).title === "string" &&
        typeof (item as ServiceRequest).status === "string" &&
        typeof (item as ServiceRequest).route === "string" &&
        typeof (item as ServiceRequest).employee === "string",
    )
  );
}

export function createServiceRequestDraft({
  payload,
  sourceResult,
  existingCount,
  now = new Date(),
}: {
  payload: CreateServiceRequestPayload;
  sourceResult?: PatrolResult;
  existingCount: number;
  now?: Date;
}): ServiceRequest {
  const requestNumber = String(existingCount + 1).padStart(3, "0");
  const createdAt = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const scheduledDateLabel = formatDateLabel(payload.scheduledDate);
  const scheduledAt = payload.scheduledTime ? `${scheduledDateLabel}, ${payload.scheduledTime}` : scheduledDateLabel;
  const employee = payload.employee || sourceResult?.employee || "Сотрудник не выбран";
  const route = payload.route || sourceResult?.route || "Маршрут не выбран";

  return {
    id: `REQ-DRAFT-${requestNumber}`,
    requestKind: "patrol-assignment",
    title: `Провести обход: ${route}`,
    status: "Новая",
    priority: "Средний",
    sourceResultId: sourceResult?.id ?? "manual",
    source: sourceResult ? `Создано из результата обхода №${sourceResult.id}` : "Создано оператором смены",
    route,
    point: sourceResult?.point ?? "Маршрут целиком",
    employee,
    scheduledDate: payload.scheduledDate,
    scheduledTime: payload.scheduledTime,
    notifyEmployee: payload.notifyEmployee,
    notificationText: payload.notificationText,
    createdAt,
    dueAt: scheduledAt,
    responsible: employee,
    description: payload.description || "Необходимо пройти назначенный обход территории.",
    timeline: [
      `${createdAt} — заявка создана оператором`,
      `${createdAt} — выбран сотрудник ${employee}`,
      `${createdAt} — выбран маршрут ${route}`,
      payload.notifyEmployee
        ? `${createdAt} — подготовлено уведомление сотруднику`
        : "Уведомление сотруднику отключено",
    ],
  };
}

function formatDateLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value || "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}
