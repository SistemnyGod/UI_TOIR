import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  AlertTriangle,
  Archive,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  MoreVertical,
  PlusCircle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  User,
} from "lucide-react";
import type { ApiFileResponse } from "../../../api/client";
import { createApiResultsRepository, isBackendResultId } from "../../../repositories/resultsRepository";
import { useResultsWorkspace } from "../../../hooks/useResultsWorkspace";
import type { DataSourceMode, PatrolResult, ResultMode, RouteDirectoryItem, ScreenId, ServiceRequest, DataSourceStatus } from "../../../types";
import { PatrolResultDetails, type ResultPointMode, type ResultReadingMode } from "./PatrolResultDetails";
import { ResultMediaViewer } from "./ResultMediaViewer";
import { FoundRemarksView } from "./FoundRemarksView";
import { PatrolAppealsView } from "./PatrolAppealsView";
import { PatrolRequestHistory } from "./PatrolRequestHistory";
import type { ResultGroup } from "./resultTypes";
import { Button, CompactTable, PageHeader, SectionTabs, type CompactTableColumn } from "../../../shared/ui";
import "./resultsWorkspace.css";
import "./resultsRedesign.css";
import "./resultsReadability.css";
import { buildResultJournalCsv, buildPatrolReportCsv, filterResultJournal, resultDateRange, resultDateTime, resultHasIssue, usefulResultText, resultAttachmentCount, type ResultDatePeriod } from "./resultPresentation";
import { buildCounters, buildMetrics, buildResultApiFilters, buildResultGroups, buildRouteOptions, buildExportFilters, displayShift, filterGroups } from "./resultJournalModel";
import { useResultPreview, mapWithConcurrency } from "./useResultPreview";
import { PhoneDisclosure } from "../../../shared/ui/PhoneDisclosure";
import { ResultSummaryMetrics } from "./ResultSummaryMetrics";

export { buildCounters, buildMetrics, buildResultApiFilters, buildResultGroups, filterGroups, summarizeDuration } from "./resultJournalModel";
export { mapWithConcurrency } from "./useResultPreview";

export interface ResultsScreenProps {
  sessionKey?: string;
  canCreateRequest?: boolean;
  canManageResults?: boolean;
  dataSourceMode: DataSourceMode;
  mode?: ResultMode;
  selectedResultId?: string;
  openResultId?: string;
  /** Preview data for the existing mock repository; API mode ignores this. */
  mockResults?: PatrolResult[];
  onOpenResultHandled?: () => void;
  onModeChange?: (mode: ResultMode) => void;
  onSelectResult?: (id: string) => void;
  onCreateRequest?: (sourceResultId?: string) => void;
  onOpenRequest?: (resultId?: string) => void;
  onNavigate?: (screen: ScreenId) => void;
  onNotify?: (message: string) => void;
  routeDirectory?: RouteDirectoryItem[];
  requests?: ServiceRequest[];
  requestListStatus?: DataSourceStatus;
  requestListErrorMessage?: string;
  onRetryRequests?: () => Promise<void> | void;
  onOpenRequestById?: (requestId: string, request?: ServiceRequest) => void;
  onOpenResult?: (resultId: string) => void;
  addToast?: (message: string, kind?: "success" | "error" | "info") => void;
}

const FILTERS: Array<{ id: ResultMode; label: string }> = [
  { id: "all", label: "Все обходы" },
  { id: "issues", label: "С замечаниями" },
  { id: "late", label: "Просроченные" },
  { id: "photos", label: "С медиа" },
  { id: "noPhotos", label: "Без медиа" },
];

const showResultInspector = false;
const CONTEXT_PANEL_WIDTH = 220;
const CONTEXT_PANEL_HEIGHT = 190;
const RESULT_VISIBILITY_STORAGE_KEY = "patrol360.results.hiddenGroups.v1";
const RESULT_DETAIL_CONCURRENCY = 4;
const JOURNAL_PAGE_SIZE = 6;

interface ResultVisibilityState {
  archived: string[];
  deleted: string[];
}

const emptyResultVisibilityState: ResultVisibilityState = { archived: [], deleted: [] };
const noop = () => undefined;
const emptySelectedResults: PatrolResult[] = [];

export function ResultsWorkspace({
  sessionKey,
  canCreateRequest = true,
  canManageResults = true,
  dataSourceMode,
  mode = "all",
  selectedResultId = "",
  openResultId = "",
  mockResults,
  onOpenResultHandled,
  onModeChange,
  onSelectResult,
  onCreateRequest,
  onOpenRequest,
  onNotify,
  routeDirectory = [],
  requests = [],
  requestListStatus = "idle",
  requestListErrorMessage,
  onRetryRequests,
  onOpenRequestById,
  onOpenResult,
  addToast,
}: ResultsScreenProps) {
  const [activeMode, setActiveMode] = useState<ResultMode>(mode);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState("all");
  const [datePeriod, setDatePeriod] = useState<ResultDatePeriod>("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [page, setPage] = useState(1);
  const [updatedAt, setUpdatedAt] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [detailFocusResultId, setDetailFocusResultId] = useState<string>();
  const [detailPointMode, setDetailPointMode] = useState<ResultPointMode>("all");
  const [detailReadingMode, setDetailReadingMode] = useState<ResultReadingMode>("point");
  const [contextMenu, setContextMenu] = useState<{ groupId: string; x: number; y: number } | null>(null);
  const contextPanelRef = useRef<HTMLDivElement>(null);
  const rowMenuTriggerRef = useRef<HTMLElement | null>(null);
  const [archivedGroupIds, setArchivedGroupIds] = useState<string[]>(() => readResultVisibilityState().archived);
  const [deletedGroupIds, setDeletedGroupIds] = useState<string[]>(() => readResultVisibilityState().deleted);
  const detailOwner = `${sessionKey ?? ""}:${dataSourceMode}`;
  const previousDetailOwnerRef = useRef(detailOwner);
  useEffect(() => {
    if (previousDetailOwnerRef.current === detailOwner) return;
    previousDetailOwnerRef.current = detailOwner;
    setOpenGroupId(null);
  }, [detailOwner]);
  const [activeView, setActiveView] = useState<"results" | "remarks" | "requests" | "appeals">("results");
  const [exportInProgress, setExportInProgress] = useState(false);
  const [mutatingGroupId, setMutatingGroupId] = useState<string | null>(null);
  const apiResultsRepository = useMemo(() => createApiResultsRepository(), []);
  const {
    detailedResults, detailLoadErrors, loadResultDetails, forgetDetails,
    mediaPreview, photoLoadingResultId, mediaTriggerRef,
    openAttachment, closeMedia, selectAttachment, cancelPendingMedia, downloadPreviewAttachment,
  } = useResultPreview({ ownerKey: detailOwner, dataSourceMode, openGroupId, repository: apiResultsRepository, addToast });
  const handledOpenResultRef = useRef("");
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const apiQuery = dataSourceMode === "api" ? debouncedQuery : query;
  const dateRange = useMemo(() => resultDateRange(datePeriod), [datePeriod]);
  const resultApiFilters = useMemo(() => ({ ...buildResultApiFilters(activeMode, routeFilter, apiQuery), ...dateRange }), [activeMode, apiQuery, routeFilter, dateRange]);

  const { results, selectedResult, selectedResults = emptySelectedResults, listStatus, errorMessage, refreshResults, exportResults, hasMoreResults, loadMoreResults, loadMoreStatus, totalResults } = useResultsWorkspace({
    dataSourceMode,
    sessionKey,
    mockResults,
    selectedResultId,
    onSelectResult: onSelectResult ?? noop,
    showToast: onNotify ?? noop,
    filters: resultApiFilters,
  });

  const mergedResults = useMemo(
    () => results.map((result) => detailedResults[result.id] ?? result),
    [detailedResults, results],
  );
  const groups = useMemo(() => buildResultGroups(mergedResults), [mergedResults]);
  const detailGroups = useMemo(() => buildResultGroups(selectedResults.map((result) => detailedResults[result.id] ?? result)), [detailedResults, selectedResults]);
  const viewGroups = useMemo(() => [...groups, ...detailGroups.filter((detail) => !groups.some((group) => group.id === detail.id))], [groups, detailGroups]);
  const visibleGroups = useMemo(() => {
    if (dataSourceMode === "api") return groups;
    const hiddenIds = new Set([...archivedGroupIds, ...deletedGroupIds]);
    return groups.filter((group) => !hiddenIds.has(group.id));
  }, [archivedGroupIds, dataSourceMode, deletedGroupIds, groups]);
  const routeOptions = useMemo(() => buildRouteOptions(visibleGroups, routeDirectory), [routeDirectory, visibleGroups]);
  const clientQuery = dataSourceMode === "api" ? "" : query;
  const filteredGroups = useMemo(() => filterResultJournal(filterGroups(visibleGroups, activeMode, clientQuery, routeFilter), dateRange, shiftFilter, sortOrder), [visibleGroups, activeMode, clientQuery, routeFilter, dateRange, shiftFilter, sortOrder]);
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / JOURNAL_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageOffset = (currentPage - 1) * JOURNAL_PAGE_SIZE;
  const pageGroups = filteredGroups.slice(pageOffset, pageOffset + JOURNAL_PAGE_SIZE);
  const summaryGroups = useMemo(() => filterResultJournal(visibleGroups, dateRange, shiftFilter, sortOrder), [visibleGroups, dateRange, shiftFilter, sortOrder]);
  const counters = useMemo(() => buildCounters(summaryGroups), [summaryGroups]);
  const metrics = useMemo(() => buildMetrics(summaryGroups), [summaryGroups]);
  const loadedSampleCaption = dataSourceMode === "api" && hasMoreResults
    ? `По ${groups.length} загруженным обходам из ${totalResults}`
    : "По текущей выборке";
  const loading = listStatus === "loading";
  const error = listStatus === "error" ? errorMessage : undefined;

  useEffect(() => { setPage(1); setContextMenu(null); }, [activeMode, query, routeFilter, datePeriod, shiftFilter, sortOrder, dataSourceMode]);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  useEffect(() => { if (listStatus === "ready") setUpdatedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })); }, [listStatus, results]);

  const selectedGroup =
    (openGroupId ? viewGroups.find((group) => group.id === openGroupId) : undefined) ??
    (selectedResult ? filteredGroups.find((group) => group.results.some((result) => result.id === selectedResult.id)) : undefined) ??
    filteredGroups[0];
  const modalGroup = openGroupId ? viewGroups.find((group) => group.id === openGroupId) : undefined;
  const mediaPoints = modalGroup?.results.filter(result => resultAttachmentCount(result) > 0) ?? emptySelectedResults;
  const mediaPointIndex = mediaPoints.findIndex(result => result.id === mediaPreview?.result.id);
  const contextGroup = contextMenu ? visibleGroups.find((group) => group.id === contextMenu.groupId) : undefined;

  useEffect(() => {
    if (!openResultId) { handledOpenResultRef.current = ""; return; }
    if (handledOpenResultRef.current === openResultId) return;
    const requestedGroup = viewGroups.find((group) => group.results.some((result) => result.id === openResultId));
    if (!requestedGroup) return;

    handledOpenResultRef.current = openResultId;
    setDetailFocusResultId(openResultId);
    setDetailPointMode("all"); setDetailReadingMode("point");
    setOpenGroupId(requestedGroup.id);
    onSelectResult?.(openResultId);
    onOpenResultHandled?.();
  }, [onOpenResultHandled, onSelectResult, openResultId, viewGroups]);

  useEffect(() => {
    if (routeFilter !== "all" && !routeOptions.some((route) => route.id === routeFilter)) {
      setRouteFilter("all");
    }
  }, [routeFilter, routeOptions]);

  useEffect(() => {
    if (dataSourceMode === "api") {
      setArchivedGroupIds((current) => current.length === 0 ? current : []);
      setDeletedGroupIds((current) => current.length === 0 ? current : []);
      writeResultVisibilityState(emptyResultVisibilityState);
    }
  }, [dataSourceMode]);

  useEffect(() => {
    if (dataSourceMode !== "api") {
      writeResultVisibilityState({ archived: archivedGroupIds, deleted: deletedGroupIds });
    }
  }, [archivedGroupIds, dataSourceMode, deletedGroupIds]);

  const changeFilter = (nextMode: ResultMode) => {
    setActiveMode(nextMode);
    onModeChange?.(nextMode);
  };

  const selectGroup = (group: ResultGroup) => {
    onSelectResult?.(group.results[0]?.id ?? "");
    setOpenGroupId(null);
    setContextMenu(null);
  };

  const openRowMenu = (group: ResultGroup, trigger: HTMLElement) => {
    rowMenuTriggerRef.current = trigger;
    const rect = trigger.getBoundingClientRect();
    setContextMenu((current) => current?.groupId === group.id ? null : {
      groupId: group.id,
      x: Math.max(12, Math.min(rect.right - CONTEXT_PANEL_WIDTH, window.innerWidth - CONTEXT_PANEL_WIDTH - 12)),
      y: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - CONTEXT_PANEL_HEIGHT - 12)),
    });
  };

  const openContextPanel = (event: MouseEvent<HTMLElement>, group: ResultGroup) => {
    event.preventDefault();
    rowMenuTriggerRef.current = null;
    onSelectResult?.(group.results[0]?.id ?? "");
    setOpenGroupId(null);
    setContextMenu(null);
    setContextMenu({
      groupId: group.id,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - CONTEXT_PANEL_WIDTH - 12)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - CONTEXT_PANEL_HEIGHT - 12)),
    });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const buttons = () => Array.from(contextPanelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    buttons()[0]?.focus();
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setContextMenu(null); rowMenuTriggerRef.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = buttons(); const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0 || !items.length) return;
        event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }
    };
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!contextPanelRef.current?.contains(target) && !rowMenuTriggerRef.current?.contains(target)) setContextMenu(null);
    };
    document.addEventListener("keydown", keyDown); document.addEventListener("pointerdown", pointerDown);
    return () => { document.removeEventListener("keydown", keyDown); document.removeEventListener("pointerdown", pointerDown); };
  }, [contextMenu]);

  const notifyAction = (message: string, kind: "success" | "error" | "info") => {
    if (addToast) {
      addToast(message, kind);
    } else {
      onNotify?.(message);
    }
  };

  const handleGroupAction = async (group: ResultGroup, action: "archive" | "delete") => {
    if (mutatingGroupId) return;
    if (dataSourceMode === "api" && action === "delete" && !window.confirm(`Удалить результаты обхода «${group.route}» вместе с вложениями? Действие нельзя отменить.`)) {
      return;
    }

    setContextMenu(null);
    if (openGroupId === group.id) setOpenGroupId(null);

    if (dataSourceMode !== "api") {
      const setHiddenIds = action === "archive" ? setArchivedGroupIds : setDeletedGroupIds;
      setHiddenIds((current) => (current.includes(group.id) ? current : [...current, group.id]));
      notifyAction(action === "archive" ? "Результат убран в локальный архив" : "Результат удалён из локального списка", action === "archive" ? "info" : "success");
      return;
    }

    if (!canManageResults) {
      notifyAction("Недостаточно прав для изменения результатов обхода", "error");
      return;
    }

    const resultId = group.results[0]?.id;
    if (!isBackendResultId(resultId)) {
      notifyAction("Серверный идентификатор результата отсутствует", "error");
      return;
    }

    setMutatingGroupId(group.id);
    try {
      if (action === "archive") {
        await apiResultsRepository.archiveResultGroup(resultId);
      } else {
        await apiResultsRepository.deleteResultGroup(resultId);
      }

      forgetDetails(group.results);
      await refreshResults();
      notifyAction(action === "archive" ? "Результаты обхода перенесены в архив" : "Результаты обхода удалены", "success");
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "сервер не выполнил операцию";
      notifyAction(`${action === "archive" ? "Не удалось перенести результаты в архив" : "Не удалось удалить результаты"}: ${message}`, "error");
    } finally {
      setMutatingGroupId(null);
    }
  };

  const openDetails = (group: ResultGroup, options: { resultId?: string; pointMode?: ResultPointMode; readingMode?: ResultReadingMode } = {}) => {
    setContextMenu(null);
    setDetailFocusResultId(options.resultId);
    setDetailPointMode(options.pointMode ?? "all"); setDetailReadingMode(options.readingMode ?? "point");
    onSelectResult?.(group.results[0]?.id ?? "");
    setOpenGroupId(group.id);
  };

  useEffect(() => {
    if (dataSourceMode !== "api" || !modalGroup) return;
    // Include deep links from notifications and request history, not only row clicks.
    void mapWithConcurrency(modalGroup.results, RESULT_DETAIL_CONCURRENCY, (result) => loadResultDetails(result).catch(() => result));
  }, [dataSourceMode, modalGroup?.id]);

  const exportPatrolResults = async (group?: ResultGroup) => {
    if (exportInProgress) return;
    if (dataSourceMode !== "api" || (!group && shiftFilter !== "all") || (group && !group.results.some((result) => result.assignmentId))) {
      const content = group ? buildPatrolReportCsv([group]) : buildResultJournalCsv(filteredGroups);
      downloadApiFile({ blob: new Blob([content], { type: "text/csv;charset=utf-8" }), contentType: "text/csv", fileName: "patrol-results.csv", downloadName: "patrol-results.csv", headers: {} });
      notifyAction(hasMoreResults && !group ? "Экспортирована загруженная выборка журнала. Для полной выгрузки загрузите остальные обходы." : "Журнал обходов экспортирован", "success");
      return;
    }

    setExportInProgress(true);
    try {
      const file = await exportResults({ ...buildExportFilters(group, activeMode, routeFilter, query), ...(!group ? dateRange : {}) });
      if (!file) {
        addToast?.("Экспорт доступен при подключении к API", "info");
        return;
      }

      downloadApiFile(file);
      const metadata = readExportMetadata(file);
      if (metadata.truncated) {
        addToast?.(`Экспорт усечен: выгружены первые ${metadata.rowCount ?? metadata.maxRows ?? "доступные"} строк по лимиту ${metadata.maxRows ?? "сервера"}`, "info");
      } else {
        addToast?.(
          metadata.rowCount !== undefined
            ? `Экспорт результатов обходов сформирован: ${metadata.rowCount} строк`
            : "Экспорт результатов обходов сформирован",
          "success",
        );
      }
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : "не удалось сформировать экспорт";
      addToast?.(`Не удалось сформировать экспорт результатов: ${message}`, "error");
    } finally {
      setExportInProgress(false);
    }
  };

  const createRequest = async (sourceGroup = selectedGroup) => {
    if (!sourceGroup) return;
    onCreateRequest?.(sourceGroup.results[0]?.id);
    addToast?.("Открыта форма заявки по результату обхода", "success");
  };

  const resultColumns: CompactTableColumn<ResultGroup>[] = [
    { key: "time", header: "Дата и время", width: "110px", render: (group) => {
      const time = resultDateTime(group.lastScanAt ?? group.finishedAt ?? group.firstScanAt);
      return <span className="results-review-table-meta"><strong>{time.date}</strong><small>{time.time}</small></span>;
    } },
    { key: "route", header: "Маршрут", width: "130px", render: (group) => <strong className="result-journal-route">{group.route}</strong> },
    { key: "employee", header: "Сотрудник", width: "170px", render: (group) => <span className="result-journal-employee">{group.employee}</span> },
    { key: "shift", header: "Смена", width: "70px", render: (group) => displayShift(group.shift) },
    { key: "points", header: "Точки", width: "65px", render: (group) => <span className="result-journal-points">{group.okPoints + group.issuePoints} / {group.points}</span> },
    { key: "issues", header: "Замечания и комментарии", render: (group) => {
      const recent = [...group.results].reverse();
      const note = recent.find(result => resultHasIssue(result) && usefulResultText(result.comment)) ?? recent.find(result => usefulResultText(result.comment));
      return <div className="result-journal-notes"><span className={`result-journal-remarks ${group.issuePoints ? "has-issues" : "is-clean"}`}>
        {group.issuePoints ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}{group.issuePoints ? `${group.issuePoints} ${remarkCountLabel(group.issuePoints)}` : "Без замечаний"}</span>
        {note ? <button type="button" className="result-journal-comment" aria-label={`Комментарии обхода: ${group.route}, ${group.employee}`} onClick={event => { event.stopPropagation(); openDetails(group, { readingMode: "comments" }); }} title="Читать все комментарии"><strong>{note.point}</strong><span>{note.comment}</span></button> : null}</div>;
    } },
    { key: "photos", header: "Медиа", width: "80px", render: (group) => group.photos > 0 ? <button type="button" className="result-journal-media result-journal-media-link" aria-label={`Вложения обхода: ${group.route}, ${group.employee}`} onClick={event => { event.stopPropagation(); openDetails(group, { pointMode: "photos", resultId: group.results.find(result => resultAttachmentCount(result) > 0)?.id }); }}><Camera size={17} />{group.photos}</button> : <span className="result-journal-media">—</span> },
    { key: "actions", header: "Действия", width: "150px", sticky: "right", render: (group) => <div className="results-review-table-actions">
      <Button onClick={(event) => { event.stopPropagation(); openDetails(group); }} variant="secondary">Открыть</Button>
      <div className="results-review-row-menu-wrap"><button aria-expanded={contextMenu?.groupId === group.id} aria-haspopup="menu"
        aria-label={`Действия результата: ${group.route}, ${group.employee}`} className="results-review-row-more" disabled={(!canManageResults && !canCreateRequest) || mutatingGroupId === group.id}
        onClick={(event) => { event.stopPropagation(); openRowMenu(group, event.currentTarget); }} type="button"><MoreVertical size={18} /></button>

      </div>
    </div> },
  ];

  if (error) {
    return (
      <div className="results-review-screen results-workspace-v2">
        <section className="results-review-empty">
          <AlertTriangle size={32} />
          <h3>Не удалось загрузить результаты</h3>
          <p>{error}</p>
          <Button variant="primary" className="primary-action" onClick={() => void refreshResults()}>
            Повторить загрузку
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="results-review-screen results-workspace-v2" onClick={() => setContextMenu(null)}>
      <PageHeader
        actions={(
          <div className="results-review-actions">
            <Button variant="secondary" disabled={exportInProgress || !filteredGroups.length} onClick={() => void exportPatrolResults()}><Download size={17} />{exportInProgress ? "Экспорт…" : "Экспорт"}</Button>
          </div>
        )}
        className="results-review-hero"
        description="Проверяйте точки и замечания по завершённым обходам."
        eyebrowClassName="results-review-eyebrow"
        title="Результаты обходов"
      />

      <nav className="results-review-view-tabs" aria-label={"\u0420\u0430\u0437\u0434\u0435\u043b\u044b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u0432"}>
        <button className={activeView === "results" ? "is-active" : ""} onClick={() => setActiveView("results")} type="button">
          Обходы
        </button>
        <button className={activeView === "remarks" ? "is-active" : ""} onClick={() => setActiveView("remarks")} type="button">
          <AlertTriangle size={16} />
          {"\u041d\u0430\u0439\u0434\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u044f"}
        </button>
        <button className={activeView === "requests" ? "is-active" : ""} onClick={() => setActiveView("requests")} type="button">
          <FileText size={16} />
          История заявок
        </button>
        <button className={activeView === "appeals" ? "is-active" : ""} onClick={() => setActiveView("appeals")} type="button">Обращения диспетчеру</button>
      </nav>

      {activeView === "appeals" ? <PatrolAppealsView dataSourceMode={dataSourceMode} /> : activeView === "remarks" ? (
        <FoundRemarksView dataSourceMode={dataSourceMode} onNotify={onNotify} />
      ) : activeView === "requests" ? (
        <PatrolRequestHistory
          dataSourceMode={dataSourceMode}
          sessionKey={sessionKey}
          errorMessage={requestListErrorMessage}
          onOpenRequest={onOpenRequestById ?? onOpenRequest}
          onOpenResult={onOpenResult}
          onRetry={onRetryRequests}
          requests={requests}
          status={requestListStatus}
        />
      ) : (
        <>

      <ResultSummaryMetrics metrics={metrics} caption={loadedSampleCaption} />

      <section className="results-review-layout">
        <div className="results-review-main">
          <div className="result-journal-toolbar">
            <div className="result-journal-filter-row">
              <label className="result-journal-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по маршруту, сотруднику, точке…" aria-label="Поиск по результатам обходов" /></label>
              <PhoneDisclosure title={`Фильтры${datePeriod !== "all" || routeFilter !== "all" || shiftFilter !== "all" ? " · применены" : ""}`}>
              <div className="result-journal-secondary-filters"><label className="result-journal-select"><span>Период</span><select aria-label="Период результатов" value={datePeriod} onChange={(event) => setDatePeriod(event.target.value as ResultDatePeriod)}><option value="all">Все даты</option><option value="today">Сегодня</option><option value="week">Последние 7 дней</option><option value="month">Последние 30 дней</option></select></label>
              <label className="result-journal-select"><span>Маршрут</span><select aria-label="Маршрут" value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}><option value="all">Все маршруты</option>{routeOptions.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
              <label className="result-journal-select"><span>Смена</span><select aria-label="Смена результатов" value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}><option value="all">Все смены</option><option value="День">День</option><option value="Ночь">Ночь</option></select></label>
              </div></PhoneDisclosure>
            </div>
            <div className="result-journal-filter-footer">
              <SectionTabs activeClassName="is-active" ariaLabel="Фильтр результатов" className="result-journal-filter-tabs" onChange={changeFilter} tabs={FILTERS.map((filter) => ({ ...filter, count: counters[filter.id] }))} value={activeMode} />
              <div className="result-journal-update"><select aria-label="Порядок результатов" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option></select>
                <span aria-live="polite">{loading ? "Обновляем…" : updatedAt ? `Обновлено в ${updatedAt}` : ""}</span><Button aria-label="Обновить результаты" disabled={loading} onClick={() => void refreshResults()} variant="ghost"><RefreshCw size={17} /></Button></div>
            </div>
            {hasMoreResults ? <p className="result-journal-sample-note">Загружено {groups.length} из {totalResults} обходов. Смена, сортировка и сводка учитывают загруженные записи.</p> : null}
          </div>

          {loading && groups.length === 0 ? (
            <section className="results-review-empty">
              <FileText size={32} />
              <h3>Загружаем результаты</h3>
              <p>Подождите, список обходов обновляется.</p>
            </section>
          ) : filteredGroups.length === 0 ? (
            <section className="results-review-empty">
              <FileText size={32} />
              <h3>{groups.length === 0 ? "Результатов пока нет" : "По фильтру ничего не найдено"}</h3>
              <p>
                {groups.length === 0
                  ? "Когда мобильное приложение отправит отчеты, они появятся в этом журнале."
                  : "Измените фильтр или поисковую строку."}
              </p>
            </section>
          ) : (
            <CompactTable
              className="results-review-compact-table"
              columns={resultColumns}
              emptyText="Результаты по текущим фильтрам не найдены"
              getRowClassName={(group) => `${selectedGroup?.id === group.id ? "selected" : ""} ${group.issuePoints > 0 || group.issues > 0 ? "has-issues" : ""}`.trim()}
              getRowKey={(group) => group.id}
              onRowClick={(group) => selectGroup(group)}
              onRowContextMenu={(event, group) => openContextPanel(event, group)}
              onRowDoubleClick={(group) => openDetails(group)}
              rows={pageGroups}
            />
          )}
          {filteredGroups.length ? <div className="result-journal-pagination">
            <span aria-live="polite">Показано {pageOffset + 1}–{Math.min(pageOffset + JOURNAL_PAGE_SIZE, filteredGroups.length)} из {filteredGroups.length}{hasMoreResults ? " загруженных" : ""}</span>
            <nav aria-label="Страницы результатов"><button type="button" aria-label="Предыдущая страница результатов" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
              {journalPageNumbers(currentPage, pageCount).map((number, index) => number === null ? <span key={`gap-${index}`}>…</span> : <button type="button" key={number} aria-label={`Страница результатов ${number}`} aria-current={number === currentPage ? "page" : undefined} onClick={() => { setPage(number); setContextMenu(null); }}>{number}</button>)}
              <button type="button" aria-label="Следующая страница результатов" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></nav>
          </div> : null}
          {hasMoreResults ? <div className="result-journal-load-more"><Button disabled={loadMoreStatus === "loading"} onClick={() => void loadMoreResults()} variant="secondary">{loadMoreStatus === "loading" ? "Загружаем…" : "Загрузить ещё обходы"}</Button></div> : null}
        </div>

        {showResultInspector ? <aside className="results-review-panel results-review-inspector">
          {selectedGroup ? (
            <ResultInspector
              group={selectedGroup}
              onOpen={() => openDetails(selectedGroup)}
              onCreateRequest={() => void createRequest(selectedGroup)}
              canCreateRequest={canCreateRequest}
            />
          ) : (
            <section className="results-review-empty">
              <User size={32} />
              <h3>Результат не выбран</h3>
              <p>Выберите обход в журнале, чтобы увидеть сотрудника, маршрут, точки и медиа.</p>
            </section>
          )}
        </aside> : null}
      </section>
        </>
      )}

      {contextMenu && contextGroup ? (
        <div
          className="results-review-context-panel"
          ref={contextPanelRef}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <strong>{contextGroup.route}</strong>
          {canCreateRequest ? <button type="button" role="menuitem" onClick={() => { setContextMenu(null); void createRequest(contextGroup); }}><PlusCircle size={16} />Создать заявку</button> : null}
          <button type="button" role="menuitem" data-action="archive" disabled={!canManageResults || mutatingGroupId === contextGroup.id} onClick={() => void handleGroupAction(contextGroup, "archive")}>
            <Archive size={16} />
            {"\u0412 \u0430\u0440\u0445\u0438\u0432"}
          </button>
          <button type="button" role="menuitem" data-action="delete" className="is-danger" disabled={!canManageResults || mutatingGroupId === contextGroup.id} onClick={() => void handleGroupAction(contextGroup, "delete")}>
            <Trash2 size={16} />
            {"\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b"}
          </button>
        </div>
      ) : null}

      {modalGroup ? (
        <PatrolResultDetails
          key={`${modalGroup.id}:${detailFocusResultId ?? ""}:${detailPointMode}:${detailReadingMode}`}
          group={modalGroup}
          initialResultId={detailFocusResultId}
          initialPointMode={detailPointMode}
          initialReadingMode={detailReadingMode}
          canCreateRequest={canCreateRequest}
          canOpenRequest={Boolean(onOpenRequest)}
          loadErrors={detailLoadErrors}
          onRetryResult={(result) => void loadResultDetails(result).catch(() => undefined)}
          onClose={() => { closeMedia(); setOpenGroupId(null); }}
          onCreateRequest={() => void createRequest(modalGroup)}
          onExport={() => void exportPatrolResults(modalGroup)}
          onOpenRequest={() => onOpenRequest?.(modalGroup.results[0]?.id)}
          onOpenAttachment={openAttachment}
          onSelectionChange={cancelPendingMedia}
          onBeforeOpenAttachment={(element) => {
            mediaTriggerRef.current = element;
          }}
          photoLoadingResultId={photoLoadingResultId}
          exportInProgress={exportInProgress}
        />
      ) : null}
      {mediaPreview ? (
        <ResultMediaViewer
          preview={mediaPreview}
          onClose={closeMedia}
          onDownload={downloadPreviewAttachment}
          onSelect={selectAttachment}
          pointPosition={mediaPointIndex >= 0 ? { current: mediaPointIndex + 1, total: mediaPoints.length } : undefined}
          pointLoading={photoLoadingResultId !== null}
          onPreviousPoint={mediaPointIndex > 0 ? () => { const point = mediaPoints[mediaPointIndex - 1]; void openAttachment(point, (modalGroup?.results.findIndex(result => result.id === point.id) ?? -1) + 1); } : undefined}
          onNextPoint={mediaPointIndex >= 0 && mediaPointIndex < mediaPoints.length - 1 ? () => { const point = mediaPoints[mediaPointIndex + 1]; void openAttachment(point, (modalGroup?.results.findIndex(result => result.id === point.id) ?? -1) + 1); } : undefined}
          returnFocusRef={mediaTriggerRef}
        />
      ) : null}
    </div>
  );
}

function downloadApiFile(file: ApiFileResponse) {
  const href = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.fileName || file.downloadName || "patrol-results.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function readExportMetadata(file: ApiFileResponse) {
  return {
    maxRows: readIntegerHeader(file, "x-patrol360-export-max-rows"),
    rowCount: readIntegerHeader(file, "x-patrol360-export-row-count"),
    truncated: readBooleanHeader(file, "x-patrol360-export-truncated"),
  };
}

function readBooleanHeader(file: ApiFileResponse, name: string) {
  return file.headers[name]?.toLowerCase() === "true";
}

function readIntegerHeader(file: ApiFileResponse, name: string) {
  const value = Number.parseInt(file.headers[name] ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
}

function ResultInspector({
  canCreateRequest,
  group,
  onCreateRequest,
  onOpen,
}: {
  canCreateRequest: boolean;
  group: ResultGroup;
  onCreateRequest: () => void;
  onOpen: () => void;
}) {
  return (
    <section className="results-review-inspector-card">
      <div className="results-review-inspector-head">
        <div>
          <small>Выбранный обход</small>
          <h3>{group.route}</h3>
        </div>
        <StatusPill issue={group.issuePoints > 0 || group.issues > 0} />
      </div>
      <dl className="results-review-inspector-list">
        <div>
          <dt>Сотрудник</dt>
          <dd>{group.employee}</dd>
        </div>
        <div>
          <dt>Территория</dt>
          <dd>{group.territory}</dd>
        </div>
        <div>
          <dt>Смена</dt>
          <dd>{displayShift(group.shift)}</dd>
        </div>
        <div>
          <dt>Начало</dt>
          <dd>{group.startedAt ?? group.firstScanAt ?? "нет данных"}</dd>
        </div>
        <div>
          <dt>Окончание</dt>
          <dd>{group.finishedAt ?? group.lastScanAt ?? "нет данных"}</dd>
        </div>
        <div>
          <dt>Итог времени</dt>
          <dd>{group.duration.label}</dd>
        </div>
        <div>
          <dt>Точки</dt>
          <dd>
            {group.okPoints} исправно / {group.issuePoints} неисправно
          </dd>
        </div>
        <div>
          <dt>Медиа</dt>
          <dd>{group.photos}</dd>
        </div>
      </dl>
      <div className="results-review-inspector-actions">
        <Button className="primary-action" onClick={onOpen} variant="primary">
          Открыть просмотр
        </Button>
        {canCreateRequest ? (
          <Button className="secondary-action" onClick={onCreateRequest} variant="secondary">
            Создать заявку
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function StatusPill({ issue }: { issue: boolean }) {
  return (
    <span className={`results-review-status-pill ${issue ? "is-issue" : "is-ok"}`}>
      {issue ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
      {issue ? "Есть замечания" : "Без замечаний"}
    </span>
  );
}

function readResultVisibilityState(): ResultVisibilityState {
  if (typeof window === "undefined") return emptyResultVisibilityState;

  try {
    const rawValue = window.localStorage.getItem(RESULT_VISIBILITY_STORAGE_KEY);
    if (!rawValue) return emptyResultVisibilityState;

    const parsed = JSON.parse(rawValue) as Partial<ResultVisibilityState>;
    return {
      archived: Array.isArray(parsed.archived) ? parsed.archived.filter((id): id is string => typeof id === "string") : [],
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return emptyResultVisibilityState;
  }
}

function writeResultVisibilityState(state: ResultVisibilityState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      RESULT_VISIBILITY_STORAGE_KEY,
      JSON.stringify({
        archived: Array.from(new Set(state.archived)),
        deleted: Array.from(new Set(state.deleted)),
      }),
    );
  } catch {
    // Local storage can be unavailable; current-session hiding still works.
  }
}

function journalPageNumbers(page: number, count: number): Array<number | null> {
  const pages = [...new Set([1, count, page - 1, page, page + 1].filter((value) => value >= 1 && value <= count))].sort((a, b) => a - b);
  return pages.flatMap((value, index) => index && value - pages[index - 1] > 1 ? [null, value] : [value]);
}

function remarkCountLabel(count: number) {
  if (count % 100 >= 11 && count % 100 <= 14) return "замечаний";
  return count % 10 === 1 ? "замечание" : count % 10 >= 2 && count % 10 <= 4 ? "замечания" : "замечаний";
}
