import { useMemo, useState, type ReactNode } from "react";
import { useResultsWorkspace } from "../../hooks/useResultsWorkspace";
import type {
  ActivePatrol,
  DataSourceMode,
  DataSourceStatus,
  EmployeeDirectoryItem,
  Metric,
  PatrolResult,
  RouteDirectoryItem,
  ScreenId,
  ServiceRequest,
  Tone,
} from "../../types";

const emptyDashboardMetrics: Metric[] = [
  { label: "Завершено обходов сегодня", value: "0", delta: "живых результатов пока нет", tone: "green", icon: "ok" },
  { label: "Активные обходы", value: "0", delta: "нет активных обходов", tone: "blue", icon: "run" },
  { label: "Заявки на обход", value: "0", delta: "ожидают прохождения", tone: "orange", icon: "request" },
  { label: "Маршрутов в справочнике", value: "0", delta: "локальный справочник", tone: "violet", icon: "map" },
];

type DashboardKpi = {
  key: string;
  title: string;
  value: string;
  subtitle: string;
  tone: Tone;
  icon: DashboardIconName;
  helper: string;
};

type DashboardIconName =
  | "alert"
  | "calendar"
  | "check"
  | "cloud"
  | "document"
  | "map"
  | "mobile"
  | "pin"
  | "route"
  | "target"
  | "user"
  | "walk";

export function DashboardScreen({
  activePatrols = [],
  dashboardMetrics = [],
  onCreateRequest,
  dataSourceMode,
  employeeDirectory = [],
  onNavigate,
  onNotify,
  onOpenRequestById,
  onRetryRequests,
  onSelectResult,
  requestListErrorMessage,
  requestListStatus,
  routeDirectory = [],
  requests = [],
  selectedResultId,
}: {
  activePatrols?: ActivePatrol[];
  dashboardMetrics?: Metric[];
  dataSourceMode: DataSourceMode;
  employeeDirectory?: EmployeeDirectoryItem[];
  onCreateRequest: (sourceResultId?: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onOpenRequest: (resultId?: string) => void;
  onRetryRequests: () => void | Promise<void>;
  onSelectResult: (id: string) => void;
  requestListErrorMessage?: string;
  requestListStatus: DataSourceStatus;
  routeDirectory?: RouteDirectoryItem[];
  requests: ServiceRequest[];
  selectedResultId: string;
}) {
  const { errorMessage: resultListErrorMessage, listStatus: resultListStatus, refreshResults, results: patrolResults } = useResultsWorkspace({
    dataSourceMode,
    onSelectResult,
    selectedResultId,
    showToast: onNotify,
  });

  const normalizedMetrics = dashboardMetrics.length > 0 ? dashboardMetrics : emptyDashboardMetrics;
  const issueResults = patrolResults.filter((result) => isIssueResult(result.status));
  const activeCount = activePatrols.length;
  const completedValue = getMetricValue(normalizedMetrics, ["Завершено", "Completed"]);
  const assignedRequestIds = new Set(activePatrols.map((patrol) => patrol.patrolRequestId).filter(Boolean));
  const dashboardRequests = requests.filter((request) => isOpenRequest(request) && !assignedRequestIds.has(request.id));
  const requestsCount = dashboardRequests.length;
  const routesCount = routeDirectory.filter((route) => !isArchivedRoute(route.status)).length;
  const problemCount = issueResults.length + activePatrols.filter(isProblemPatrol).length;
  const completedCount = Number.parseInt(completedValue, 10) || 0;
  const plan = completedCount + activeCount + requestsCount;
  const completed = plan > 0 ? Math.min(completedCount, plan) : 0;
  const remaining = Math.max(plan - completed, 0);
  const progress = plan > 0 ? Math.min(100, Math.round((completed / plan) * 100)) : 0;
  const showRoutesEmptyNotice = routesCount === 0 && activeCount === 0 && requestsCount === 0 && patrolResults.length === 0;

  const kpis: DashboardKpi[] = [
    {
      key: "completed",
      title: "Завершено сегодня",
      value: String(completedCount),
      subtitle: completedCount === 0 ? "результатов пока нет" : "по журналу результатов",
      tone: "green",
      icon: "check",
      helper: "Факт закрытых обходов за текущую смену или день.",
    },
    {
      key: "active",
      title: "В работе сейчас",
      value: String(activeCount),
      subtitle: activeCount === 0 ? "на маршрутах никого нет" : "активные назначения",
      tone: "blue",
      icon: "walk",
      helper: "Сотрудники, которые сейчас проходят маршрут.",
    },
    {
      key: "requests",
      title: "Ожидают назначения",
      value: String(requestsCount),
      subtitle: requestsCount === 0 ? "очередь чистая" : "заявки без обходчика",
      tone: "orange",
      icon: "document",
      helper: "Заявки, которые еще не привязаны к активному обходу.",
    },
    {
      key: "routes",
      title: "Маршруты",
      value: String(routesCount),
      subtitle: routesCount === 0 ? "справочник пуст" : "доступно для назначения",
      tone: "violet",
      icon: "route",
      helper: "Активные маршруты с точками контроля.",
    },
    {
      key: "problems",
      title: "Требуют внимания",
      value: String(problemCount),
      subtitle: problemCount === 0 ? "критичных замечаний нет" : "замечания и задержки",
      tone: problemCount > 0 ? "red" : "green",
      icon: "alert",
      helper: "Замечания из результатов и проблемные активные обходы.",
    },
  ];

  return (
    <div className="dashboard-am">
      <section className="dashboard-am-hero">
        <div>
          <span>Обход</span>
          <h1>Дашборд смены</h1>
          <p>Короткая картина по заявкам, активным обходам, результатам, замечаниям и готовности маршрутов.</p>
        </div>
        <div className="dashboard-am-hero-actions">
          <button className="button ghost" onClick={() => onNavigate("results")} type="button">
            Открыть результаты
          </button>
          <button className="button primary" onClick={() => onCreateRequest()} type="button">
            Создать заявку
          </button>
        </div>
      </section>

      <section className="dashboard-am-kpis" aria-label="Показатели смены">
        {kpis.map((card) => (
          <KpiCard card={card} key={card.key} />
        ))}
      </section>

      {showRoutesEmptyNotice ? <RoutesEmptyNotice onNavigate={onNavigate} /> : null}

      <section className="dashboard-am-top-grid">
        <OperationalSummary
          completed={completed}
          plan={plan}
          progress={progress}
          resultListErrorMessage={resultListErrorMessage}
          resultListStatus={resultListStatus}
          patrolResults={patrolResults}
          onNavigate={onNavigate}
          onRefreshResults={refreshResults}
          onSelectResult={onSelectResult}
          remaining={remaining}
        />
        <QuickActions onCreateRequest={() => onCreateRequest()} onNavigate={onNavigate} />
      </section>

      <section className="dashboard-am-lists">
        <ActivePatrolsList activePatrols={activePatrols} onNavigate={onNavigate} />
        <UpcomingAssignments
          requests={dashboardRequests}
          onNavigate={onNavigate}
          onOpenRequestById={onOpenRequestById}
          onRetry={onRetryRequests}
          status={requestListStatus}
          errorMessage={requestListErrorMessage}
        />
        <IncidentsList incidents={issueResults} onNavigate={onNavigate} />
      </section>

      <DataQuality activePatrols={activePatrols} employeeDirectory={employeeDirectory} routeDirectory={routeDirectory} />
    </div>
  );
}

function RoutesEmptyNotice({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  return (
    <article className="dashboard-am-panel dashboard-am-setup-notice">
      <span className="dashboard-am-icon">
        <DashboardIcon name="route" />
      </span>
      <div>
        <strong>Маршруты обхода не заведены</strong>
        <p>
          Рабочий цикл пока пустой: нет маршрутов, заявок, назначений и результатов. Сначала заведите маршруты и контрольные точки, затем создайте первое
          назначение.
        </p>
      </div>
      <div className="dashboard-am-setup-actions">
        <button className="button primary" onClick={() => onNavigate("routes")} type="button">
          Добавить маршрут
        </button>
        <button className="button ghost" onClick={() => onNavigate("assign")} type="button">
          К назначениям
        </button>
      </div>
    </article>
  );
}

function KpiCard({ card }: { card: DashboardKpi }) {
  return (
    <article className={`dashboard-am-kpi ${card.tone}`} title={card.helper}>
      <span className="dashboard-am-icon">
        <DashboardIcon name={card.icon} />
      </span>
      <div>
        <p>{card.title}</p>
        <strong>{card.value}</strong>
        <small>{card.subtitle}</small>
      </div>
    </article>
  );
}

function OperationalSummary({
  completed,
  onNavigate,
  onRefreshResults,
  onSelectResult,
  patrolResults,
  plan,
  progress,
  remaining,
  resultListErrorMessage,
  resultListStatus,
}: {
  completed: number;
  onNavigate: (screen: ScreenId) => void;
  onRefreshResults: () => void | Promise<void>;
  onSelectResult: (id: string) => void;
  patrolResults: PatrolResult[];
  plan: number;
  progress: number;
  remaining: number;
  resultListErrorMessage?: string;
  resultListStatus: DataSourceStatus;
}) {
  const ringOffset = 100 - progress;

  return (
    <article className="dashboard-am-panel dashboard-am-summary">
      <PanelHeader title="Оперативная сводка" />
      <div className="dashboard-am-summary-grid">
        <div className="dashboard-am-progress-block">
          <h3>План смены</h3>
          <div className="dashboard-am-progress-row">
            <div className={`dashboard-am-ring ${progress === 0 ? "empty" : ""}`} aria-label={`Выполнено ${progress}%`}>
              <svg viewBox="0 0 160 160" role="img" aria-hidden="true">
                <defs>
                  <linearGradient id="dashboardProgressGradient" x1="28" y1="132" x2="132" y2="28" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#0B63F6" />
                    <stop offset="0.55" stopColor="#1687FF" />
                    <stop offset="1" stopColor="#32C5FF" />
                  </linearGradient>
                  <filter id="dashboardProgressGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0B63F6" floodOpacity="0.18" />
                  </filter>
                </defs>
                <circle className="dashboard-am-ring-surface" cx="80" cy="80" r="66" />
                <circle className="dashboard-am-ring-track" cx="80" cy="80" r="58" pathLength="100" />
                <circle
                  className="dashboard-am-ring-value"
                  cx="80"
                  cy="80"
                  r="58"
                  pathLength="100"
                  strokeDasharray="100"
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div>
                <strong>{progress}%</strong>
                <span>закрыто</span>
              </div>
            </div>

            <dl className="dashboard-am-metrics">
              <div>
                <dt>Всего задач</dt>
                <dd>{plan}</dd>
              </div>
              <div>
                <dt>Завершено</dt>
                <dd className="success-text">{completed}</dd>
              </div>
              <div>
                <dt>В очереди/работе</dt>
                <dd className="blue-text">{remaining}</dd>
              </div>
            </dl>
          </div>
        </div>

        <LatestResultsPreview
          errorMessage={resultListErrorMessage}
          onNavigate={onNavigate}
          onRefresh={onRefreshResults}
          onSelectResult={onSelectResult}
          results={patrolResults}
          status={resultListStatus}
        />
      </div>
    </article>
  );
}

function LatestResultsPreview({
  errorMessage,
  onNavigate,
  onRefresh,
  onSelectResult,
  results,
  status,
}: {
  errorMessage?: string;
  onNavigate: (screen: ScreenId) => void;
  onRefresh: () => void | Promise<void>;
  onSelectResult: (id: string) => void;
  results: PatrolResult[];
  status: DataSourceStatus;
}) {
  const latestResults = useMemo(() => {
    return [...results].sort((left, right) => getResultTimestamp(right) - getResultTimestamp(left)).slice(0, 3);
  }, [results]);
  const [openedResultId, setOpenedResultId] = useState<string | null>(null);
  const openedResult = openedResultId ? results.find((result) => result.id === openedResultId) : undefined;
  const isInitialLoading = status === "loading" && latestResults.length === 0;
  const isRefreshing = status === "loading" && latestResults.length > 0;

  function openResult(result: PatrolResult) {
    setOpenedResultId(result.id);
    onSelectResult(result.id);
  }

  return (
    <div className="dashboard-am-latest">
      <div className="dashboard-am-latest-head">
        <h3>Последние результаты</h3>
        <span>{isRefreshing ? "обновление" : `${latestResults.length} из 3`}</span>
      </div>

      {isInitialLoading ? (
        <CompactEmptyState title="Загружаем результаты" text="Получаем последние записи из журнала обходов." />
      ) : status === "error" ? (
        <div className="dashboard-am-error compact">
          <strong>Результаты не загрузились</strong>
          <span>{errorMessage ?? "Источник данных временно недоступен."}</span>
          <button onClick={() => void onRefresh()} type="button">Повторить</button>
        </div>
      ) : latestResults.length === 0 ? (
        <CompactEmptyState title="Обходов пока нет" text="Завершенные обходы появятся здесь после загрузки журнала." />
      ) : (
        <div className="dashboard-am-latest-list">
          {latestResults.map((result) => (
            <button className={`dashboard-am-latest-row ${openedResult?.id === result.id ? "active" : ""}`} key={result.id} onClick={() => openResult(result)} type="button">
              <span className={`dashboard-am-status-dot ${isIssueResult(result.status) ? "orange" : "green"}`} />
              <div>
                <strong>{result.route || "Маршрут не указан"}</strong>
                <span>{formatShortName(result.employee)} · {formatResultStatus(result.status)}</span>
              </div>
              <time>{formatResultTime(result)}</time>
            </button>
          ))}
        </div>
      )}

      {openedResult ? (
        <DashboardResultModal
          onClose={() => setOpenedResultId(null)}
          onOpenJournal={() => {
            onSelectResult(openedResult.id);
            onNavigate("results");
          }}
          result={openedResult}
        />
      ) : null}
    </div>
  );
}

function DashboardResultModal({
  onClose,
  onOpenJournal,
  result,
}: {
  onClose: () => void;
  onOpenJournal: () => void;
  result: PatrolResult;
}) {
  return (
    <div className="dashboard-am-result-modal-backdrop" onMouseDown={onClose} role="presentation">
      <section aria-modal="true" className="dashboard-am-result-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="dashboard-am-result-modal-head">
          <div>
            <span>Результат обхода</span>
            <h2>{result.route || "Маршрут не указан"}</h2>
            <p>{formatShortName(result.employee)} · {formatResultTime(result)}</p>
          </div>
          <button aria-label="Закрыть" className="dashboard-am-result-modal-close" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="dashboard-am-result-modal-kpis">
          <div>
            <span>Статус</span>
            <strong>{formatResultStatus(result.status)}</strong>
          </div>
          <div>
            <span>Точка</span>
            <strong>{result.point || "-"}</strong>
          </div>
          <div>
            <span>Фото/видео</span>
            <strong>{result.photos}</strong>
          </div>
        </div>

        <div className="dashboard-am-result-modal-grid">
          <section>
            <h3>Комментарий</h3>
            <p>{result.comment || "Комментарий по результату не заполнен."}</p>
          </section>
          <section>
            <h3>Контекст</h3>
            <dl>
              <div><dt>Территория</dt><dd>{result.territory || "-"}</dd></div>
              <div><dt>Смена</dt><dd>{result.shift || "-"}</dd></div>
              <div><dt>Отклонение</dt><dd>{result.deviation || "-"}</dd></div>
            </dl>
          </section>
        </div>

        <section className="dashboard-am-result-modal-history">
          <h3>Хронология</h3>
          <ul>
            {getResultChronology(result).map((event) => (
              <li key={event}>{event}</li>
            ))}
          </ul>
        </section>

        <footer className="dashboard-am-result-modal-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Закрыть
          </button>
          <button className="button primary" onClick={onOpenJournal} type="button">
            Открыть в журнале
          </button>
        </footer>
      </section>
    </div>
  );
}

function QuickActions({ onCreateRequest, onNavigate }: { onCreateRequest: () => void; onNavigate: (screen: ScreenId) => void }) {
  const actions: Array<{ icon: DashboardIconName; label: string; hint: string; onClick: () => void }> = [
    { icon: "map", label: "Маршруты", hint: "точки и NFC", onClick: () => onNavigate("routes") },
    { icon: "document", label: "Новая заявка", hint: "создать обход", onClick: onCreateRequest },
    { icon: "target", label: "Результаты", hint: "журнал обходов", onClick: () => onNavigate("results") },
    { icon: "mobile", label: "Мобильные", hint: "аккаунты входа", onClick: () => onNavigate("accounts") },
  ];

  return (
    <article className="dashboard-am-panel dashboard-am-actions">
      <PanelHeader title="Быстрые действия" />
      <div className="dashboard-am-action-grid">
        {actions.map((action) => (
          <button key={action.label} onClick={action.onClick} type="button">
            <span className="dashboard-am-icon">
              <DashboardIcon name={action.icon} />
            </span>
            <span>
              <strong>{action.label}</strong>
              <small>{action.hint}</small>
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}

function ActivePatrolsList({ activePatrols, onNavigate }: { activePatrols: ActivePatrol[]; onNavigate: (screen: ScreenId) => void }) {
  return (
    <ListPanel action="Смотреть все" onAction={() => onNavigate("assign")} title="Активные обходы">
      {activePatrols.length === 0 ? (
        <CompactEmptyState title="Активных обходов нет" text="Назначьте первый обход, чтобы видеть сотрудников на маршрутах." />
      ) : (
        activePatrols.slice(0, 4).map((patrol) => (
          <div className="dashboard-am-list-row active" key={patrol.id}>
            <span className={`dashboard-am-dot ${isProblemPatrol(patrol) ? "orange" : "green"}`} />
            <strong>{patrol.route}</strong>
            <span>{patrol.startedAt ?? patrol.eta ?? "-"}</span>
            <span>{patrol.zone}</span>
            <span>{formatShortName(patrol.employee)}</span>
            <DashboardIcon name="pin" />
          </div>
        ))
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("assign")} type="button">
        Открыть назначения
      </button>
    </ListPanel>
  );
}

function UpcomingAssignments({
  errorMessage,
  onNavigate,
  onOpenRequestById,
  onRetry,
  requests,
  status,
}: {
  errorMessage?: string;
  onNavigate: (screen: ScreenId) => void;
  onOpenRequestById: (requestId: string) => void;
  onRetry: () => void | Promise<void>;
  requests: ServiceRequest[];
  status: DataSourceStatus;
}) {
  return (
    <ListPanel action="Смотреть все" onAction={() => onNavigate("schedule")} title="Ближайшие назначения">
      {status === "error" ? (
        <div className="dashboard-am-error">
          <strong>Заявки не загрузились</strong>
          <span>{errorMessage ?? "Источник данных временно недоступен."}</span>
          <button onClick={() => void onRetry()} type="button">Повторить</button>
        </div>
      ) : requests.length === 0 ? (
        <CompactEmptyState title="Назначений нет" text="Плановые заявки появятся здесь после создания." />
      ) : (
        requests.slice(0, 4).map((request) => (
          <button className="dashboard-am-list-row upcoming" key={request.id} onClick={() => onOpenRequestById(request.id)} type="button">
            <DashboardIcon name="calendar" />
            <span>{formatRequestDate(request)}</span>
            <strong>{request.route}</strong>
            <span>{formatShortName(request.responsible || request.employee || "-")}</span>
          </button>
        ))
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("schedule")} type="button">
        Перейти к календарю
      </button>
    </ListPanel>
  );
}

function IncidentsList({ incidents, onNavigate }: { incidents: PatrolResult[]; onNavigate: (screen: ScreenId) => void }) {
  return (
    <ListPanel action="Смотреть все" onAction={() => onNavigate("results")} title="Замечания и инциденты">
      {incidents.length === 0 ? (
        <CompactEmptyState title="Замечаний нет" text="Журнал заполнится после результатов обходов с проблемами." />
      ) : (
        [...incidents]
          .sort((left, right) => getResultTimestamp(right) - getResultTimestamp(left))
          .slice(0, 4)
          .map((incident) => (
            <div className="dashboard-am-list-row incident" key={incident.id}>
              <span className="dashboard-am-alert-icon">
                <DashboardIcon name="alert" />
              </span>
              <div className="dashboard-am-incident-copy">
                <strong>{incident.route || "Маршрут не указан"}</strong>
                <span>{incident.point || incident.comment || "Есть замечание"}</span>
              </div>
              <time>{formatResultTime(incident)}</time>
            </div>
          ))
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("results")} type="button">
        Открыть журнал
      </button>
    </ListPanel>
  );
}

function DataQuality({
  activePatrols,
  employeeDirectory,
  routeDirectory,
}: {
  activePatrols: ActivePatrol[];
  employeeDirectory: EmployeeDirectoryItem[];
  routeDirectory: RouteDirectoryItem[];
}) {
  const activeRoutes = routeDirectory.filter((route) => !isArchivedRoute(route.status));
  const routesWithPoints = activeRoutes.filter((route) => route.points.length > 0).length;
  const routeReadiness = getPercent(routesWithPoints, activeRoutes.length);
  const activeWithProgress = activePatrols.filter((patrol) => patrol.progress > 0).length;
  const patrolReadiness = getPercent(activeWithProgress, activePatrols.length);
  const onlineEmployees = employeeDirectory.filter((employee) => !isOfflineEmployee(employee.status)).length;
  const mobileReady = getPercent(onlineEmployees, employeeDirectory.length);
  const pointsTotal = activeRoutes.reduce((sum, route) => sum + route.points.length, 0);
  const configuredPoints = activeRoutes.reduce(
    (sum, route) => sum + route.points.filter((point) => Boolean((point.nfcCode ?? point.tag).trim()) && (point.nfcCode ?? point.tag).trim() !== "-").length,
    0,
  );
  const activePoints = activeRoutes.reduce(
    (sum, route) => sum + route.points.filter((point) => !isDraftPoint(point.status)).length,
    0,
  );
  const configuredPointPercent = getPercent(configuredPoints, pointsTotal);
  const pointCoveragePercent = getPercent(activePoints, pointsTotal);
  const items: Array<{ icon: DashboardIconName; title: string; value: string; text: string }> = [
    { icon: "map", title: "Маршруты с точками", value: `${routeReadiness}%`, text: activeRoutes.length === 0 ? "маршрутов пока нет" : `${routesWithPoints} из ${activeRoutes.length}` },
    { icon: "target", title: "Метки NFC/QR", value: `${configuredPointPercent}%`, text: pointsTotal > 0 ? `${configuredPoints} из ${pointsTotal} с меткой` : "нет точек осмотра" },
    { icon: "pin", title: "Активные точки", value: `${pointCoveragePercent}%`, text: pointsTotal > 0 ? `${activePoints} из ${pointsTotal} активны` : "нет данных" },
    { icon: "mobile", title: "Сотрудники", value: `${mobileReady}%`, text: `${onlineEmployees} из ${employeeDirectory.length} доступны` },
    { icon: "cloud", title: "Синхронизация обходов", value: `${patrolReadiness}%`, text: activePatrols.length === 0 ? "активных обходов нет" : "есть прогресс по маршрутам" },
  ];

  return (
    <article className="dashboard-am-panel dashboard-am-quality">
      <PanelHeader title="Качество данных и готовность" />
      <div className="dashboard-am-quality-grid">
        {items.map((item) => (
          <div className="dashboard-am-quality-item" key={item.title}>
            <div>
              <p>{item.title}</p>
              <strong>{item.value}</strong>
              <span>{item.text}</span>
            </div>
            <span className="dashboard-am-icon">
              <DashboardIcon name={item.icon} />
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function ListPanel({
  action,
  children,
  onAction,
  title,
}: {
  action: string;
  children: ReactNode;
  onAction: () => void;
  title: string;
}) {
  return (
    <article className="dashboard-am-panel dashboard-am-list-panel">
      <PanelHeader action={action} onAction={onAction} title={title} />
      <div className="dashboard-am-list">{children}</div>
    </article>
  );
}

function PanelHeader({ action, onAction, title }: { action?: string; onAction?: () => void; title: string }) {
  return (
    <header className="dashboard-am-panel-head">
      <h2>{title}</h2>
      {action && onAction ? (
        <button onClick={onAction} type="button">
          {action}
        </button>
      ) : null}
    </header>
  );
}

function CompactEmptyState({ text, title }: { text: string; title: string }) {
  return (
    <div className="dashboard-am-empty">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function DashboardIcon({ name }: { name: DashboardIconName }) {
  return (
    <svg className="dashboard-am-svg" viewBox="0 0 24 24" aria-hidden="true">
      {name === "check" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m8.6 12.2 2.2 2.2 4.8-5" />
        </>
      ) : null}
      {name === "walk" ? (
        <>
          <circle cx="12" cy="4.8" r="2" />
          <path d="m10.6 8.2 3.4 1.7 1.1 3.5" />
          <path d="m10.5 8.5-1.7 4.2 3.2 1.7" />
          <path d="m12 14.4-2.2 5" />
          <path d="m13.4 14.4 3.4 4.6" />
        </>
      ) : null}
      {name === "document" ? (
        <>
          <path d="M6 4h9l3 3v13H6z" />
          <path d="M15 4v4h4" />
          <path d="M9 12h6" />
          <path d="M9 16h4" />
        </>
      ) : null}
      {name === "route" ? (
        <>
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="18" cy="8" r="2.4" />
          <circle cx="10" cy="18" r="2.4" />
          <path d="M8.2 7.2 15.8 7.8" />
          <path d="M16.4 10.1 11.3 16" />
        </>
      ) : null}
      {name === "alert" ? (
        <>
          <path d="M12 4 3.7 19h16.6z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      ) : null}
      {name === "map" ? (
        <>
          <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2z" />
          <path d="M9 4v14" />
          <path d="M15 6v14" />
        </>
      ) : null}
      {name === "target" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3" />
          <path d="M12 19v3" />
          <path d="M2 12h3" />
          <path d="M19 12h3" />
        </>
      ) : null}
      {name === "mobile" ? (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M10 6h4" />
          <path d="M12 17h.01" />
        </>
      ) : null}
      {name === "pin" ? (
        <>
          <path d="M12 21s6-5.2 6-11a6 6 0 0 0-12 0c0 5.8 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2" />
        </>
      ) : null}
      {name === "calendar" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 10h16" />
        </>
      ) : null}
      {name === "cloud" ? (
        <>
          <path d="M17.5 18H8a4 4 0 1 1 .7-7.9A5.5 5.5 0 0 1 19 12.6 2.8 2.8 0 0 1 17.5 18Z" />
          <path d="m9.5 14 1.8 1.8 3.6-4" />
        </>
      ) : null}
      {name === "user" ? (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c1-4 3.3-6 7-6s6 2 7 6" />
        </>
      ) : null}
    </svg>
  );
}

function getMetricValue(metrics: Metric[], labels: string[]) {
  const metric = metrics.find((item) => labels.some((label) => item.label.includes(label)));
  return metric?.value ?? "0";
}

function getPercent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function getResultTimestamp(result: PatrolResult) {
  const candidates = [result.actualAt, result.finishedAt, result.startedAt, result.plannedAt];
  for (const candidate of candidates) {
    const timestamp = parsePatrolDate(candidate);
    if (timestamp > 0) return timestamp;
  }
  return 0;
}

function parsePatrolDate(value?: string) {
  const source = value?.trim();
  if (!source) return 0;

  const isoTimestamp = Date.parse(source);
  if (!Number.isNaN(isoTimestamp)) return isoTimestamp;

  const match = source.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return 0;

  const [, day, month, year, hour = "0", minute = "0"] = match;
  const timestamp = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatShortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name || "-";

  const [lastName, firstName, middleName] = parts;
  return [lastName, firstName ? `${firstName[0]}.` : "", middleName ? `${middleName[0]}.` : ""].filter(Boolean).join(" ");
}

function formatResultTime(result: PatrolResult) {
  return result.actualAt || result.plannedAt || "-";
}

function getResultChronology(result: PatrolResult) {
  const entries = [
    result.startedAt ? `Начало обхода: ${result.startedAt}` : "",
    result.actualAt ? `Фиксация результата: ${result.actualAt}` : "",
    result.finishedAt ? `Окончание обхода: ${result.finishedAt}` : "",
    result.plannedAt && !result.actualAt ? `Плановое время: ${result.plannedAt}` : "",
    ...result.chronology,
  ].filter(Boolean);

  return entries.length > 0 ? entries.slice(0, 4) : ["Событий по результату нет."];
}

function formatResultStatus(status: string) {
  if (matchesAny(status, ["Подтверж", "confirmed"])) return "Подтверждено";
  if (matchesAny(status, ["Замеч", "issue"])) return "Замечание";
  if (matchesAny(status, ["Проср", "overdue"])) return "Просрочено";
  if (matchesAny(status, ["Не подтверж", "rejected"])) return "Не подтверждено";
  return status || "-";
}

function isIssueResult(status: string) {
  return matchesAny(status, ["Замеч", "Проср", "issue", "overdue"]);
}

function isProblemPatrol(patrol: ActivePatrol) {
  return matchesAny(patrol.status, ["Задерж", "Нет", "delay", "offline"]);
}

function isOpenRequest(request: ServiceRequest) {
  return !matchesAny(request.status, ["Закрыта", "closed"]);
}

function isArchivedRoute(status: string) {
  return matchesAny(status, ["Архив", "archive"]);
}

function isDraftPoint(status: string) {
  return matchesAny(status, ["Черновик", "draft"]);
}

function isOfflineEmployee(status: string) {
  return matchesAny(status, ["Офлайн", "offline", "Отпуск"]);
}

function formatRequestDate(request: ServiceRequest) {
  const date = request.scheduledDate || "Сегодня";
  const time = request.scheduledTime || request.dueAt || "-";
  return `${date}, ${time}`;
}

function matchesAny(value: string, needles: string[]) {
  const source = value.toLocaleLowerCase("ru-RU");
  return needles.some((needle) => source.includes(needle.toLocaleLowerCase("ru-RU")));
}
