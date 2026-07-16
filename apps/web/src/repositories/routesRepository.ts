import { routeDirectory as defaultRouteDirectory } from "../data";
import { ApiClient } from "../api/client";
import type {
  CreateRouteDto,
  CreateRoutePointDto,
  CreateRouteWithPointsDto,
  RouteDto,
  RoutePointDto,
  UpdateRouteDto,
} from "../api/contracts";
import {
  createRouteDraft,
  createRoutePointDraft,
  isRouteDirectoryList,
  moveRoutePoint,
  reorderRoutePoints,
  updateRouteDraft,
  updateRoutePointDraft,
} from "../domain/routes";
import type { DataSourceMode, RouteDirectoryItem, RouteFormPayload, RoutePointFormPayload } from "../types";
import { mapRoute } from "./patrolDataRepository";

export const routesStorageKey = "patrol360.routes.v1";
export const routesFallback = defaultRouteDirectory;
export { isRouteDirectoryList };

export function resolveRouteDirectory({
  dataSourceMode,
  localRoutes,
  snapshotRoutes,
}: {
  dataSourceMode: DataSourceMode;
  localRoutes: RouteDirectoryItem[];
  snapshotRoutes: RouteDirectoryItem[];
}) {
  return dataSourceMode === "api" ? snapshotRoutes : localRoutes;
}

export function createLocalRoute(routes: RouteDirectoryItem[], payload: RouteFormPayload) {
  const route = createRouteDraft({ payload, existingCount: routes.length });

  return {
    route,
    routes: [route, ...routes],
  };
}

export function updateLocalRoute(routes: RouteDirectoryItem[], routeId: string, payload: RouteFormPayload) {
  return routes.map((route) => (route.id === routeId ? updateRouteDraft(route, payload) : route));
}

export function deleteLocalRoute(routes: RouteDirectoryItem[], routeId: string) {
  return routes.filter((route) => route.id !== routeId);
}

export function createLocalRoutePoint(routes: RouteDirectoryItem[], routeId: string, payload: RoutePointFormPayload) {
  const route = routes.find((item) => item.id === routeId);
  const point = createRoutePointDraft({
    payload,
    routeId,
    order: (route?.points.length ?? 0) + 1,
  });

  return {
    point,
    routes: routes.map((item) =>
      item.id === routeId ? { ...item, points: reorderRoutePoints([...item.points, point]) } : item,
    ),
  };
}

export function updateLocalRoutePoint(
  routes: RouteDirectoryItem[],
  routeId: string,
  pointId: string,
  payload: RoutePointFormPayload,
) {
  return routes.map((route) =>
    route.id === routeId
      ? {
          ...route,
          points: reorderRoutePoints(
            route.points.map((point) => (point.id === pointId ? updateRoutePointDraft(point, payload) : point)),
          ),
        }
      : route,
  );
}

export function deleteLocalRoutePoint(routes: RouteDirectoryItem[], routeId: string, pointId: string) {
  return routes.map((route) =>
    route.id === routeId
      ? {
          ...route,
          points: reorderRoutePoints(route.points.filter((point) => point.id !== pointId)),
        }
      : route,
  );
}

export function moveLocalRoutePoint(
  routes: RouteDirectoryItem[],
  routeId: string,
  pointId: string,
  direction: -1 | 1,
) {
  return routes.map((route) =>
    route.id === routeId ? { ...route, points: moveRoutePoint(route.points, pointId, direction) } : route,
  );
}

export function createApiRoutesRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    async createRoute(payload: RouteFormPayload) {
      const route = await client.post<RouteDto, CreateRouteDto>("/api/v1/routes", mapRoutePayload(payload));
      return mapRoute(route);
    },

    async createRouteWithPoints(routePayload: RouteFormPayload, pointPayloads: RoutePointFormPayload[]) {
      const route = await client.post<RouteDto, CreateRouteWithPointsDto>("/api/v1/routes/with-points", {
        route: mapRoutePayload(routePayload),
        points: pointPayloads.map(mapPointPayload),
      });
      return mapRoute(route);
    },

    async updateRoute(routeId: string, payload: RouteFormPayload, expectedVersionNo?: number) {
      const route = await client.put<RouteDto, UpdateRouteDto>(`/api/v1/routes/${routeId}`, {
        ...mapRoutePayload(payload),
        expectedVersionNo,
      });
      return mapRoute(route);
    },

    async deleteRoute(routeId: string) {
      await client.delete(`/api/v1/routes/${routeId}`);
    },

    async createRoutePoint(routeId: string, payload: RoutePointFormPayload) {
      const point = await client.post<RoutePointDto, CreateRoutePointDto>(`/api/v1/routes/${routeId}/points`, mapPointPayload(payload));
      return point.id;
    },

    async updateRoutePoint(routeId: string, pointId: string, payload: RoutePointFormPayload) {
      await client.put(`/api/v1/routes/${routeId}/points/${pointId}`, mapPointPayload(payload));
    },

    async deleteRoutePoint(routeId: string, pointId: string) {
      await client.delete(`/api/v1/routes/${routeId}/points/${pointId}`);
    },

    async reorderRoutePoint(routeId: string, pointId: string, sequenceNo: number, expectedVersionNo?: number) {
      await client.put(`/api/v1/routes/${routeId}/points/${pointId}/order`, { sequenceNo, expectedVersionNo });
    },
  };
}

function mapRoutePayload(payload: RouteFormPayload): CreateRouteDto {
  return {
    name: payload.name,
    description: payload.description,
    territory: payload.territory,
    status: payload.status,
    duration: payload.duration,
    distance: payload.distance,
    periodicity: payload.periodicity,
  };
}

function mapPointPayload(payload: RoutePointFormPayload): CreateRoutePointDto {
  return {
    name: payload.name,
    zone: payload.zone,
    type: payload.type,
    tag: payload.tag,
    interval: payload.interval,
    expectedTime: payload.expectedTime,
    status: payload.status,
    requiresPhoto: payload.requiresPhoto,
  };
}
