import type { ActivePatrol, RouteDirectoryItem, ServiceRequest } from "../types";

export function isActivePatrolList(value: unknown): value is ActivePatrol[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ActivePatrol).id === "string" &&
        typeof (item as ActivePatrol).employee === "string" &&
        typeof (item as ActivePatrol).route === "string" &&
        typeof (item as ActivePatrol).progress === "number",
    )
  );
}

export function createActivePatrolFromRequest({
  request,
  route,
  existingCount,
  now = new Date(),
}: {
  request: ServiceRequest;
  route?: RouteDirectoryItem;
  existingCount: number;
  now?: Date;
}): ActivePatrol {
  const points = route?.points ?? [];
  const startedAt = request.scheduledTime || formatTime(now);

  return {
    id: `patrol-local-${Date.now()}-${existingCount + 1}`,
    employee: request.employee,
    employeeId: "заявка",
    route: request.route,
    zone: route?.territory ?? "территория не указана",
    shift: "День",
    currentPoint: points[0]?.name ?? "Старт маршрута",
    status: "Ожидает",
    progress: 0,
    eta: request.scheduledTime || "по готовности",
    deviation: "—",
    startedAt,
    totalTime: "ожидает старта",
    checkpoints:
      points.length > 0
        ? points.map((point) => ({
            id: `${request.id}-${point.id}`,
            name: point.name,
            activatedAt: undefined,
            scannedAt: undefined,
            status: "Ожидает",
            comment: `Точка ожидает прохождения. Метка: ${point.tag}`,
            media: [],
          }))
        : [
            {
              id: `${request.id}-manual-point`,
              name: "Маршрут целиком",
              activatedAt: undefined,
              scannedAt: undefined,
              status: "Ожидает",
              comment: "Точки появятся после настройки маршрута.",
              media: [],
            },
          ],
    media: [],
  };
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
