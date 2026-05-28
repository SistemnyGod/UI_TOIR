import { useMemo, useState, type ReactNode } from "react";
import { useResultsWorkspace } from "../hooks/useResultsWorkspace";
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
} from "../types";

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
};

type DashboardIconName =
  | "alert"
  | "bell"
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
  const completedValue = getMetricValue(normalizedMetrics, ["Завершено", "Заверш"]);
  const assignedRequestIds = new Set(activePatrols.map((patrol) => patrol.patrolRequestId).filter(Boolean));
  const dashboardRequests = requests.filter((request) => isOpenRequest(request) && !assignedRequestIds.has(request.id));
  const requestsCount = dashboardRequests.length;
  const routesCount = routeDirectory.length;
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
      title: "Завершено обходов сегодня",
      value: completedValue,
      subtitle: completed === 0 ? "живых результатов пока нет" : "по текущей смене",
      tone: "green",
      icon: "check",
    },
    {
      key: "active",
      title: "Активные обходы",
      value: String(activeCount),
      subtitle: activeCount === 0 ? "нет активных обходов" : "сейчас на маршрутах",
      tone: "blue",
      icon: "walk",
    },
    {
      key: "requests",
      title: "Заявки на обход",
      value: String(requestsCount),
      subtitle: requestsCount === 0 ? "ожидают прохождения" : "в работе и ожидании",
      tone: "orange",
      icon: "document",
    },
    {
      key: "routes",
      title: "Маршруты в справочнике",
      value: String(routesCount),
      subtitle: routesCount === 0 ? "локальный справочник" : "в справочнике",
      tone: "blue",
      icon: "route",
    },
    {
      key: "problems",
      title: "Проблемные точки",
      value: String(problemCount),
      subtitle: problemCount === 0 ? "критичных замечаний нет" : "требуют внимания",
      tone: problemCount > 0 ? "red" : "green",
      icon: "alert",
    },
  ];

  return (
    <div className="dashboard-am">
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
          Живая база подключена, но рабочий цикл пока пустой: нет маршрутов, заявок, назначений и результатов.
          Начните с маршрутов и контрольных точек, затем создайте первое назначение.
        </p>
      </div>
      <div className="dashboard-am-setup-actions">
        <button className="button primary" onClick={() => onNavigate("routes")} type="button">
          Добавить маршрут
        </button>
        <button className="button ghost" onClick={() => onNavigate("assign")} type="button">
          Перейти к назначениям
        </button>
      </div>
    </article>
  );
}

function KpiCard({ card }: { card: DashboardKpi }) {
  return (
    <article className={`dashboard-am-kpi ${card.tone}`}>
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
          <h3>Прогресс обходов сегодня</h3>
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
                <span>выполнено</span>
              </div>
            </div>

            <dl className="dashboard-am-metrics">
              <div>
                <dt>План</dt>
                <dd>{plan}</dd>
              </div>
              <div>
                <dt>Завершено</dt>
                <dd className="success-text">{completed}</dd>
              </div>
              <div>
                <dt>Осталось</dt>
                <dd className="blue-text">{remaining}</dd>
              </div>
            </dl>
          </div>
        </div>

        <LatestResultsPreview
          errorMessage={resultListErrorMessage}
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
  onRefresh,
  onSelectResult,
  results,
  status,
}: {
  errorMessage?: string;
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

  function openResult(result: PatrolResult) {
    setOpenedResultId((current) => (current === result.id ? null : result.id));
    onSelectResult(result.id);
  }

  return (
    <div className="dashboard-am-latest">
      <div className="dashboard-am-latest-head">
        <h3>Последние обходы</h3>
        <span>{latestResults.length} из 3</span>
      </div>

      {status === "loading" ? (
        <CompactEmptyState title="Результаты загружаются" text="Получаем последние обходы из журнала результатов." />
      ) : status === "error" ? (
        <div className="dashboard-am-error compact">
          <strong>Результаты не загрузились</strong>
          <span>{errorMessage ?? "Источник данных временно недоступен."}</span>
          <button onClick={() => void onRefresh()} type="button">Повторить</button>
        </div>
      ) : latestResults.length === 0 ? (
        <CompactEmptyState title="Обходов пока нет" text="Последние выполненные обходы появятся здесь после загрузки журнала." />
      ) : (
        <div className="dashboard-am-latest-list">
          {latestResults.map((result) => (
            <div className={`dashboard-am-latest-row ${openedResult?.id === result.id ? "active" : ""}`} key={result.id}>
              <div>
                <strong>{formatShortName(result.employee)}</strong>
                <span>{result.route}</span>
              </div>
              <button onClick={() => openResult(result)} type="button">
                {openedResult?.id === result.id ? "Скрыть" : "Подробнее"}
              </button>
            </div>
          ))}
        </div>
      )}

      {openedResult ? (
        <div className="dashboard-am-result-detail">
          <div>
            <span>Результат</span>
            <strong>{formatResultStatus(openedResult.status)}</strong>
          </div>
          <p>{openedResult.comment || "Комментарий по результату не заполнен."}</p>
          <dl>
            <div><dt>Точка</dt><dd>{openedResult.point || "-"}</dd></div>
            <div><dt>Время</dt><dd>{openedResult.actualAt || openedResult.plannedAt || "-"}</dd></div>
            <div><dt>Фото</dt><dd>{openedResult.photos}</dd></div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function QuickActions({ onCreateRequest, onNavigate }: { onCreateRequest: () => void; onNavigate: (screen: ScreenId) => void }) {
  const actions: Array<{ icon: DashboardIconName; label: string; onClick: () => void }> = [
    { icon: "map", label: "Создать маршрут", onClick: () => onNavigate("routes") },
    { icon: "document", label: "Создать заявку на обход", onClick: onCreateRequest },
    { icon: "target", label: "Открыть результаты обходов", onClick: () => onNavigate("results") },
    { icon: "mobile", label: "Открыть мобильные аккаунты", onClick: () => onNavigate("accounts") },
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
            <strong>{action.label}</strong>
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
        <CompactEmptyState title="Активных обходов нет" text="Назначьте первый обход, чтобы увидеть сотрудников на маршрутах." />
      ) : (
        activePatrols.slice(0, 4).map((patrol) => (
          <div className="dashboard-am-list-row active" key={patrol.id}>
            <span className={`dashboard-am-dot ${isProblemPatrol(patrol) ? "orange" : "green"}`} />
            <strong>{patrol.route}</strong>
            <span>{patrol.startedAt ?? patrol.eta ?? "-"}</span>
            <span>{patrol.zone}</span>
            <span>{patrol.employee}</span>
            <DashboardIcon name="pin" />
          </div>
        ))
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("assign")} type="button">
        Смотреть все активные обходы
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
            <span>{request.responsible || request.employee || "-"}</span>
          </button>
        ))
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("schedule")} type="button">
        Перейти к календарю назначений
      </button>
    </ListPanel>
  );
}

function IncidentsList({ incidents, onNavigate }: { incidents: PatrolResult[]; onNavigate: (screen: ScreenId) => void }) {
  return (
    <ListPanel action="Смотреть все" onAction={() => onNavigate("results")} title="Последние инциденты">
      {incidents.length === 0 ? (
        <CompactEmptyState title="Инцидентов нет" text="Журнал заполнится после результатов обходов с замечаниями." />
      ) : (
        incidents.slice(0, 4).map((incident) => (
          <div className="dashboard-am-list-row incident" key={incident.id}>
            <span className="dashboard-am-alert-icon">
              <DashboardIcon name="alert" />
            </span>
            <strong>{incident.issueType || incident.point}</strong>
            <span>{incident.route}</span>
            <time>{incident.actualAt || incident.plannedAt}</time>
            <em>{formatIncidentStatus(incident.status)}</em>
          </div>
        ))
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("results")} type="button">
        Перейти к журналу инцидентов
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
  const routesWithPoints = routeDirectory.filter((route) => route.points.length > 0).length;
  const routeReadiness = getPercent(routesWithPoints, routeDirectory.length);
  const activeWithProgress = activePatrols.filter((patrol) => patrol.progress > 0).length;
  const patrolReadiness = getPercent(activeWithProgress, activePatrols.length);
  const onlineEmployees = employeeDirectory.filter((employee) => employee.status !== "Офлайн").length;
  const mobileReady = getPercent(onlineEmployees, employeeDirectory.length);
  const pointsTotal = routeDirectory.reduce((sum, route) => sum + route.points.length, 0);
  const items: Array<{ icon: DashboardIconName; title: string; value: string; text: string }> = [
    { icon: "map", title: "Актуальность маршрутов", value: `${routeReadiness}%`, text: routeDirectory.length === 0 ? "маршрутов пока нет" : `${routeDirectory.length} маршрутов` },
    { icon: "target", title: "Точность геоданных", value: pointsTotal > 0 ? "96%" : "0%", text: pointsTotal > 0 ? "точки с координатами" : "нет точек осмотра" },
    { icon: "pin", title: "Покрытие точек осмотра", value: pointsTotal > 0 ? "93%" : "0%", text: pointsTotal > 0 ? `${pointsTotal} точек` : "нет данных" },
    { icon: "mobile", title: "Готовность устройств", value: `${mobileReady}%`, text: `${employeeDirectory.length} сотрудников` },
    { icon: "cloud", title: "Синхронизация данных", value: `${patrolReadiness}%`, text: activePatrols.length === 0 ? "обходов нет" : "по активным обходам" },
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
      {name === "bell" ? (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M10 20a2 2 0 0 0 4 0" />
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
  const timestamp = Date.parse(result.actualAt || result.plannedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatShortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name || "-";

  const [lastName, firstName, middleName] = parts;
  return [lastName, firstName ? `${firstName[0]}.` : "", middleName ? `${middleName[0]}.` : ""].filter(Boolean).join(" ");
}

function formatResultStatus(status: PatrolResult["status"]) {
  if (status.includes("Подтверж")) return "Подтверждено";
  if (status.includes("Замеч")) return "Замечание";
  if (status.includes("Проср")) return "Просрочено";
  return status;
}

function isIssueResult(status: string) {
  return status.includes("Замеч") || status.includes("Проср") || status.includes("Зам") || status.includes("Прос");
}

function isProblemPatrol(patrol: ActivePatrol) {
  return patrol.status.includes("Задерж") || patrol.status.includes("Нет") || patrol.status.includes("Зад") || patrol.status.includes("Нет");
}

function isOpenRequest(request: ServiceRequest) {
  return request.status !== "Закрыта";
}

function formatRequestDate(request: ServiceRequest) {
  const date = request.scheduledDate || "Сегодня";
  const time = request.scheduledTime || request.dueAt || "-";
  return `${date}, ${time}`;
}

function formatIncidentStatus(status: string) {
  if (status.includes("Подтверж") || status.includes("Под")) {
    return "Закрыт";
  }

  if (status.includes("Замеч") || status.includes("Зам")) {
    return "В работе";
  }

  return "Новый";
}
