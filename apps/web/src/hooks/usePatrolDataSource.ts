import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataSourceMode, DataSourceStatus } from "../types";
import {
  createApiPatrolDataRepository,
  createMockPatrolDataRepository,
  emptyPatrolDataSnapshot,
  type PatrolDataSnapshot,
} from "../repositories/patrolDataRepository";

export function usePatrolDataSource(mode: DataSourceMode) {
  const [snapshot, setSnapshot] = useState<PatrolDataSnapshot>(() => emptyPatrolDataSnapshot());
  const [status, setStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const client = useMemo(
    () => (mode === "api" ? createApiPatrolDataRepository() : createMockPatrolDataRepository()),
    [mode],
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
        setSnapshot(emptyPatrolDataSnapshot());
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить данные API");
      }
    },
    [client, mode],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    errorMessage,
    refresh,
    snapshot,
    status,
  };
}
