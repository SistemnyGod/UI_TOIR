import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, FileText, MapPin, RefreshCw, TriangleAlert, UserRoundPlus } from "lucide-react";
import type { ActivePatrol, DataSourceMode, DataSourceStatus, Metric, RouteDirectoryItem, ScreenId, ServiceRequest } from "../../types";
import { resultDateTime } from "../patrol/results/resultPresentation";
import { buildDashboardPlan, buildDashboardSummary, dashboardShortName, isDashboardPatrolInProgress, type DashboardPeriod, type DashboardPlanItem, type DashboardRange, type DashboardSummary } from "./dashboardSummary";
import { useDashboardOverview } from "./useDashboardOverview";
import "./dashboardWorkspace.css";

export { buildLatestAssignmentResults } from "./dashboardSummary";

interface DashboardScreenProps {
  activePatrols?: ActivePatrol[];
  dashboardMetrics?: Metric[];
  dataSourceMode: DataSourceMode;
  ownerId?: string;
  canCreateRequest?: boolean;
  canViewResults?: boolean;
  canViewSchedule?: boolean;
  patrolDataStatus?: DataSourceStatus;
  onQuickAssign?: () => void;
  onCreateRequest: (sourceResultId?: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenResult: (resultId: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onRetryRequests: () => void | Promise<void>;
  onSelectResult: (id: string) => void;
  requestListErrorMessage?: string;
  requestListStatus: DataSourceStatus;
  routeDirectory?: RouteDirectoryItem[];
  requests: ServiceRequest[];
  selectedResultId: string;
}

export function DashboardScreen(props: DashboardScreenProps) {
  const [period, setPeriod] = useState<DashboardPeriod>("week");
  const overview = useDashboardOverview({ dataSourceMode: props.dataSourceMode, ownerId: props.ownerId, enabled: props.canViewResults !== false, period });
  const summary = useMemo(() => buildDashboardSummary(overview.results ?? [], overview.range), [overview.results, overview.range.dateFrom, overview.range.through.getTime()]);
  return <DashboardView {...props} period={period} onPeriodChange={setPeriod} range={overview.range} summary={summary} hasResults={overview.results !== undefined} resultsLoading={overview.loading} resultsError={overview.error} refreshedAt={overview.refreshedAt} onRefreshResults={overview.refresh} />;
}

export interface DashboardViewProps extends DashboardScreenProps {
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
  range: DashboardRange;
  summary: DashboardSummary;
  hasResults: boolean;
  resultsLoading: boolean;
  resultsError?: string;
  refreshedAt?: Date;
  onRefreshResults: () => Promise<void>;
}

/** Shared by the live screen and its isolated, development-only visual fixture. */
export function DashboardView({
  activePatrols = [], canCreateRequest = true, canViewResults = true, canViewSchedule = true,
  patrolDataStatus = "ready", onQuickAssign, onCreateRequest, onNavigate, onNotify, onOpenResult, onOpenRequestById,
  requests, requestListStatus, requestListErrorMessage, onRetryRequests,
  period, onPeriodChange, range, summary, hasResults, resultsLoading, resultsError, refreshedAt, onRefreshResults,
}: DashboardViewProps) {
  const [refreshing, setRefreshing] = useState(false);
  const periodText = period === "week" ? "за неделю" : "за месяц";
  const today = range.through;
  const plan = buildDashboardPlan(requests, activePatrols, today);
  const active = activePatrols.filter(isDashboardPatrolInProgress).length;
  const value = (count: number) => !canViewResults || !hasResults ? "—" : count;
  const metricNote = !canViewResults ? "нет доступа" : !hasResults ? resultsLoading ? "загрузка…" : "нет данных" : period === "week" ? "с начала недели" : "с начала месяца";
  const issueNote = canViewResults && hasResults && summary.completed > 0
    ? `${Math.round(summary.withIssues / summary.completed * 100)}% от завершённых`
    : metricNote;

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([onRefreshResults(), canViewSchedule ? Promise.resolve(onRetryRequests()) : Promise.resolve()]);
    } catch { onNotify("Не удалось обновить план обходов. Повторите попытку."); }
    finally { setRefreshing(false); }
  }

  return <div className="dashboard-ui">
    <header className="dui-page-head">
      <div><h1>Дашборд</h1><p>Краткая сводка по обходам.</p></div>
      <div className="dui-actions">
        {canViewResults ? <button type="button" className="dui-button" onClick={() => onNavigate("results")}><FileText size={20} aria-hidden="true" />Результаты</button> : null}
        {canViewSchedule ? <button type="button" className="dui-button" onClick={() => onNavigate("schedule")}><CalendarDays size={21} aria-hidden="true" />Плановый обход</button> : null}
        {canCreateRequest ? <button type="button" className="dui-button dui-primary" onClick={() => onQuickAssign ? onQuickAssign() : onCreateRequest("")}><UserRoundPlus size={21} aria-hidden="true" />Быстрое назначение</button> : null}
      </div>
    </header>
    <div className="dui-period-row">
      <div className="dui-period" role="group" aria-label="Период статистики">
        {(["week", "month"] as const).map((item) => <button type="button" key={item} aria-pressed={period === item} onClick={() => onPeriodChange(item)}>{item === "week" ? "Неделя" : "Месяц"}</button>)}
      </div>
      <div className="dui-range"><CalendarDays size={20} aria-hidden="true" /><span>{range.label}</span></div>
      <small className="dui-cutoff">Учтено с {range.from.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} по {range.through.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}, {range.through.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.</small>
      <button className="dui-refresh" type="button" onClick={() => void refresh()} disabled={refreshing || resultsLoading || (!canViewResults && !canViewSchedule)} aria-label="Обновить дашборд" title="Обновить результаты и план обходов">
        <RefreshCw size={20} aria-hidden="true" /><span>{refreshing || resultsLoading ? "Обновление…" : refreshedAt ? <>Обновлено <strong>{refreshedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</strong></> : "Обновить"}</span>
      </button>
    </div>
    {resultsError ? <div className="dui-error" role="status"><TriangleAlert size={18} aria-hidden="true" /><span>{hasResults ? "Показаны ранее загруженные результаты. " : "Результаты не загружены. "}{resultsError}</span><button type="button" className="dui-button dui-small" onClick={() => void onRefreshResults()} disabled={resultsLoading}>Повторить</button></div> : null}
    <section className="dui-metrics" aria-label="Сводка обходов" aria-busy={resultsLoading}>
      <MetricTile icon={<CheckCircle2 />} tone="green" value={value(summary.completed)} label="Завершено обходов" note={metricNote} />
      <MetricTile icon={<TriangleAlert />} tone="amber" value={value(summary.withIssues)} label="С замечаниями" note={issueNote} />
      <MetricTile icon={<MapPin />} tone="red" value={value(summary.problemPoints.length)} label="Проблемных точек" note={metricNote} />
      <MetricTile icon={<Clock3 />} tone="blue" value={["loading", "error"].includes(patrolDataStatus) && !activePatrols.length ? "—" : active} label="В работе" note={patrolDataStatus === "loading" ? "обновление…" : patrolDataStatus === "error" ? "не обновлено" : "сейчас"} />
    </section>
    <div className="dui-main-grid">
      <section className="dui-panel dui-problems" aria-busy={resultsLoading}>
        <header className="dui-panel-head"><div><h2>Самые проблемные точки</h2><p>По числу фиксаций с замечаниями · {periodText}{canViewResults && hasResults && summary.problemPoints.length > 5 ? ` · топ-5 из ${summary.problemPoints.length}` : ""}</p></div></header>
        {canViewResults && hasResults && summary.problemPoints.length ? <div className="dui-table-scroll"><table className="dui-table dui-points-table" aria-label="Проблемные точки за выбранный период"><thead><tr><th scope="col">Точка / Маршрут</th><th scope="col">Замечаний</th><th scope="col">Последнее замечание</th><th scope="col">Действие</th></tr></thead><tbody>
          {summary.problemPoints.slice(0, 5).map((item, index) => <tr key={item.key}>
            <td><div className="dui-point-name"><span className="dui-rank">{index + 1}</span><div><strong>{item.point || "Точка не указана"}</strong><small>{item.route || "Маршрут не указан"}</small></div></div></td>
            <td data-label="Замечаний"><div className="dui-count"><progress max={summary.problemPoints[0].count} value={item.count} aria-label={`Фиксаций с замечаниями: ${item.count}`} /><strong>{item.count}</strong></div></td>
            <td className="dui-date" data-label="Последнее замечание">{formatDateTime(item.latest.actualAt)}</td>
            <td><button type="button" className="dui-button dui-small" aria-label={`Результаты точки ${item.point}`} title="Открыть отчёт с последним замечанием по этой точке" onClick={() => onOpenResult(item.latest.id)}><FileText size={16} aria-hidden="true" />Результаты</button></td>
          </tr>)}
        </tbody></table></div> : <DashboardEmpty text={!canViewResults ? "Нет доступа к результатам обходов" : !hasResults ? resultsLoading ? "Загружаем результаты за выбранный период…" : "Не удалось загрузить результаты" : "За выбранный период замечаний нет"} />}
      </section>
      <section className="dui-panel dui-plan" aria-busy={requestListStatus === "loading"}>
        <header className="dui-panel-head"><CalendarDays className="dui-plan-icon" size={32} aria-hidden="true" /><div><h2>Плановый обход</h2><p>Сегодня, {today.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}{canViewSchedule && plan.length > 0 ? ` · показаны ${Math.min(plan.length, 3)} из ${plan.length}` : ""}</p></div></header>
        {canViewSchedule && requestListStatus === "error" ? <div className="dui-plan-error" role="status"><span>{requests.length ? "План не обновлён. " : "План не загружен. "}{requestListErrorMessage || "Нет связи с сервером"}</span><button type="button" className="dui-button dui-small" onClick={() => void Promise.resolve().then(onRetryRequests).catch(() => onNotify("Не удалось обновить план обходов"))}>Повторить</button></div> : null}
        {canViewSchedule && plan.length ? <div className="dui-plan-list">{plan.slice(0, 3).map((item) => <DashboardPlanRow key={item.id} item={item} onOpen={() => item.requestId ? onOpenRequestById(item.requestId) : onNavigate("schedule")} />)}</div> : <DashboardEmpty text={!canViewSchedule ? "Нет доступа к плану обходов" : requestListStatus === "loading" ? "Загружаем план…" : requestListStatus === "error" ? "План недоступен" : "На сегодня обходы не запланированы"} />}
        {canViewSchedule ? <button type="button" className="dui-button dui-plan-open" onClick={() => onNavigate("schedule")}><CalendarDays size={20} aria-hidden="true" />Открыть плановый обход</button> : null}
      </section>
    </div>
    <section className="dui-panel dui-recent" aria-busy={resultsLoading}>
      <header className="dui-panel-head"><h2>Последние результаты</h2>{canViewResults ? <button type="button" className="dui-button dui-small" onClick={() => onNavigate("results")}><FileText size={16} aria-hidden="true" />Все результаты</button> : null}</header>
      {canViewResults && hasResults && summary.latestReports.length ? <div className="dui-table-scroll"><table className="dui-table dui-results-table" aria-label="Последние результаты обходов"><thead><tr><th scope="col">Дата и время</th><th scope="col">Маршрут</th><th scope="col">Сотрудник</th><th scope="col">Результат</th><th scope="col">Действие</th></tr></thead><tbody>{summary.latestReports.map((report) => <tr key={report.key}><td>{formatDateTime(report.latest.actualAt)}</td><td>{report.latest.route}</td><td title={report.latest.employee}>{dashboardShortName(report.latest.employee)}</td><td><span className={`dui-result-status ${report.hasIssue ? "dui-warning" : "dui-success"}`}>{report.hasIssue ? <TriangleAlert size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}{report.hasIssue ? "Замечание" : "Подтверждено"}</span></td><td><button type="button" className="dui-button dui-small" aria-label={`Просмотр обхода ${report.latest.route}, ${formatDateTime(report.latest.actualAt)}`} onClick={() => onOpenResult(report.latest.id)}><FileText size={16} aria-hidden="true" />Просмотр</button></td></tr>)}</tbody></table></div> : <DashboardEmpty text={!canViewResults ? "Нет доступа к результатам обходов" : !hasResults ? resultsLoading ? "Загружаем результаты…" : "Результаты недоступны" : "За выбранный период завершённых обходов нет"} />}
    </section>
  </div>;
}

function MetricTile({ icon, tone, value, label, note }: { icon: ReactNode; tone: string; value: string | number; label: string; note: string }) {
  return <div className="dui-metric"><span className={`dui-metric-icon dui-${tone}`} aria-hidden="true">{icon}</span><strong>{value}</strong><div><span>{label}</span><small>{note}</small></div></div>;
}
function DashboardPlanRow({ item, onOpen }: { item: DashboardPlanItem; onOpen: () => void }) {
  const employee = item.employee === "Сотрудник не указан" ? item.employee : dashboardShortName(item.employee);
  return <button type="button" className={`dui-plan-row${item.assigned ? "" : " dui-plan-unassigned"}`} onClick={onOpen} aria-label={`Открыть план: ${item.route}, ${item.time}`}>
    <time>{item.time}</time>
    <span>
      <strong>{item.route || "Маршрут не указан"}</strong>
      <small title={item.employee}>{item.assigned ? employee : <span className="dui-plan-attention"><UserRoundPlus size={12} aria-hidden="true" />Не назначен</span>}</small>
      <span className="dui-plan-status">{item.requestId ? "Заявка" : "Обход"}: {item.status.toLocaleLowerCase("ru-RU")}</span>
    </span>
    <ChevronRight size={18} aria-hidden="true" />
  </button>;
}
function DashboardEmpty({ text }: { text: string }) { return <div className="dui-empty" role="status">{text}</div>; }
function formatDateTime(value: string) { const parts = resultDateTime(value); return `${parts.date}, ${parts.time}`; }
