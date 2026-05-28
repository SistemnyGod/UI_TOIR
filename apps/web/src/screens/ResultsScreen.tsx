import { useMemo, useState } from "react";
import { ResultDetailDrawer } from "../components/results/ResultDetailDrawer";
import { MobileSyncPanel } from "../components/results/MobileSyncPanel";
import { ResultsJournalPanel } from "../components/results/ResultsJournalPanel";
import { Chip, EmptyState, Panel } from "../components/ui";
import { useMobileSyncWorkspace } from "../hooks/useMobileSyncWorkspace";
import { useResultsWorkspace } from "../hooks/useResultsWorkspace";
import {
  filterPatrolResults,
  getResultMetrics,
  type ResultFilterOptions,
} from "../repositories/resultsRepository";
import type { DataSourceMode, PatrolResult, ResultMode, ScreenId } from "../types";

export function ResultsScreen({
  canCreateRequest = true,
  dataSourceMode,
  mode,
  onModeChange,
  onCreateRequest,
  onNavigate,
  onNotify,
  onOpenRequest,
  selectedResultId,
  onSelectResult,
}: {
  canCreateRequest?: boolean;
  dataSourceMode: DataSourceMode;
  mode: ResultMode;
  onModeChange: (mode: ResultMode) => void;
  onCreateRequest: (sourceResultId?: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequest: (resultId?: string) => void;
  selectedResultId: string;
  onSelectResult: (id: string) => void;
}) {
  const [journalFilters, setJournalFilters] = useState<ResultFilterOptions>({});
  const resultFilters = useMemo(
    () => ({
      ...journalFilters,
      status: modeToApiStatus(mode),
    }),
    [journalFilters, mode],
  );
  const { errorMessage, exportResults, listStatus, refreshResults, results: patrolResults, selectedResult } = useResultsWorkspace({
    dataSourceMode,
    filters: resultFilters,
    onSelectResult,
    selectedResultId,
    showToast: onNotify,
  });
  const mobileSync = useMobileSyncWorkspace({ dataSourceMode, showToast: onNotify });
  const visibleResults = filterPatrolResults(patrolResults, mode);
  const metrics = getResultMetrics(patrolResults);

  return (
    <div className="screen-stack">
      {listStatus === "loading" ? (
        <Panel>
          <EmptyState title="Результаты загружаются" description="Получаем журнал обходов из backend API." />
        </Panel>
      ) : null}
      {listStatus === "error" ? (
        <Panel>
          <EmptyState
            title="Не удалось загрузить результаты"
            description={errorMessage ?? "Backend API вернул ошибку при загрузке журнала результатов."}
            action={<button className="button ghost" onClick={() => void refreshResults()} type="button">Повторить</button>}
          />
        </Panel>
      ) : null}

      <div className="metric-grid compact">
        <Panel className="metric-panel"><strong>{metrics.total}</strong><span>Всего результатов</span><small>за выбранный период</small></Panel>
        <Panel className="metric-panel warning"><strong>{metrics.issues}</strong><span>С замечаниями</span><small>по загруженным данным</small></Panel>
        <Panel className="metric-panel danger"><strong>{metrics.late}</strong><span>Просрочено</span><small>по загруженным данным</small></Panel>
        <Panel className="metric-panel muted"><strong>{metrics.withoutPhotos}</strong><span>Без фото</span><small>по загруженным данным</small></Panel>
        <Panel className="metric-panel"><strong>—</strong><span>Среднее время обхода</span><small>нет данных</small></Panel>
      </div>

      <div className="two-column wide-left">
        <ResultsJournalPanel
          mode={mode}
          results={visibleResults}
          selectedResultId={selectedResult?.id ?? ""}
          totalResults={patrolResults}
          onExportResults={exportResults}
          onFiltersChange={setJournalFilters}
          onModeChange={onModeChange}
          onNavigate={onNavigate}
          onNotify={onNotify}
          onSelectResult={onSelectResult}
        />

        <ResultDetailDrawer
          canCreateRequest={canCreateRequest}
          result={selectedResult}
          onCreateRequest={onCreateRequest}
          onNavigate={onNavigate}
          onNotify={onNotify}
          onOpenRequest={onOpenRequest}
        />
      </div>

      <div className="bottom-analytics">
        <MobileSyncPanel
          conflicts={mobileSync.conflicts}
          errorMessage={mobileSync.errorMessage}
          status={mobileSync.status}
          onRefresh={() => void mobileSync.refreshConflicts()}
          onResolve={(clientOperationId, status) => void mobileSync.resolveConflict(clientOperationId, status)}
        />
        <ResultIssueTypesPanel results={patrolResults} />
        <ResultShiftPanel results={patrolResults} />
        <ResultAnomaliesPanel results={patrolResults} onSelectResult={onSelectResult} />
      </div>
    </div>
  );
}

function modeToApiStatus(mode: ResultMode) {
  if (mode === "issues") return "Замечание";
  if (mode === "late") return "Просрочено";
  return undefined;
}

function ResultIssueTypesPanel({ results }: { results: PatrolResult[] }) {
  const issueRows = buildIssueTypeRows(results);

  return (
    <Panel title="Типы замечаний">
      {issueRows.length > 0 ? (
        <div className="result-insight-list">
          {issueRows.map((row) => (
            <div className="result-insight-row" key={row.label}>
              <span className={`insight-dot ${row.tone}`} />
              <strong>{row.label}</strong>
              <em>{row.count}</em>
              <small>{row.percent}%</small>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Замечаний нет" description="Блок заполнится после загрузки результатов с отклонениями." />
      )}
    </Panel>
  );
}

function ResultShiftPanel({ results }: { results: PatrolResult[] }) {
  const shiftRows = buildShiftRows(results);

  return (
    <Panel title="Результаты по сменам">
      {shiftRows.length > 0 ? (
        <div className="shift-result-bars">
          {shiftRows.map((row) => (
            <div className="shift-result-row" key={row.shift}>
              <div>
                <strong>{row.shift}</strong>
                <span>{row.total} результатов</span>
              </div>
              <div className="stacked-result-bar" aria-label={`${row.shift}: ${row.total} результатов`}>
                <span className="ok" style={{ width: `${row.okPercent}%` }} />
                <span className="warning" style={{ width: `${row.issuePercent}%` }} />
                <span className="danger" style={{ width: `${row.latePercent}%` }} />
                <span className="muted" style={{ width: `${row.otherPercent}%` }} />
              </div>
              <small>{row.okPercent}% без замечаний</small>
            </div>
          ))}
          <div className="result-bar-legend">
            <span><i className="ok" /> Норма</span>
            <span><i className="warning" /> С замечаниями</span>
            <span><i className="danger" /> Просрочено</span>
            <span><i className="muted" /> Другое</span>
          </div>
        </div>
      ) : (
        <EmptyState title="Нет данных по сменам" description="Появятся после первого результата обхода." />
      )}
    </Panel>
  );
}

function ResultAnomaliesPanel({
  onSelectResult,
  results,
}: {
  results: PatrolResult[];
  onSelectResult: (id: string) => void;
}) {
  const anomalies = results.filter((result) => result.status !== "Подтверждено").slice(0, 4);

  return (
    <Panel title="Последние аномалии">
      {anomalies.length > 0 ? (
        <div className="anomaly-list">
          {anomalies.map((result) => (
            <button className="anomaly-row" key={result.id} onClick={() => onSelectResult(result.id)} type="button">
              <Chip>{result.severity === "-" ? result.status : result.severity}</Chip>
              <div>
                <strong>{result.comment}</strong>
                <span>
                  {result.point} · {result.route}
                </span>
              </div>
              <time>{result.actualAt}</time>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="Аномалий нет" description="Просрочки, замечания и неподтвержденные точки появятся здесь." />
      )}
    </Panel>
  );
}

function buildIssueTypeRows(results: PatrolResult[]) {
  const issueResults = results.filter((result) => result.issueType !== "-" && result.issueType.trim().length > 0);
  const total = issueResults.length || 1;
  const counts = new Map<string, number>();

  issueResults.forEach((result) => {
    counts.set(result.issueType, (counts.get(result.issueType) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((first, second) => second[1] - first[1])
    .slice(0, 5)
    .map(([label, count], index) => ({
      label,
      count,
      percent: Math.round((count / total) * 100),
      tone: ["blue", "orange", "red", "violet", "green"][index] ?? "slate",
    }));
}

function buildShiftRows(results: PatrolResult[]) {
  const shifts = Array.from(new Set(results.map((result) => result.shift)));

  return shifts.map((shift) => {
    const shiftResults = results.filter((result) => result.shift === shift);
    const total = shiftResults.length || 1;
    const ok = shiftResults.filter((result) => result.status === "Подтверждено").length;
    const issues = shiftResults.filter((result) => result.status === "Замечание").length;
    const late = shiftResults.filter((result) => result.status === "Просрочено").length;
    const other = Math.max(0, total - ok - issues - late);

    return {
      shift,
      total: shiftResults.length,
      okPercent: Math.round((ok / total) * 100),
      issuePercent: Math.round((issues / total) * 100),
      latePercent: Math.round((late / total) * 100),
      otherPercent: Math.round((other / total) * 100),
    };
  });
}
