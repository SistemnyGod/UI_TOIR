import type { RouteDirectoryItem, RouteFormPayload, RoutePoint, RoutePointFormPayload } from "../types";

export function isRouteDirectoryList(value: unknown): value is RouteDirectoryItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (route) =>
        typeof route === "object" &&
        route !== null &&
        typeof (route as RouteDirectoryItem).id === "string" &&
        typeof (route as RouteDirectoryItem).name === "string" &&
        Array.isArray((route as RouteDirectoryItem).points),
    )
  );
}

export function createRouteDraft({
  payload,
  existingCount,
}: {
  payload: RouteFormPayload;
  existingCount: number;
}): RouteDirectoryItem {
  return {
    id: `route-${Date.now()}-${existingCount + 1}`,
    name: payload.name.trim(),
    territory: payload.territory.trim() || "Территория не указана",
    status: payload.status,
    description: payload.description.trim() || "Описание маршрута не заполнено.",
    duration: payload.duration.trim() || "00:30",
    distance: payload.distance.trim() || "0 км",
    periodicity: payload.periodicity.trim() || "По заявке",
    points: [],
  };
}

export function updateRouteDraft(route: RouteDirectoryItem, payload: RouteFormPayload): RouteDirectoryItem {
  return {
    ...route,
    name: payload.name.trim(),
    territory: payload.territory.trim() || route.territory,
    status: payload.status,
    description: payload.description.trim() || route.description,
    duration: payload.duration.trim() || route.duration,
    distance: payload.distance.trim() || route.distance,
    periodicity: payload.periodicity.trim() || route.periodicity,
  };
}

export function createRoutePointDraft({
  payload,
  order,
  routeId,
}: {
  payload: RoutePointFormPayload;
  order: number;
  routeId: string;
}): RoutePoint {
  return {
    id: `${routeId}-point-${Date.now()}`,
    order,
    name: payload.name.trim(),
    zone: payload.zone.trim() || "Зона не указана",
    type: payload.type,
    tag: payload.tag.trim() || "Без метки",
    description: payload.description.trim(),
    instruction: payload.instruction.trim(),
    interval: payload.interval.trim() || "00:10",
    expectedTime: payload.expectedTime.trim() || "00:05",
    status: payload.status,
    requiresPhoto: false,
  };
}

export function updateRoutePointDraft(point: RoutePoint, payload: RoutePointFormPayload): RoutePoint {
  return {
    ...point,
    name: payload.name.trim(),
    zone: payload.zone.trim() || point.zone,
    type: payload.type,
    tag: payload.tag.trim(),
    description: payload.description.trim(),
    instruction: payload.instruction.trim(),
    interval: payload.interval.trim() || point.interval,
    expectedTime: payload.expectedTime.trim() || point.expectedTime,
    status: payload.status,
    requiresPhoto: false,
  };
}

export function reorderRoutePoints(points: RoutePoint[]) {
  return points.map((point, index) => ({ ...point, order: index + 1 }));
}

export function moveRoutePoint(points: RoutePoint[], pointId: string, direction: -1 | 1) {
  const index = points.findIndex((point) => point.id === pointId);
  const nextIndex = index + direction;

  if (index < 0 || nextIndex < 0 || nextIndex >= points.length) {
    return points;
  }

  const nextPoints = [...points];
  const [point] = nextPoints.splice(index, 1);
  nextPoints.splice(nextIndex, 0, point);

  return reorderRoutePoints(nextPoints);
}
