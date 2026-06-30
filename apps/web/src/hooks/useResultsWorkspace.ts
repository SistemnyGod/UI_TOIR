import { useCallback, useEffect, useMemo, useState } from "react";
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
  selectedResultId: string;
  filters?: ResultFilterOptions;
  onSelectResult: (id: string) => void;
  showToast: (message: string) => void;
}

const emptyResultFilters: ResultFilterOptions = {};

export function useResultsWorkspace({
  dataSourceMode,
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
        setListStatus(resultPage.results.length > 0 ? "ready" : "idle");
      } catch (error) {
        if (signal?.aborted) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить результаты API";
        setResults([]);
        setHasMoreResults(false);
        setListStatus("error");
        setErrorMessage(message);
        showToast(`Не удалось загрузить результаты API: ${message}`);
      }
    },
    [apiResults, dataSourceMode, filters, showToast],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshResults({ signal: controller.signal });

    return () => controller.abort();
  }, [refreshResults]);

  useEffect(() => {
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
  }, [dataSourceMode, onSelectResult, results, selectedResultId]);

  useEffect(() => {
    setSelectedDetail(undefined);

    if (!selectedResultId || dataSourceMode !== "api" || !isBackendResultId(selectedResultId)) {
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
  }, [apiResults, dataSourceMode, exactSelectedListItem, selectedResultId, showToast]);

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
    listStatus,
    refreshResults,
    results,
    selectedResult,
  };
}

function mergePatrolResults(current: PatrolResult[], related: PatrolResult[]) {
  const byId = new Map(current.map((result) => [result.id, result]));
  related.forEach((result) => byId.set(result.id, result));
  return Array.from(byId.values());
}
