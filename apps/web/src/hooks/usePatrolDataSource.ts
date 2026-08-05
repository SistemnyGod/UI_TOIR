import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataSourceMode, DataSourceStatus } from "../types";
import {
  createApiPatrolDataRepository,
  createMockPatrolDataRepository,
  emptyPatrolDataSnapshot,
  type PatrolDataAccess,
  type PatrolDataSnapshot,
} from "../repositories/patrolDataRepository";
import { subscribeAssignmentAutoRefresh } from "../features/patrol/assignments/assignmentAutoRefresh";

export function usePatrolDataSource(mode: DataSourceMode, access?: PatrolDataAccess) {
  const [snapshot, setSnapshot] = useState<PatrolDataSnapshot>(() => emptyPatrolDataSnapshot());
  const [status, setStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const dashboardAccess = access?.dashboard ?? true;
  const employeeAccess = access?.employees ?? true;
  const routeAccess = access?.routes ?? true;
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

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setStatus(mode === "api" ? "loading" : "idle");
      }
      setErrorMessage(undefined);

      try {
        const nextSnapshot = await client.getSnapshot();
        setSnapshot(nextSnapshot);
        setStatus(mode === "api" ? "ready" : "idle");
      } catch (error) {
        if (!silent) {
          setSnapshot(emptyPatrolDataSnapshot());
          setStatus("error");
        }
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить данные API");
      }
    },
    [client, mode],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (mode !== "api") return;
    return subscribeAssignmentAutoRefresh(() => refresh({ silent: true }));
  }, [mode, refresh]);

  return {
    errorMessage,
    refresh,
    snapshot,
    status,
  };
}
