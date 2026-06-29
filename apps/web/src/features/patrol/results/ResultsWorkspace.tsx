import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  MapPinned,
  PlusCircle,
  Search,
  Timer,
  User,
} from "lucide-react";
import { createApiResultsRepository, downloadResultAttachment } from "../../../repositories/resultsRepository";
import { useResultsWorkspace } from "../../../hooks/useResultsWorkspace";
import type { DataSourceMode, PatrolResult, PatrolResultAttachment, ResultMode, ScreenId } from "../../../types";
import { PatrolResultDetails } from "./PatrolResultDetails";
import { ResultMediaViewer, type ResultMediaPreviewState } from "./ResultMediaViewer";
import type { DurationSummary, ResultGroup } from "./resultTypes";

export interface ResultsScreenProps {
  canCreateRequest?: boolean;
  dataSourceMode: DataSourceMode;
  mode?: ResultMode;
  selectedResultId?: string;
  onModeChange?: (mode: ResultMode) => void;
  onSelectResult?: (id: string) => void;
  onCreateRequest?: (sourceResultId?: string) => void;
  onOpenRequest?: (resultId?: string) => void;
  onNavigate?: (screen: ScreenId) => void;
  onNotify?: (message: string) => void;
  addToast?: (message: string, kind?: "success" | "error" | "info") => void;
}

const FILTERS: Array<{ id: ResultMode; label: string }> = [
  { id: "all", label: "Все обходы" },
  { id: "issues", label: "С замечаниями" },
  { id: "late", label: "Просроченные" },
  { id: "photos", label: "С медиа" },
  { id: "noPhotos", label: "Без медиа" },
];

const emptyResultFilters = {};
const showResultInspector = false;
const MAX_VALID_PATROL_DURATION_MINUTES = 24 * 60;

export function ResultsWorkspace({
  canCreateRequest = true,
  dataSourceMode,
  mode = "all",
  selectedResultId = "",
  onModeChange,
  onSelectResult,
  onCreateRequest,
  onOpenRequest,
  onNotify,
  addToast,
}: ResultsScreenProps) {
  const [activeMode, setActiveMode] = useState<ResultMode>(mode);
  const [query, setQuery] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [detailedResults, setDetailedResults] = useState<Record<string, PatrolResult>>({});
  const [photoLoadingResultId, setPhotoLoadingResultId] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<ResultMediaPreviewState | null>(null);
  const apiResultsRepository = useMemo(() => createApiResultsRepository(), []);

  const { results, selectedResult, listStatus, errorMessage, refreshResults } = useResultsWorkspace({
    dataSourceMode,
    selectedResultId,
    onSelectResult: onSelectResult ?? (() => undefined),
    showToast: onNotify ?? (() => undefined),
    filters: emptyResultFilters,
  });

  const mergedResults = useMemo(
    () => results.map((result) => detailedResults[result.id] ?? result),
    [detailedResults, results],
  );
  const groups = useMemo(() => buildResultGroups(mergedResults), [mergedResults]);
  const filteredGroups = useMemo(() => filterGroups(groups, activeMode, query), [groups, activeMode, query]);
  const counters = useMemo(() => buildCounters(groups), [groups]);
  const metrics = useMemo(() => buildMetrics(groups), [groups]);
  const loading = listStatus === "loading";
  const error = listStatus === "error" ? errorMessage : undefined;

  const selectedGroup =
    (openGroupId ? groups.find((group) => group.id === openGroupId) : undefined) ??
    (selectedResult ? groups.find((group) => group.results.some((result) => result.id === selectedResult.id)) : undefined) ??
    filteredGroups[0];
  const modalGroup = openGroupId ? groups.find((group) => group.id === openGroupId) : undefined;

  const changeFilter = (nextMode: ResultMode) => {
    setActiveMode(nextMode);
    onModeChange?.(nextMode);
  };

  const selectGroup = (group: ResultGroup) => {
    onSelectResult?.(group.results[0]?.id ?? "");
    setOpenGroupId(null);
  };

  const openDetails = (group: ResultGroup) => {
    onSelectResult?.(group.results[0]?.id ?? "");
    setOpenGroupId(group.id);

    if (dataSourceMode === "api") {
      void Promise.all(group.results.map((result) => loadResultDetails(result))).catch((detailsError) => {
        const message = detailsError instanceof Error ? detailsError.message : "не удалось загрузить детали обхода";
        addToast?.(`Не удалось загрузить детали обхода: ${message}`, "error");
      });
    }
  };

  const loadResultDetails = async (result: PatrolResult) => {
    const cached = detailedResults[result.id];
    if (cached?.attachments !== undefined) return cached;
    if (result.attachments !== undefined) return result;
    if (dataSourceMode !== "api") return result;

    const detailed = await apiResultsRepository.getResult(result.id);
    setDetailedResults((current) => ({ ...current, [detailed.id]: detailed }));
    return detailed;
  };

  const openAttachment = async (result: PatrolResult, order?: number) => {
    setPhotoLoadingResultId(result.id);
    try {
      const detailed = await loadResultDetails(result);
      const attachments = detailed.attachments ?? [];

      if (attachments.length === 0) {
        addToast?.("Для этой точки нет вложений", "info");
        return;
      }

      setMediaPreview({ result: detailed, attachments, index: 0, order });
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "не удалось открыть вложение";
      addToast?.(`Не удалось открыть вложение: ${message}`, "error");
    } finally {
      setPhotoLoadingResultId(null);
    }
  };

  const downloadPreviewAttachment = async (attachment: PatrolResultAttachment) => {
    try {
      const file = await downloadResultAttachment(attachment);
      const href = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = file.fileName || attachment.fileName || "patrol-result-attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "не удалось скачать вложение";
      addToast?.(`Не удалось скачать вложение: ${message}`, "error");
    }
  };

  const createRequest = async (sourceGroup = selectedGroup) => {
    if (!sourceGroup) return;
    onCreateRequest?.(sourceGroup.results[0]?.id);
    addToast?.("Открыта форма заявки по результату обхода", "success");
  };

  if (error) {
    return (
      <div className="results-review-screen">
        <section className="results-review-empty">
          <AlertTriangle size={32} />
          <h3>Не удалось загрузить результаты</h3>
          <p>{error}</p>
          <button type="button" className="primary-action" onClick={() => void refreshResults()}>
            Повторить загрузку
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="results-review-screen">
      <div className="results-review-hero">
        <div>
          <p className="results-review-eyebrow">Обходы</p>
          <h1>Результаты обходов</h1>
          <p>Контроль статусов точек, замечаний, ручных отметок и вложений по завершенным обходам.</p>
        </div>
        <div className="results-review-actions">
          <button type="button" className="secondary-action" onClick={() => onOpenRequest?.(selectedGroup?.results[0]?.id)}>
            <ExternalLink size={17} />
            Открыть заявку
          </button>
          {canCreateRequest ? (
            <button type="button" className="primary-action" onClick={() => void createRequest()}>
              <PlusCircle size={17} />
              Создать заявку
            </button>
          ) : null}
        </div>
      </div>

      <section className="results-review-metrics" aria-label="Сводка результатов обходов">
        <MetricCard icon={FileText} title="Всего обходов" value={metrics.total} caption="По текущей выборке" />
        <MetricCard icon={AlertTriangle} title="С замечаниями" value={metrics.issues} caption="Есть неисправности или ручные исключения" tone="orange" />
        <MetricCard icon={Camera} title="С медиа" value={metrics.withPhotos} caption="Есть фото или видео" />
        <MetricCard icon={Timer} title="Среднее время" value={metrics.averageDuration} caption="По валидным длительностям" />
        <MetricCard icon={CheckCircle2} title="Без замечаний" value={metrics.clean} caption="Точки закрыты без проблем" tone="green" />
      </section>

      <section className="results-review-layout">
        <main className="results-review-main">
          <div className="results-review-toolbar">
            <div className="results-review-filter-tabs" role="tablist" aria-label="Фильтр результатов">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={activeMode === filter.id ? "is-active" : ""}
                  onClick={() => changeFilter(filter.id)}
                >
                  {filter.label}
                  <span>{counters[filter.id]}</span>
                </button>
              ))}
            </div>
            <label className="results-review-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по маршруту, сотруднику или точке..."
              />
            </label>
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
            <div className="results-review-list">
              {filteredGroups.map((group) => (
                <ResultRow
                  key={group.id}
                  group={group}
                  active={selectedGroup?.id === group.id}
                  onClick={() => selectGroup(group)}
                  onOpen={() => openDetails(group)}
                  onCreateRequest={() => void createRequest(group)}
                  canCreateRequest={canCreateRequest}
                />
              ))}
            </div>
          )}
        </main>

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

      {modalGroup ? (
        <PatrolResultDetails
          group={modalGroup}
          onClose={() => setOpenGroupId(null)}
          onCreateRequest={() => void createRequest(modalGroup)}
          onOpenRequest={() => onOpenRequest?.(modalGroup.results[0]?.id)}
          onOpenAttachment={openAttachment}
          photoLoadingResultId={photoLoadingResultId}
        />
      ) : null}
      {mediaPreview ? (
        <ResultMediaViewer
          preview={mediaPreview}
          onClose={() => setMediaPreview(null)}
          onDownload={(attachment) => void downloadPreviewAttachment(attachment)}
          onSelect={(index) => setMediaPreview((current) => (current ? { ...current, index } : current))}
        />
      ) : null}
    </div>
  );
}

function MetricCard({
  caption,
  icon: Icon,
  title,
  tone = "blue",
  value,
}: {
  caption: string;
  icon: LucideIcon;
  title: string;
  tone?: "blue" | "green" | "orange";
  value: string | number;
}) {
  return (
    <article className={`results-review-metric tone-${tone}`}>
      <span className="results-review-metric-icon">
        <Icon size={20} />
      </span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
        <p>{caption}</p>
      </div>
    </article>
  );
}

function ResultRow({
  active,
  canCreateRequest,
  group,
  onClick,
  onCreateRequest,
  onOpen,
}: {
  active?: boolean;
  canCreateRequest: boolean;
  group: ResultGroup;
  onClick: () => void;
  onCreateRequest: () => void;
  onOpen: () => void;
}) {
  const hasIssue = group.issuePoints > 0 || group.issues > 0;

  return (
    <article className={`results-review-row ${active ? "is-active" : ""} ${hasIssue ? "has-issues" : ""}`} onClick={onClick}>
      <div className="results-review-row-status">
        {hasIssue ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      </div>
      <div className="results-review-row-main">
        <div className="results-review-row-title">
          <strong>{group.route}</strong>
          <StatusPill issue={hasIssue} />
        </div>
        <p>
          {group.employee} · {group.territory}
        </p>
        <div className="results-review-row-meta">
          <span>{group.points} точек</span>
          <span>{group.duration.label}</span>
          <span>{group.firstScanAt ?? "нет времени"}</span>
        </div>
      </div>
      <div className="results-review-row-summary">
        <span className="ok">Исправно: {group.okPoints}</span>
        <span className={group.issuePoints > 0 ? "issue" : ""}>Неисправно: {group.issuePoints}</span>
        <span>Медиа: {group.photos}</span>
      </div>
      <div className="results-review-row-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          Подробнее
        </button>
        {canCreateRequest ? (
          <button
            type="button"
            className="primary-action"
            onClick={(event) => {
              event.stopPropagation();
              onCreateRequest();
            }}
          >
            Заявка
          </button>
        ) : null}
      </div>
    </article>
  );
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
        <button type="button" className="primary-action" onClick={onOpen}>
          Открыть просмотр
        </button>
        {canCreateRequest ? (
          <button type="button" className="secondary-action" onClick={onCreateRequest}>
            Создать заявку
          </button>
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

function buildMetrics(groups: ResultGroup[]) {
  const total = groups.length;
  const issues = groups.filter((group) => group.issuePoints > 0 || group.issues > 0).length;
  const withPhotos = groups.filter((group) => group.photos > 0).length;
  const clean = total - issues;
  const validDurations = groups.map((group) => group.duration.minutes).filter((minutes): minutes is number => typeof minutes === "number");
  const averageDuration =
    validDurations.length > 0 ? formatDuration(Math.round(validDurations.reduce((sum, value) => sum + value, 0) / validDurations.length)) : "нет данных";

  return { averageDuration, clean, issues, total, withPhotos };
}

function buildCounters(groups: ResultGroup[]): Record<ResultMode, number> {
  return {
    all: groups.length,
    issues: groups.filter((group) => group.issuePoints > 0 || group.issues > 0).length,
    late: groups.filter((group) => group.status === "late").length,
    photos: groups.filter((group) => group.photos > 0).length,
    noPhotos: groups.filter((group) => group.photos === 0).length,
  };
}

function filterGroups(groups: ResultGroup[], mode: ResultMode, query: string) {
  const normalizedQuery = normalizeText(query);

  return groups.filter((group) => {
    const matchesMode =
      mode === "all" ||
      (mode === "issues" && (group.issuePoints > 0 || group.issues > 0)) ||
      (mode === "late" && group.status === "late") ||
      (mode === "photos" && group.photos > 0) ||
      (mode === "noPhotos" && group.photos === 0);
    const haystack = normalizeText([group.route, group.territory, group.employee, group.shift, group.comment].join(" "));
    return matchesMode && (!normalizedQuery || haystack.includes(normalizedQuery));
  });
}

function buildResultGroups(results: PatrolResult[]): ResultGroup[] {
  const buckets = new Map<string, PatrolResult[]>();

  results.forEach((result) => {
    const key = result.assignmentId || `${result.employeeId || result.employee}:${result.routeId || result.route}:${result.plannedAt}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(result);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries())
    .map(([id, groupResults]) => {
      const sorted = [...groupResults].sort((left, right) => parseDate(left.actualAt) - parseDate(right.actualAt));
      const first = sorted[0];
      const okPoints = sorted.filter((result) => !isIssueResult(result)).length;
      const issuePoints = sorted.length - okPoints;
      const photos = sorted.reduce((sum, result) => sum + getPhotoCount(result), 0);
      const firstScanAt = firstUseful(sorted[0]?.actualAt);
      const lastScanAt = firstUseful(sorted[sorted.length - 1]?.actualAt);
      const startedAt = firstUseful(first?.startedAt) ?? firstScanAt;
      const finishedAt = firstUseful(first?.finishedAt) ?? lastScanAt;
      const duration = summarizeDuration(startedAt, finishedAt);

      return {
        id,
        status: issuePoints > 0 ? "issue" : "ok",
        route: first?.route || "Маршрут не указан",
        routeId: first?.routeId,
        territory: first?.territory || "Территория не указана",
        employee: first?.employee || "Сотрудник не указан",
        employeeId: first?.employeeId || "",
        shift: displayShift(first?.shift),
        plannedAt: first?.plannedAt,
        startedAt,
        finishedAt,
        firstScanAt,
        lastScanAt,
        duration,
        photos,
        issues: issuePoints,
        points: sorted.length,
        okPoints,
        issuePoints,
        comment: firstUseful(first?.comment),
        results: sorted,
      };
    })
    .sort((left, right) => parseDate(right.lastScanAt ?? right.startedAt ?? "") - parseDate(left.lastScanAt ?? left.startedAt ?? ""));
}

function summarizeDuration(start?: string, finish?: string): DurationSummary {
  const started = parseDate(start);
  const finished = parseDate(finish);
  const minutes = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, Math.round((finished - started) / 60000)) : undefined;

  if (minutes === undefined) {
    return { label: "нет данных", hint: "Нет времени начала или окончания", tone: "muted" };
  }

  if (minutes > MAX_VALID_PATROL_DURATION_MINUTES) {
    return { label: "нет данных", hint: "Длительность вне допустимого диапазона", tone: "warning" };
  }

  return { label: formatDuration(minutes), hint: "По времени первой и последней фиксации", minutes, tone: "ok" };
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes < 60) {
    return `${totalMinutes} мин`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function getPhotoCount(result: PatrolResult): number {
  return Math.max(Number(result.photos) || 0, result.attachments?.length ?? 0);
}

function isIssueResult(result: PatrolResult): boolean {
  const status = normalizeText(result.status);
  const issue = normalizeText(result.issueType);
  const comment = normalizeText(result.comment);

  if (status.includes("issue") || status.includes("problem") || status.includes("замеч") || status.includes("неисправ")) {
    return true;
  }

  if (comment.includes("недоступ") || comment.includes("неисправ") || comment.includes("ошиб")) {
    return true;
  }

  return isUsefulText(issue);
}

function isUsefulText(value?: string | null): boolean {
  const normalized = normalizeText(value);
  return Boolean(normalized && normalized !== "нет" && normalized !== "нет данных" && normalized !== "без комментария" && normalized !== "-");
}

function firstUseful(value?: string | null) {
  return isUsefulText(value) ? value ?? undefined : undefined;
}

function displayShift(value?: string | null): string {
  const normalized = normalizeText(value);
  if (normalized.includes("night") || normalized.includes("ноч")) {
    return "Ночь";
  }

  return "День";
}

function parseDate(value?: string | null): number {
  if (!value) return Number.NaN;

  const normalized = value.replace(",", "");
  const match = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}
