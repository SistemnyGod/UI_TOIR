import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApiPatrolRequestsRepository, type PatrolRequestFilterOptions } from "../repositories/patrolRequestsRepository";
import { subscribeAssignmentAutoRefresh } from "../features/patrol/assignments/assignmentAutoRefresh";
import type { DataSourceMode, DataSourceStatus, ServiceRequest } from "../types";

type Feed = { owner: string; scope: string; rows: ServiceRequest[]; status: DataSourceStatus; error?: string; hasMore: boolean; refreshing: boolean };
export function usePatrolRequestFeed({ dataSourceMode, sessionKey = "anonymous", enabled = true, autoRefresh = true, shouldAutoRefresh, filters = {}, page, pageSize = 50,
}: { dataSourceMode: DataSourceMode; sessionKey?: string; enabled?: boolean; autoRefresh?: boolean; shouldAutoRefresh?: () => boolean; filters?: PatrolRequestFilterOptions; page?: number; pageSize?: number }) {
  const repository = useMemo(() => createApiPatrolRequestsRepository(), []);
  const owner = `${dataSourceMode}:${sessionKey}`;
  const queryKey = JSON.stringify([filters, page, pageSize]);
  const scope = `${owner}:${queryKey}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const version = useRef(0);
  const pending = useRef<{ scope: string; controller: AbortController; promise: Promise<void> } | null>(null);
  const [feed, setFeed] = useState<Feed>({ owner, scope, rows: [], status: "idle", hasMore: false, refreshing: false });
  // Retain the current owner's table while filters load; never expose another owner's rows.
  const visible = feed.owner === owner ? feed : { owner, scope, rows: [], status: "idle" as const, hasMore: false, refreshing: false, error: undefined };

  const refresh = useCallback(({ silent = false }: { silent?: boolean } = {}): Promise<void> => {
    if (dataSourceMode !== "api" || currentScope.current !== scope) return Promise.resolve();
    if (silent && pending.current?.scope === scope) return pending.current.promise;
    pending.current?.controller.abort();
    const controller = new AbortController();
    const requestVersion = ++version.current;
    const isCurrent = () => !controller.signal.aborted && version.current === requestVersion && currentScope.current === scope;
    const parsedFilters = JSON.parse(queryKey)[0] as PatrolRequestFilterOptions;
    setFeed(old => ({ owner, scope, rows: old.owner === owner ? old.rows : [], refreshing: true,
      status: old.owner === owner && old.rows.length ? "ready" : "loading", hasMore: old.scope === scope && old.hasMore }));
    const promise = (async () => {
      try {
        const result = page === undefined
          ? { rows: await repository.getPatrolRequests(parsedFilters, { signal: controller.signal }), hasMore: false }
          : await repository.getPatrolRequestPage(parsedFilters, { page, pageSize }, { signal: controller.signal });
        if (isCurrent()) setFeed({ owner, scope, rows: result.rows, status: "ready", hasMore: result.hasMore, refreshing: false });
      } catch (error) {
        if (!isCurrent()) return;
        setFeed(old => ({ ...old, owner, scope, refreshing: false, status: old.rows.length ? "ready" : "error",
          error: error instanceof Error ? error.message : "Не удалось загрузить заявки" }));
      } finally {
        if (pending.current?.controller === controller) pending.current = null;
      }
    })();
    pending.current = { scope, controller, promise };
    return promise;
  }, [dataSourceMode, owner, scope, queryKey, page, pageSize, repository]);

  useEffect(() => {
    if (enabled && dataSourceMode === "api") void refresh();
    return () => { version.current++; pending.current?.controller.abort(); pending.current = null; };
  }, [enabled, dataSourceMode, refresh]);
  useEffect(() => {
    if (dataSourceMode !== "api" || !enabled || !autoRefresh) return;
    return subscribeAssignmentAutoRefresh(() => shouldAutoRefresh && !shouldAutoRefresh() ? Promise.resolve() : refresh({ silent: true }));
  }, [dataSourceMode, enabled, autoRefresh, shouldAutoRefresh, refresh]);
  const upsert = useCallback((request: ServiceRequest) => {
    if (currentScope.current !== scope) throw new Error("Сессия изменилась. Обновите список заявок.");
    version.current++; pending.current?.controller.abort(); pending.current = null;
    setFeed(old => ({ owner, scope, rows: [request, ...(old.owner === owner ? old.rows : []).filter(row => row.id !== request.id)], status: "ready", hasMore: old.owner === owner && old.hasMore, refreshing: false }));
  }, [scope, owner]);
  return { rows: visible.rows, status: visible.status, error: visible.error, hasMore: visible.hasMore,
    isRefreshing: enabled && dataSourceMode === "api" && (visible.refreshing || visible.scope !== scope), refresh, upsert };
}
