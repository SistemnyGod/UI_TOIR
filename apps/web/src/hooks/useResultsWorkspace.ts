import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createApiResultsRepository,
  findPatrolResult,
  isBackendResultId,
  patrolResultsFallback,
  type ResultFilterOptions,
} from "../repositories/resultsRepository";
import type { DataSourceMode, DataSourceStatus, PatrolResult } from "../types";

interface UseResultsWorkspaceOptions {
  dataSourceMode: DataSourceMode;
  /** Keep the workspace mounted without starting its list/detail requests. */
  enabled?: boolean;
  selectedResultId: string;
  filters?: ResultFilterOptions;
  onSelectResult: (id: string) => void;
  showToast: (message: string) => void;
}

const emptyResultFilters: ResultFilterOptions = {};

export function useResultsWorkspace({
  dataSourceMode,
  enabled = true,
  filters = emptyResultFilters,
  selectedResultId,
  onSelectResult,
  showToast,
}: UseResultsWorkspaceOptions) {
  const apiResults = useMemo(() => createApiResultsRepository(), []);
  const [results, setResults] = useState<PatrolResult[]>(dataSourceMode === "mock" ? patrolResultsFallback : []);
  const [selectedDetail, setSelectedDetail] = useState<PatrolResult | undefined>();
  const [listStatus, setListStatus] = useState<DataSourceStatus>(dataSourceMode === "mock" ? "ready" : "idle");
  const [detailStatus, setDetailStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadMoreStatus, setLoadMoreStatus] = useState<DataSourceStatus>("idle");
  const [totalResults, setTotalResults] = useState(dataSourceMode === "mock" ? patrolResultsFallback.length : 0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const filterIdentity = JSON.stringify(filters);
  const filterIdentityRef = useRef(filterIdentity);
  filterIdentityRef.current = filterIdentity;

  const selectedListItem = useMemo(() => findPatrolResult(results, selectedResultId), [results, selectedResultId]);
  const exactSelectedListItem = useMemo(
    () => results.find((result) => result.id === selectedResultId),
    [results, selectedResultId],
  );
  const selectedResult = selectedDetail ?? selectedListItem;

  const refreshResults = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (dataSourceMode !== "api") {
        setResults(patrolResultsFallback);
        setHasMoreResults(false);
        setCurrentPage(1);
        setTotalResults(patrolResultsFallback.length);
        setListStatus("ready");
        setErrorMessage(undefined);
        return;
      }

      setListStatus("loading");
      setErrorMessage(undefined);

      try {
        const resultPage = await apiResults.getResultPage(filters, { signal });
        if (signal?.aborted) return;
        setResults(resultPage.results);
        setHasMoreResults(resultPage.hasMore);
        setCurrentPage(resultPage.page);
        setTotalResults(resultPage.total);
        setListStatus(resultPage.results.length > 0 ? "ready" : "idle");
      } catch (error) {
        if (signal?.aborted) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить результаты API";
        setResults([]);
        setHasMoreResults(false);
        setTotalResults(0);
        setListStatus("error");
        setErrorMessage(message);
        showToast(`Не удалось загрузить результаты API: ${message}`);
      }
    },
    [apiResults, dataSourceMode, filters, showToast],
  );

  const loadMoreResults = useCallback(async () => {
    if (!enabled || dataSourceMode !== "api" || !hasMoreResults || loadMoreStatus === "loading") return;
    const controller = new AbortController();
    const requestedFilterIdentity = filterIdentity;
    loadMoreControllerRef.current = controller;
    setLoadMoreStatus("loading");
    try {
      const resultPage = await apiResults.getResultPage(filters, { page: currentPage + 1, signal: controller.signal });
      if (controller.signal.aborted || filterIdentityRef.current !== requestedFilterIdentity) return;
      setResults((current) => mergePatrolResults(current, resultPage.results));
      setCurrentPage(resultPage.page);
      setHasMoreResults(resultPage.hasMore);
      setTotalResults(resultPage.total);
      setLoadMoreStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Не удалось загрузить следующую страницу результатов";
      setLoadMoreStatus("error");
      showToast(`Не удалось загрузить следующую страницу результатов: ${message}`);
    } finally {
      if (loadMoreControllerRef.current === controller) loadMoreControllerRef.current = null;
    }
  }, [apiResults, currentPage, dataSourceMode, enabled, filterIdentity, filters, hasMoreResults, loadMoreStatus, showToast]);

  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadMoreStatus("idle");
  }, [dataSourceMode, filterIdentity]);

  useEffect(() => {
    const controller = new AbortController();
    if (!enabled) {
      setListStatus(dataSourceMode === "mock" ? "ready" : "idle");
      setErrorMessage(undefined);
      return () => controller.abort();
    }

    void refreshResults({ signal: controller.signal });

    return () => controller.abort();
  }, [dataSourceMode, enabled, refreshResults]);

  useEffect(() => {
    if (!enabled) return;

    if (results.length === 0) {
      if (selectedResultId) onSelectResult("");
      return;
    }

    if (dataSourceMode === "api" && isBackendResultId(selectedResultId)) {
      return;
    }

    if (!selectedResultId || !results.some((result) => result.id === selectedResultId)) {
      onSelectResult(results[0].id);
    }
  }, [dataSourceMode, enabled, onSelectResult, results, selectedResultId]);

  useEffect(() => {
    setSelectedDetail(undefined);

    if (!enabled || !selectedResultId || dataSourceMode !== "api" || !isBackendResultId(selectedResultId)) {
      setDetailStatus("idle");
      return;
    }

    const controller = new AbortController();
    setDetailStatus("loading");

    apiResults
      .getResult(selectedResultId, { signal: controller.signal })
      .then(async (result) => {
        if (controller.signal.aborted) return;
        if (!exactSelectedListItem) {
          const relatedResults = result.assignmentId
            ? await apiResults.getResults({ assignmentId: result.assignmentId }, { signal: controller.signal })
            : [result];
          if (controller.signal.aborted) return;
          setResults((current) => mergePatrolResults(current, relatedResults));
        }

        setSelectedDetail(result);
        setDetailStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить детали результата API";
        setDetailStatus("error");
        setErrorMessage(message);
        showToast(`Не удалось загрузить детали результата API: ${message}`);
      });

    return () => controller.abort();
  }, [apiResults, dataSourceMode, enabled, exactSelectedListItem, selectedResultId, showToast]);

  const exportResults = useCallback(async (exportFilters: ResultFilterOptions = emptyResultFilters) => {
    if (dataSourceMode !== "api") {
      return undefined;
    }

    return apiResults.exportResults({ ...filters, ...exportFilters });
  }, [apiResults, dataSourceMode, filters]);

  return {
    detailStatus,
    errorMessage,
    exportResults,
    hasMoreResults,
    loadMoreResults,
    loadMoreStatus,
    listStatus,
    refreshResults,
    results,
    selectedResult,
    totalResults,
  };
}

function mergePatrolResults(current: PatrolResult[], related: PatrolResult[]) {
  const byId = new Map(current.map((result) => [result.id, result]));
  related.forEach((result) => byId.set(result.id, result));
  return Array.from(byId.values());
}
