import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearApiGetCache } from "../api/client";
import type { DataSourceMode, DataSourceStatus } from "../types";
import {
  createApiPatrolDataRepository,
  createMockPatrolDataRepository,
  emptyPatrolDataSnapshot,
  mapDashboardMetrics,
  type PatrolDataAccess,
  type PatrolDataDemand,
  type PatrolDataSnapshot,
} from "../repositories/patrolDataRepository";
import { subscribeAssignmentAutoRefresh } from "../features/patrol/assignments/assignmentAutoRefresh";

const noPatrolDataDemand: PatrolDataDemand = {
  dashboard: false,
  employees: false,
  routes: false,
};

/**
 * Loads only the directories needed by the open screen. The cache scope must
 * change with the signed-in user so data from a previous session is never used.
 */
export function usePatrolDataSource(
  mode: DataSourceMode,
  access: PatrolDataAccess | undefined,
  demand: PatrolDataDemand = noPatrolDataDemand,
  cacheScope = "anonymous",
) {
  const [snapshot, setSnapshot] = useState<PatrolDataSnapshot>(() => emptyPatrolDataSnapshot());
  const [status, setStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const requestVersion = useRef(0);

  const dashboardAccess = access?.dashboard ?? true;
  const employeeAccess = access?.employees ?? true;
  const routeAccess = access?.routes ?? true;
  const normalizedDemand = useMemo<PatrolDataDemand>(
    () => ({
      dashboard: Boolean(demand.dashboard),
      employees: Boolean(demand.employees),
      routes: Boolean(demand.routes),
    }),
    [demand.dashboard, demand.employees, demand.routes],
  );
  const hasDemand = normalizedDemand.dashboard || normalizedDemand.employees || normalizedDemand.routes;
  const client = useMemo(
    () => (mode === "api"
      ? createApiPatrolDataRepository({
          access: {
            dashboard: dashboardAccess,
            employees: employeeAccess,
            routes: routeAccess,
          },
        })
      : createMockPatrolDataRepository()),
    [dashboardAccess, employeeAccess, mode, routeAccess],
  );

  const load = useCallback(
    async ({ reload = false, silent = false }: { reload?: boolean; silent?: boolean } = {}) => {
      const version = ++requestVersion.current;
      if (!hasDemand) {
        if (version === requestVersion.current) {
          setStatus("idle");
          setErrorMessage(undefined);
        }
        return;
      }

      if (!silent) {
        setStatus(mode === "api" ? "loading" : "idle");
      }
      setErrorMessage(undefined);

      const requestedParts: PatrolDataDemand[] = [];
      if (normalizedDemand.dashboard) requestedParts.push({ dashboard: true });
      if (normalizedDemand.employees) requestedParts.push({ employees: true });
      if (normalizedDemand.routes) requestedParts.push({ routes: true });
      const results = await Promise.allSettled(requestedParts.map(async (part) => {
        const nextSnapshot = await client.getSnapshot(part, { reload });
        if (version !== requestVersion.current) return;
        setSnapshot((current) => mergePatrolDataSnapshot(current, nextSnapshot, part));
        setStatus(mode === "api" ? "ready" : "idle");
      }));
      if (version !== requestVersion.current) return;

      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length === 0) return;

      const message = failures
        .map((failure) => failure.reason instanceof Error ? failure.reason.message : "Не удалось загрузить данные API")
        .join(" ");
      if (failures.length === results.length && !silent) {
        setStatus("error");
      }
      setErrorMessage(message);
    },
    [client, hasDemand, mode, normalizedDemand],
  );

  useEffect(() => {
    clearApiGetCache();
    requestVersion.current += 1;
    setSnapshot(emptyPatrolDataSnapshot());
    setStatus("idle");
    setErrorMessage(undefined);
  }, [cacheScope, mode, dashboardAccess, employeeAccess, routeAccess]);

  useEffect(() => {
    void load();
  }, [cacheScope, load]);

  useEffect(() => {
    if (mode !== "api" || !normalizedDemand.dashboard) return;
    return subscribeAssignmentAutoRefresh(() => load({ reload: true, silent: true }));
  }, [load, mode, normalizedDemand.dashboard]);

  const refresh = useCallback(
    ({ silent = false }: { silent?: boolean } = {}) => load({ reload: true, silent }),
    [load],
  );

  return {
    errorMessage,
    refresh,
    snapshot,
    status,
  };
}

export function mergePatrolDataSnapshot(
  current: PatrolDataSnapshot,
  next: PatrolDataSnapshot,
  demand: PatrolDataDemand,
): PatrolDataSnapshot {
  const dashboardSummary = demand.dashboard ? next.dashboardSummary : current.dashboardSummary;
  const routes = demand.routes ? next.routeDirectory : current.routeDirectory;
  return {
    activePatrols: demand.dashboard ? next.activePatrols : current.activePatrols,
    dashboardMetrics: demand.dashboard
      ? next.dashboardMetrics
      : demand.routes && dashboardSummary
        ? mapDashboardMetrics(dashboardSummary, routes.filter((route) => route.status !== "Архив").length)
        : current.dashboardMetrics,
    dashboardSummary,
    employees: demand.employees ? next.employees : current.employees,
    routeDirectory: routes,
  };
}
