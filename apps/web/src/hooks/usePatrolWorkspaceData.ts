import { useCallback, useEffect, useMemo, useState } from "react";
import type { PatrolDataSnapshot } from "../repositories/patrolDataRepository";
import {
  createLocalRoute,
  createLocalRoutePoint,
  deleteLocalRoute,
  deleteLocalRoutePoint,
  isRouteDirectoryList,
  moveLocalRoutePoint,
  resolveRouteDirectory,
  routesFallback,
  routesStorageKey,
  updateLocalRoute,
  updateLocalRoutePoint,
} from "../repositories/routesRepository";
import { createApiRoutesRepository } from "../repositories/routesRepository";
import {
  createLocalPatrolRequest,
  isServiceRequestList,
  patrolRequestsFallback,
  patrolRequestsStorageKey,
  resolveServiceRequests,
} from "../repositories/patrolRequestsRepository";
import { createApiPatrolRequestsRepository } from "../repositories/patrolRequestsRepository";
import {
  createApiEmployeesRepository,
  createLocalEmployee,
  deleteLocalEmployee,
  employeesFallback,
  employeesStorageKey,
  isEmployeeDirectoryList,
  updateLocalEmployee,
} from "../repositories/employeesRepository";
import {
  activePatrolsFallback,
  activePatrolsStorageKey,
  addActivePatrolFromRequest,
  isActivePatrolList,
  resolveActivePatrols,
} from "../repositories/activePatrolsRepository";
import { type RequestModalState } from "../domain/serviceRequests";
import { buildLocalDashboardMetrics } from "../domain/dashboardMetrics";
import { buildOperationalPatrolDateRange } from "../domain/patrolQueryWindow";
import type {
  ActivePatrol,
  CreateServiceRequestPayload,
  DataSourceMode,
  DataSourceStatus,
  EmployeeDirectoryItem,
  EmployeeFormPayload,
  RouteDirectoryItem,
  RouteFormPayload,
  RouteMode,
  RoutePointFormPayload,
  ServiceRequest,
} from "../types";
import { useStoredState } from "./useStoredState";

interface UsePatrolWorkspaceDataOptions {
  dataSourceMode: DataSourceMode;
  /** Requests are fetched only by screens that render or edit them. */
  requestsEnabled?: boolean;
  patrolSnapshot: PatrolDataSnapshot;
  requestModal: RequestModalState;
  refreshPatrolData: () => Promise<void>;
  selectedPointId: string;
  selectedRouteDirectoryId: string;
  setRouteMode: (mode: RouteMode) => void;
  setSelectedPointId: (id: string) => void;
  setSelectedRouteDirectoryId: (id: string) => void;
  showToast: (message: string) => void;
}

export function usePatrolWorkspaceData({
  dataSourceMode,
  requestsEnabled = true,
  patrolSnapshot,
  requestModal,
  refreshPatrolData,
  selectedPointId,
  selectedRouteDirectoryId,
  setRouteMode,
  setSelectedPointId,
  setSelectedRouteDirectoryId,
  showToast,
}: UsePatrolWorkspaceDataOptions) {
  const [localRoutes, setLocalRoutes] = useStoredState<RouteDirectoryItem[]>(routesStorageKey, routesFallback, {
    validate: isRouteDirectoryList,
    version: 2,
  });
  const [localActivePatrols, setLocalActivePatrols] = useStoredState<ActivePatrol[]>(activePatrolsStorageKey, activePatrolsFallback, {
    validate: isActivePatrolList,
    version: 2,
  });
  const [localRequests, setLocalRequests] = useStoredState<ServiceRequest[]>(patrolRequestsStorageKey, patrolRequestsFallback, {
    validate: isServiceRequestList,
    version: 2,
  });
  const [apiRequests, setApiRequests] = useState<ServiceRequest[]>([]);
  const [requestListStatus, setRequestListStatus] = useState<DataSourceStatus>("idle");
  const [requestListErrorMessage, setRequestListErrorMessage] = useState<string | undefined>();
  const [localEmployees, setLocalEmployees] = useStoredState<EmployeeDirectoryItem[]>(
    employeesStorageKey,
    employeesFallback,
    {
      validate: isEmployeeDirectoryList,
      version: 2,
    },
  );
  const apiRoutes = useMemo(() => createApiRoutesRepository(), []);
  const apiRequestsRepository = useMemo(() => createApiPatrolRequestsRepository(), []);
  const apiEmployees = useMemo(() => createApiEmployeesRepository(), []);

  const routeDirectory = useMemo(
    () =>
      resolveRouteDirectory({
        dataSourceMode,
        localRoutes,
        snapshotRoutes: patrolSnapshot.routeDirectory,
      }),
    [dataSourceMode, localRoutes, patrolSnapshot.routeDirectory],
  );
  const activePatrols = useMemo(
    () =>
      resolveActivePatrols({
        dataSourceMode,
        localActivePatrols,
        snapshotActivePatrols: patrolSnapshot.activePatrols,
      }),
    [dataSourceMode, localActivePatrols, patrolSnapshot.activePatrols],
  );
  const requests = useMemo(
    () =>
      resolveServiceRequests({
        apiRequests,
        dataSourceMode,
        localRequests,
      }),
    [apiRequests, dataSourceMode, localRequests],
  );
  const dashboardMetrics = useMemo(
    () =>
      dataSourceMode === "api" && patrolSnapshot.dashboardMetrics.length > 0
        ? patrolSnapshot.dashboardMetrics
        : buildLocalDashboardMetrics({ activePatrols, requests, routeDirectory }),
    [activePatrols, dataSourceMode, patrolSnapshot.dashboardMetrics, requests, routeDirectory],
  );
  const employeeDirectory = useMemo(
    () => (dataSourceMode === "api" ? patrolSnapshot.employees : localEmployees),
    [dataSourceMode, localEmployees, patrolSnapshot.employees],
  );

  const refreshRequests = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (dataSourceMode !== "api") {
        setRequestListStatus("idle");
        setRequestListErrorMessage(undefined);
        return;
      }

      setRequestListStatus("loading");
      setRequestListErrorMessage(undefined);

      try {
        const nextRequests = await apiRequestsRepository.getPatrolRequests(buildOperationalPatrolDateRange(), { signal });
        setApiRequests(nextRequests);
        setRequestListStatus("ready");
      } catch (error) {
        if (signal?.aborted) return;

        const message = error instanceof Error ? error.message : "Не удалось загрузить заявки API";
        setApiRequests([]);
        setRequestListStatus("error");
        setRequestListErrorMessage(message);
        showToast(`Не удалось загрузить заявки API: ${message}`);
      }
    },
    [apiRequestsRepository, dataSourceMode, showToast],
  );

  useEffect(() => {
    const routes = routeDirectory;
    if (routes.length === 0) {
      if (selectedRouteDirectoryId) setSelectedRouteDirectoryId("");
      if (selectedPointId) setSelectedPointId("");
      return;
    }

    const selectedRoute = routes.find((route) => route.id === selectedRouteDirectoryId);
    if (!selectedRoute) {
      setSelectedRouteDirectoryId(routes[0].id);
      setSelectedPointId(routes[0].points[0]?.id ?? "");
      return;
    }

    if (selectedRoute.points.length > 0 && !selectedRoute.points.some((point) => point.id === selectedPointId)) {
      setSelectedPointId(selectedRoute.points[0].id);
    }
  }, [routeDirectory, selectedPointId, selectedRouteDirectoryId, setSelectedPointId, setSelectedRouteDirectoryId]);

  useEffect(() => {
    if (dataSourceMode !== "api" || !requestsEnabled) {
      setRequestListStatus("idle");
      setRequestListErrorMessage(undefined);
      return;
    }

    const controller = new AbortController();

    void refreshRequests({ signal: controller.signal });

    return () => controller.abort();
  }, [dataSourceMode, refreshRequests, requestsEnabled]);

  async function submitRequestDraft(payload: CreateServiceRequestPayload) {
    if (dataSourceMode === "api") {
      const nextRequest = await apiRequestsRepository.createPatrolRequest(payload);
      setApiRequests((current) => [nextRequest, ...current.filter((item) => item.id !== nextRequest.id)]);
      setRequestListStatus("ready");
      setRequestListErrorMessage(undefined);
      await refreshPatrolData();
      showToast(
        nextRequest.notifyEmployee
          ? "Заявка на обход создана через API, уведомление подготовлено"
          : "Заявка на обход создана через API без уведомления",
      );
      return nextRequest;
    }

    const { request: nextRequest, requests: nextRequests } = createLocalPatrolRequest({
      payload,
      requestModal,
      requests: localRequests,
    });
    const requestRoute = routeDirectory.find((route) => route.name === nextRequest.route);

    setLocalRequests(nextRequests);
    setLocalActivePatrols((current) =>
      addActivePatrolFromRequest({
        activePatrols: current,
        request: nextRequest,
        route: requestRoute,
      }),
    );

    showToast(
      nextRequest.notifyEmployee
        ? "Заявка на обход создана, уведомление подготовлено"
        : "Заявка на обход создана без уведомления",
    );

    return nextRequest;
  }

  function selectRouteDirectory(id: string) {
    const route = routeDirectory.find((item) => item.id === id);
    if (!route) return;
    setSelectedRouteDirectoryId(route.id);
    setSelectedPointId(route.points[0]?.id ?? "");
  }

  async function createRoute(payload: RouteFormPayload) {
    if (dataSourceMode === "api") {
      const nextRoute = await apiRoutes.createRoute(payload);
      await refreshPatrolData();
      setSelectedRouteDirectoryId(nextRoute.id);
      setSelectedPointId("");
      setRouteMode("points");
      showToast(`Маршрут "${nextRoute.name}" создан через API`);
      return nextRoute.id;
    }

    const { route: nextRoute, routes: nextRoutes } = createLocalRoute(localRoutes, payload);
    setLocalRoutes(nextRoutes);
    setSelectedRouteDirectoryId(nextRoute.id);
    setSelectedPointId("");
    setRouteMode("points");
    showToast(`Маршрут "${nextRoute.name}" создан`);
    return nextRoute.id;
  }

  async function createRouteWithPoints(routePayload: RouteFormPayload, pointPayloads: RoutePointFormPayload[]) {
    if (dataSourceMode === "api") {
      const nextRoute = await apiRoutes.createRouteWithPoints(routePayload, pointPayloads);
      await refreshPatrolData();
      setSelectedRouteDirectoryId(nextRoute.id);
      setSelectedPointId(nextRoute.points.at(-1)?.id ?? "");
      setRouteMode("points");
      showToast(`Маршрут "${nextRoute.name}" создан через API, точек: ${nextRoute.points.length}`);
      return nextRoute.id;
    }

    const { route: nextRoute } = createLocalRoute(localRoutes, routePayload);
    let nextRoutes: RouteDirectoryItem[] = [nextRoute, ...localRoutes];
    let lastPointId = "";

    for (const pointPayload of pointPayloads) {
      const created = createLocalRoutePoint(nextRoutes, nextRoute.id, pointPayload);
      nextRoutes = created.routes;
      lastPointId = created.point.id;
    }

    setLocalRoutes(nextRoutes);
    setSelectedRouteDirectoryId(nextRoute.id);
    setSelectedPointId(lastPointId);
    setRouteMode("points");
    showToast(`Маршрут "${nextRoute.name}" создан, точек: ${pointPayloads.length}`);
    return nextRoute.id;
  }

  async function updateRoute(routeId: string, payload: RouteFormPayload) {
    if (dataSourceMode === "api") {
      const expectedVersionNo = routeDirectory.find((item) => item.id === routeId)?.versionNo;
      await apiRoutes.updateRoute(routeId, payload, expectedVersionNo);
      await refreshPatrolData();
      showToast("Маршрут сохранен через API");
      return;
    }

    setLocalRoutes((current) => updateLocalRoute(current, routeId, payload));
    showToast("Маршрут сохранен");
  }

  async function deleteRoute(routeId: string) {
    if (dataSourceMode === "api") {
      await apiRoutes.deleteRoute(routeId);
      await refreshPatrolData();
      setSelectedRouteDirectoryId("");
      setSelectedPointId("");
      showToast("Маршрут перенесен в архив через API");
      return;
    }

    const route = localRoutes.find((item) => item.id === routeId);
    const nextRoutes = deleteLocalRoute(localRoutes, routeId);
    setLocalRoutes(nextRoutes);
    setSelectedRouteDirectoryId(nextRoutes[0]?.id ?? "");
    setSelectedPointId(nextRoutes[0]?.points[0]?.id ?? "");
    showToast(route ? `Маршрут "${route.name}" удален` : "Маршрут удален");
  }

  async function createRoutePoint(routeId: string, payload: RoutePointFormPayload) {
    if (dataSourceMode === "api") {
      const pointId = await apiRoutes.createRoutePoint(routeId, payload);
      await refreshPatrolData();
      setSelectedPointId(pointId);
      showToast("Точка маршрута добавлена через API");
      return pointId;
    }

    let createdPointId = "";
    setLocalRoutes((current) => {
      const { point, routes: nextRoutes } = createLocalRoutePoint(current, routeId, payload);
      createdPointId = point.id;
      return nextRoutes;
    });
    setSelectedPointId(createdPointId);
    showToast("Точка маршрута добавлена");
    return createdPointId;
  }

  async function updateRoutePoint(routeId: string, pointId: string, payload: RoutePointFormPayload) {
    if (dataSourceMode === "api") {
      await apiRoutes.updateRoutePoint(routeId, pointId, payload);
      await refreshPatrolData();
      showToast("Точка маршрута сохранена через API");
      return;
    }

    setLocalRoutes((current) => updateLocalRoutePoint(current, routeId, pointId, payload));
    showToast("Точка маршрута сохранена");
  }

  async function deleteRoutePoint(routeId: string, pointId: string) {
    if (dataSourceMode === "api") {
      await apiRoutes.deleteRoutePoint(routeId, pointId);
      await refreshPatrolData();
      setSelectedPointId("");
      showToast("Точка маршрута удалена через API");
      return;
    }

    setLocalRoutes((current) => deleteLocalRoutePoint(current, routeId, pointId));

    const route = localRoutes.find((item) => item.id === routeId);
    const nextPoint = route?.points.find((point) => point.id !== pointId);
    setSelectedPointId(nextPoint?.id ?? "");
    showToast("Точка маршрута удалена");
  }

  async function movePoint(routeId: string, pointId: string, direction: -1 | 1) {
    if (dataSourceMode === "api") {
      const route = routeDirectory.find((item) => item.id === routeId);
      const point = route?.points.find((item) => item.id === pointId);
      if (!point) return;

      await apiRoutes.reorderRoutePoint(routeId, pointId, point.order + direction, route?.versionNo);
      await refreshPatrolData();
      return;
    }

    setLocalRoutes((current) => moveLocalRoutePoint(current, routeId, pointId, direction));
  }

  async function createEmployee(payload: EmployeeFormPayload) {
    if (dataSourceMode === "api") {
      const employee = await apiEmployees.createEmployee(payload);
      await refreshPatrolData();
      showToast(`Сотрудник "${employee.fullName}" создан через API`);
      return employee.id;
    }

    const { employee, employees } = createLocalEmployee(localEmployees, payload);
    setLocalEmployees(employees);
    showToast(`Сотрудник "${employee.fullName}" создан`);
    return employee.id;
  }

  async function updateEmployee(employeeId: string, payload: EmployeeFormPayload) {
    if (dataSourceMode === "api") {
      await apiEmployees.updateEmployee(employeeId, payload);
      await refreshPatrolData();
      showToast("Сотрудник сохранен через API");
      return;
    }

    setLocalEmployees((current) => updateLocalEmployee(current, employeeId, payload));
    showToast("Сотрудник сохранен");
  }

  async function deleteEmployee(employeeId: string) {
    if (dataSourceMode === "api") {
      await apiEmployees.deleteEmployee(employeeId);
      await refreshPatrolData();
      showToast("Сотрудник деактивирован через API");
      return;
    }

    setLocalEmployees((current) => deleteLocalEmployee(current, employeeId));
    showToast("Сотрудник деактивирован");
  }

  return {
    activePatrols,
    dashboardMetrics,
    employeeDirectory,
    refreshRequests,
    requestListErrorMessage,
    requestListStatus,
    requests,
    routeDirectory,
    createRoute,
    createRouteWithPoints,
    createRoutePoint,
    createEmployee,
    deleteEmployee,
    deleteRoute,
    deleteRoutePoint,
    movePoint,
    selectRouteDirectory,
    submitRequestDraft,
    updateRoute,
    updateRoutePoint,
    updateEmployee,
  };
}
