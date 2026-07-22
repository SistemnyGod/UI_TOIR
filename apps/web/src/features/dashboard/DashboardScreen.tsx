import { useMemo, type ReactNode } from "react";
import { useResultsWorkspace } from "../../hooks/useResultsWorkspace";
import { isTerminalPatrolRequestStatus } from "../../domain/patrolRequestStatus";
import type {
  ActivePatrol,
  DataSourceMode,
  DataSourceStatus,
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
  | "document"
  | "map"
  | "mobile"
  | "pin"
  | "route"
  | "target"
  | "walk";

export function DashboardScreen({
  activePatrols = [],
  dashboardMetrics = [],
  onCreateRequest,
  dataSourceMode,
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
  onCreateRequest: (sourceResultId?: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequestById: (requestId: string) => void;
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
  const openRequests = requests.filter(isOpenRequest);
  const unassignedRequests = openRequests.filter((request) => !assignedRequestIds.has(request.id));
  const upcomingDashboardRequests = openRequests
    .filter(isTodayOrFutureRequest)
    .sort((left, right) => requestTimestamp(left) - requestTimestamp(right));
  const requestsCount = unassignedRequests.length;
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
          activePatrols={activePatrols}
          requests={upcomingDashboardRequests}
          onNavigate={onNavigate}
          onOpenRequestById={onOpenRequestById}
          onRetry={onRetryRequests}
          status={requestListStatus}
          errorMessage={requestListErrorMessage}
        />
        <IncidentsList incidents={issueResults} onNavigate={onNavigate} onSelectResult={onSelectResult} />
      </section>

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
  const isInitialLoading = status === "loading" && latestResults.length === 0;
  const isRefreshing = status === "loading" && latestResults.length > 0;

  return (
    <div className="dashboard-am-latest">
      <div className="dashboard-am-latest-head">
        <h3>Последние результаты</h3>
        <div className="dashboard-am-latest-head-actions">
          <span>{isRefreshing ? "обновление" : `${latestResults.length} из 3`}</span>
          <button className="dashboard-am-panel-head-link" onClick={() => onNavigate("results")} type="button">
            Смотреть все
          </button>
        </div>
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
            <button
              aria-label={`Открыть результат обхода: ${result.route || "Маршрут не указан"}`}
              className="dashboard-am-latest-row"
              key={result.id}
              onClick={() => {
                onSelectResult(result.id);
                onNavigate("results");
              }}
              type="button"
            >
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
          <button
            aria-label={patrol.route || "-"}
            className="dashboard-am-list-row active"
            key={patrol.id}
            onClick={() => onNavigate("assign")}
            type="button"
          >
            <span className={`dashboard-am-dot ${isProblemPatrol(patrol) ? "orange" : "green"}`} />
            <strong>{patrol.route}</strong>
            <span>{patrol.startedAt ?? patrol.eta ?? "-"}</span>
            <span>{patrol.zone}</span>
            <span>{formatShortName(patrol.employee)}</span>
            <DashboardIcon name="pin" />
          </button>
        ))
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("assign")} type="button">
        Открыть назначения
      </button>
    </ListPanel>
  );
}

function UpcomingAssignments({
  activePatrols,
  errorMessage,
  onNavigate,
  onOpenRequestById,
  onRetry,
  requests,
  status,
}: {
  activePatrols: ActivePatrol[];
  errorMessage?: string;
  onNavigate: (screen: ScreenId) => void;
  onOpenRequestById: (requestId: string) => void;
  onRetry: () => void | Promise<void>;
  requests: ServiceRequest[];
  status: DataSourceStatus;
}) {
  const requestAssignmentIds = new Set(requests.map((request) => request.assignmentId).filter(Boolean));
  const requestIds = new Set(requests.map((request) => request.id));
  const fallbackPatrols = activePatrols
    .filter(isDisplayedAssignment)
    .filter((patrol) => !requestAssignmentIds.has(patrol.id) && !requestIds.has(patrol.patrolRequestId ?? ""))
    .slice(0, 4);

  return (
    <ListPanel action="Смотреть все" onAction={() => onNavigate("schedule")} title="Ближайшие назначения">
      {status === "error" ? (
        <div className="dashboard-am-error">
          <strong>Заявки не загрузились</strong>
          <span>{errorMessage ?? "Источник данных временно недоступен."}</span>
          <button onClick={() => void onRetry()} type="button">Повторить</button>
        </div>
      ) : requests.length === 0 && fallbackPatrols.length === 0 ? (
        <CompactEmptyState title="Назначений нет" text="Плановые заявки появятся здесь после создания." />
      ) : (
        <>
          {requests.slice(0, 4).map((request) => (
            <button className="dashboard-am-list-row upcoming" key={request.id} onClick={() => onOpenRequestById(request.id)} type="button">
              <DashboardIcon name="calendar" />
              <span>{formatRequestDate(request)}</span>
              <strong>{request.route}</strong>
              <span>{formatShortName(request.responsible || request.employee || "-")}</span>
            </button>
          ))}
          {fallbackPatrols.map((patrol) => (
            <button className="dashboard-am-list-row upcoming" key={`active-${patrol.id}`} onClick={() => onNavigate("assign")} type="button">
              <DashboardIcon name="calendar" />
              <span>{patrol.plannedAt || patrol.eta || "-"}</span>
              <strong>{patrol.route || "Маршрут не указан"}</strong>
              <span>{formatShortName(patrol.employee || "-")} · {formatActiveStatus(patrol.status)}</span>
            </button>
          ))}
        </>
      )}
      <button className="dashboard-am-card-link" onClick={() => onNavigate("schedule")} type="button">
        Перейти к календарю
      </button>
    </ListPanel>
  );
}

function IncidentsList({ incidents, onNavigate, onSelectResult }: { incidents: PatrolResult[]; onNavigate: (screen: ScreenId) => void; onSelectResult: (id: string) => void }) {
  return (
    <ListPanel action="Смотреть все" onAction={() => onNavigate("results")} title="Замечания и инциденты">
    {incidents.length === 0 ? (
      <CompactEmptyState title="Замечаний нет" text="Журнал заполнится после результатов обходов с проблемами." />
    ) : (
      [...incidents]
        .sort((left, right) => getResultTimestamp(right) - getResultTimestamp(left))
        .slice(0, 4)
        .map((incident) => (
          <button
            aria-label={`Открыть замечание: ${incident.route || "Маршрут не указан"}, ${incident.point || "точка не указана"}`}
            className="dashboard-am-list-row incident"
            key={incident.id}
            onClick={() => {
              onSelectResult(incident.id);
              onNavigate("results");
            }}
            type="button"
          >
            <span className="dashboard-am-alert-icon">
              <DashboardIcon name="alert" />
            </span>
            <span className="dashboard-am-incident-copy">
              <strong>{incident.route || "Маршрут не указан"}</strong>
              <span>{incident.point || incident.comment || "Есть замечание"}</span>
            </span>
            <time>{formatResultTime(incident)}</time>
          </button>
        ))
    )}
    <button className="dashboard-am-card-link" onClick={() => onNavigate("results")} type="button">
      Открыть журнал
    </button>
  </ListPanel>
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
    </svg>
  );
}

function getMetricValue(metrics: Metric[], labels: string[]) {
  const metric = metrics.find((item) => labels.some((label) => item.label.includes(label)));
  return metric?.value ?? "0";
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
  return !isTerminalPatrolRequestStatus(request.status);
}

function isTodayOrFutureRequest(request: ServiceRequest) {
  const timestamp = requestTimestamp(request);
  if (!Number.isFinite(timestamp)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return timestamp >= today.getTime();
}

function requestTimestamp(request: ServiceRequest) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.scheduledDate)) return Number.NaN;
  return new Date(`${request.scheduledDate}T${request.scheduledTime || "00:00"}:00`).getTime();
}

function isArchivedRoute(status: string) {
  return matchesAny(status, ["Архив", "archive"]);
}

function isDisplayedAssignment(patrol: ActivePatrol) {
  return !matchesAny(patrol.status, ["Завершено", "Отменено", "completed", "cancelled"]);
}

function formatActiveStatus(status: ActivePatrol["status"]) {
  if (matchesAny(status, ["Задержка", "Нет связи", "delay", "offline"])) return "требует внимания";
  if (matchesAny(status, ["В пути", "Завершает", "started"])) return "в работе";
  return "назначен";
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
