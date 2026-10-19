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
  sessionKey?: string;
  /** Keep the workspace mounted without starting its list/detail requests. */
  enabled?: boolean;
  /** Optional fixture records; never used in API mode. */
  mockResults?: PatrolResult[];
  selectedResultId: string;
  filters?: ResultFilterOptions;
  onSelectResult: (id: string) => void;
  showToast: (message: string) => void;
}

const emptyResultFilters: ResultFilterOptions = {};
const emptyResults: PatrolResult[] = [];

export function useResultsWorkspace({
  dataSourceMode,
  sessionKey = "",
  enabled = true,
  mockResults = patrolResultsFallback,
  filters = emptyResultFilters,
  selectedResultId,
  onSelectResult,
  showToast,
}: UseResultsWorkspaceOptions) {
  const apiResults = useMemo(() => createApiResultsRepository(), []);
  const owner = `${dataSourceMode}:${sessionKey}`;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [resultOwner, setResultOwner] = useState(owner);
  const [results, setResults] = useState<PatrolResult[]>(dataSourceMode === "mock" ? mockResults : []);
  const [selectedDetail, setSelectedDetail] = useState<PatrolResult | undefined>();
  const [selectedResults, setSelectedResults] = useState<PatrolResult[]>([]);
  const [listStatus, setListStatus] = useState<DataSourceStatus>(dataSourceMode === "mock" ? "ready" : "idle");
  const [detailStatus, setDetailStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadMoreStatus, setLoadMoreStatus] = useState<DataSourceStatus>("idle");
  const [totalResults, setTotalResults] = useState(dataSourceMode === "mock" ? mockResults.length : 0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const detailSelectionRef = useRef("");
  const filterIdentity = JSON.stringify(filters);
  const scope = `${owner}:${enabled}:${filterIdentity}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const visibleResults = resultOwner === owner ? results : emptyResults;

  const selectedListItem = useMemo(() => findPatrolResult(visibleResults, selectedResultId), [visibleResults, selectedResultId]);
  const exactSelectedListItem = useMemo(
    () => visibleResults.find((result) => result.id === selectedResultId),
    [visibleResults, selectedResultId],
  );
  const selectedResult = resultOwner === owner && selectedDetail?.id === selectedResultId ? selectedDetail : selectedListItem;

  const refreshResults = useCallback(
    async ({ signal, silent = false }: { signal?: AbortSignal; silent?: boolean } = {}) => {
      if (!enabled || scopeRef.current !== scope || signal?.aborted) return;
      refreshControllerRef.current?.abort();
      loadMoreControllerRef.current?.abort();
      loadMoreControllerRef.current = null;
      setLoadMoreStatus("idle");
      const generation = ++generationRef.current;
      if (dataSourceMode !== "api") {
        setResultOwner(owner);
        setResults(mockResults);
        setHasMoreResults(false);
        setCurrentPage(1);
        setTotalResults(mockResults.length);
        setListStatus("ready");
        setErrorMessage(undefined);
        return;
      }

      const controller = new AbortController();
      refreshControllerRef.current = controller;
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const isCurrent = () => !controller.signal.aborted && scopeRef.current === scope && generationRef.current === generation;
      if (!silent) setListStatus("loading");
      setErrorMessage(undefined);

      try {
        const resultPage = await apiResults.getResultPage(filters, { signal: controller.signal });
        if (!isCurrent()) return;
        setResultOwner(owner);
        setResults(resultPage.results);
        setHasMoreResults(resultPage.hasMore);
        setCurrentPage(resultPage.page);
        setTotalResults(resultPage.total);
        setListStatus(resultPage.results.length > 0 ? "ready" : "idle");
      } catch (error) {
        if (!isCurrent()) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить результаты API";
        if (!silent) {
          setResults([]);
          setHasMoreResults(false);
          setTotalResults(0);
          setListStatus("error");
        }
        setErrorMessage(message);
        if (!silent) showToast(`Не удалось загрузить результаты API: ${message}`);
      } finally {
        signal?.removeEventListener("abort", abort);
        if (refreshControllerRef.current === controller) refreshControllerRef.current = null;
      }
    },
    [apiResults, dataSourceMode, enabled, filters, mockResults, owner, scope, showToast],
  );

  const loadMoreResults = useCallback(async () => {
    if (!enabled || dataSourceMode !== "api" || !hasMoreResults || loadMoreControllerRef.current || refreshControllerRef.current || scopeRef.current !== scope) return;
    const controller = new AbortController();
    const generation = generationRef.current;
    const isCurrent = () => !controller.signal.aborted && scopeRef.current === scope && generationRef.current === generation;
    loadMoreControllerRef.current = controller;
    setLoadMoreStatus("loading");
    try {
      const resultPage = await apiResults.getResultPage(filters, { page: currentPage + 1, signal: controller.signal });
      if (!isCurrent()) return;
      setResults((current) => mergePatrolResults(current, resultPage.results));
      setCurrentPage(resultPage.page);
      setHasMoreResults(resultPage.hasMore);
      setTotalResults(resultPage.total);
      setLoadMoreStatus("ready");
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "Не удалось загрузить следующую страницу результатов";
      setLoadMoreStatus("error");
      showToast(`Не удалось загрузить следующую страницу результатов: ${message}`);
    } finally {
      if (loadMoreControllerRef.current === controller) loadMoreControllerRef.current = null;
    }
  }, [apiResults, currentPage, dataSourceMode, enabled, filters, hasMoreResults, scope, showToast]);

  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadMoreStatus("idle");
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = null;
    return () => {
      loadMoreControllerRef.current?.abort();
      refreshControllerRef.current?.abort();
    };
  }, [scope]);

  useEffect(() => {
    setResults(dataSourceMode === "mock" ? mockResults : []);
    setResultOwner(owner);
    setSelectedDetail(undefined);
    setSelectedResults([]);
    setHasMoreResults(false);
    setCurrentPage(1);
    setTotalResults(dataSourceMode === "mock" ? mockResults.length : 0);
    setErrorMessage(undefined);
  }, [owner]);

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
      if (selectedResultId && !(dataSourceMode === "api" && isBackendResultId(selectedResultId))) {
        onSelectResult("");
      }
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
    const selection = `${owner}:${selectedResultId}`;
    if (detailSelectionRef.current !== selection) {
      detailSelectionRef.current = selection;
      setSelectedDetail(undefined);
      setSelectedResults([]);
    }

    if (!enabled || !selectedResultId || dataSourceMode !== "api" || !isBackendResultId(selectedResultId)) {
      setDetailStatus("idle");
      return;
    }

    const controller = new AbortController();
    const requestedOwner = owner;
    setDetailStatus("loading");

    apiResults
      .getResult(selectedResultId, { signal: controller.signal })
      .then(async (result) => {
        if (controller.signal.aborted || ownerRef.current !== requestedOwner) return;
        if (!exactSelectedListItem) {
          const relatedResults = result.assignmentId
            ? await apiResults.getResults({ assignmentId: result.assignmentId }, { signal: controller.signal })
            : [result];
          if (controller.signal.aborted || ownerRef.current !== requestedOwner) return;
          setSelectedResults(mergePatrolResults([result], relatedResults));
        } else {
          const relatedResults = result.assignmentId
            ? visibleResults.filter(item => item.assignmentId === result.assignmentId)
            : [result];
          setSelectedResults(mergePatrolResults(relatedResults, [result]));
        }

        setSelectedDetail(result);
        setDetailStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted || ownerRef.current !== requestedOwner) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить детали результата API";
        setDetailStatus("error");
        setErrorMessage(message);
        showToast(`Не удалось загрузить детали результата API: ${message}`);
      });

    return () => controller.abort();
  }, [apiResults, dataSourceMode, enabled, exactSelectedListItem, owner, selectedResultId, showToast]);

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
    results: visibleResults,
    selectedResults: resultOwner === owner && selectedResults.some(result => result.id === selectedResultId) ? selectedResults : emptyResults,
    selectedResult,
    totalResults,
  };
}

function mergePatrolResults(current: PatrolResult[], related: PatrolResult[]) {
  const byId = new Map(current.map((result) => [result.id, result]));
  related.forEach((result) => byId.set(result.id, result));
  return Array.from(byId.values());
}
