import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApiResultsRepository, patrolResultsFallback } from "../../repositories/resultsRepository";
import type { DataSourceMode, PatrolResult } from "../../types";
import { subscribeAssignmentAutoRefresh } from "../patrol/assignments/assignmentAutoRefresh";
import { dashboardDayKey, dashboardRange, type DashboardPeriod } from "./dashboardSummary";
import { loadDashboardResults } from "./dashboardResultsLoader";

interface OverviewState {
  key: string;
  results?: PatrolResult[];
  refreshedAt?: Date;
  loading: boolean;
  error?: string;
}

export function useDashboardOverview({ dataSourceMode, ownerId = "", enabled = true, period }: {
  dataSourceMode: DataSourceMode;
  ownerId?: string;
  enabled?: boolean;
  period: DashboardPeriod;
}) {
  const repository = useMemo(() => createApiResultsRepository(), []);
  const [day, setDay] = useState(() => dashboardDayKey(new Date()));
  const key = JSON.stringify([dataSourceMode, ownerId, enabled, period, day]);
  const [state, setState] = useState<OverviewState>({ key: "", loading: true });
  const currentKey = useRef(key);
  currentKey.current = key;
  const flight = useRef<{ key: string; controller: AbortController; promise: Promise<void> } | undefined>(undefined);

  const refresh = useCallback((): Promise<void> => {
    if (!enabled) return Promise.resolve();
    if (flight.current?.key === key && !flight.current.controller.signal.aborted) return flight.current.promise;
    flight.current?.controller.abort();
    const controller = new AbortController();
    setState((previous) => ({ ...(previous.key === key ? previous : { key }), loading: true, error: undefined }));
    const promise = (async () => {
      try {
        const range = dashboardRange(period);
        const results = dataSourceMode === "api"
          ? await loadDashboardResults(repository.getResultPage, { dateFrom: range.dateFrom, dateTo: range.dateTo }, controller.signal)
          : patrolResultsFallback;
        if (controller.signal.aborted || currentKey.current !== key) return;
        setState({ key, results, refreshedAt: new Date(), loading: false });
      } catch (error) {
        if (controller.signal.aborted || currentKey.current !== key) return;
        setState((previous) => ({ ...(previous.key === key ? previous : { key }), loading: false, error: error instanceof Error ? error.message : "Не удалось обновить результаты" }));
      } finally {
        if (flight.current?.controller === controller) flight.current = undefined;
      }
    })();
    flight.current = { key, controller, promise };
    // Mock reads can complete synchronously; settle the flight after assignment, too.
    void promise.then(() => { if (flight.current?.controller === controller) flight.current = undefined; });
    return promise;
  }, [dataSourceMode, enabled, key, period, repository]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeAssignmentAutoRefresh(async () => {
      const today = dashboardDayKey(new Date());
      if (today !== day) { setDay(today); return; }
      if (dataSourceMode === "api") await refresh();
    }, 60_000);
    return () => { unsubscribe(); flight.current?.controller.abort(); };
  }, [dataSourceMode, day, refresh]);

  const visible = state.key === key ? state : { key, loading: enabled };
  return { ...visible, refresh, range: dashboardRange(period, visible.refreshedAt ?? new Date()) };
}
