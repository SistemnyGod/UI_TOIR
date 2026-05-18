import { ActivePatrolDetail } from "../components/dashboard/ActivePatrolDetail";
import { ActivePatrolsPanel } from "../components/dashboard/ActivePatrolsPanel";
import { DashboardCommandPanel } from "../components/dashboard/DashboardCommandPanel";
import { DashboardEmptyPanel } from "../components/dashboard/DashboardEmptyPanel";
import { DashboardMetricsBar } from "../components/dashboard/DashboardMetricsBar";
import { DashboardProblemPointsPanel } from "../components/dashboard/DashboardProblemPointsPanel";
import type { DashboardReadinessItem } from "../components/dashboard/DashboardReadinessPanel";
import { DashboardRequestsPanel } from "../components/dashboard/DashboardRequestsPanel";
import { DashboardTodayRoutesPanel } from "../components/dashboard/DashboardTodayRoutesPanel";
import { useSelectedPatrol } from "../hooks/useSelectedPatrol";
import { activePatrolsFallback } from "../repositories/activePatrolsRepository";
import { dashboardMetricsFallback } from "../repositories/dashboardRepository";
import { employeesFallback } from "../repositories/employeesRepository";
import { patrolResultsFallback } from "../repositories/resultsRepository";
import { routesFallback } from "../repositories/routesRepository";
import { scheduleCellsFallback } from "../repositories/scheduleRepository";
import type { ActivePatrol, Metric, RouteDirectoryItem, ScreenId, ServiceRequest } from "../types";

const emptyDashboardMetrics: Metric[] = [
  { label: "Завершенные обходы сегодня", value: "0", delta: "нет загруженных данных", tone: "green", icon: "ok" },
  { label: "Активные обходы сейчас", value: "0", delta: "нет загруженных данных", tone: "blue", icon: "run" },
  { label: "Выявленные замечания", value: "0", delta: "нет загруженных данных", tone: "orange", icon: "!" },
  { label: "Маршрутов на сегодня", value: "0", delta: "нет загруженных данных", tone: "violet", icon: "map" },
];

export function DashboardScreen({
  activePatrols = activePatrolsFallback,
  dashboardMetrics = dashboardMetricsFallback,
  onCreateRequest,
  onNavigate,
  onNotify,
  onOpenRequestById,
  onOpenRequest,
  routeDirectory = routesFallback,
  requests,
}: {
  activePatrols?: ActivePatrol[];
  dashboardMetrics?: Metric[];
  onCreateRequest: (sourceResultId?: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onOpenRequest: (resultId?: string) => void;
  routeDirectory?: RouteDirectoryItem[];
  requests: ServiceRequest[];
}) {
  const { selectedPatrol, selectedPatrolId, setSelectedPatrolId } = useSelectedPatrol(activePatrols);
  const metrics = dashboardMetrics.length > 0 ? dashboardMetrics : emptyDashboardMetrics;
  const dataReadiness = getDashboardReadiness(routeDirectory);

  return (
    <div className="screen-stack dashboard-screen">
      <DashboardMetricsBar metrics={metrics} />
      <DashboardCommandPanel
        readinessItems={dataReadiness}
        onCreateRequest={() => onCreateRequest()}
        onNavigate={onNavigate}
      />

      <div className="dashboard-grid dashboard-grid-clean">
        <div className="dashboard-main-column">
          <ActivePatrolsPanel
            activePatrols={activePatrols}
            selectedPatrolId={selectedPatrolId}
            onAssign={() => onNavigate("assign")}
            onSelectPatrol={setSelectedPatrolId}
          />

          <div className="dashboard-lower-grid">
            <DashboardProblemPointsPanel activePatrols={activePatrols} onNavigate={onNavigate} />
            <DashboardEmptyPanel
              title="Последние инциденты"
              note="Оперативные события текущей смены"
              actionLabel="Все (0)"
              target="results"
              emptyTitle="Инцидентов нет"
              description="События смены появятся после подключения данных."
              onNavigate={onNavigate}
            />
          </div>

          <div className="dashboard-lower-grid">
            <DashboardTodayRoutesPanel
              activePatrols={activePatrols}
              onNavigate={onNavigate}
              onSelectPatrol={setSelectedPatrolId}
            />
            <DashboardEmptyPanel
              title="Последние результаты"
              note="Факты прохождения точек"
              actionLabel="Смотреть все"
              target="results"
              emptyTitle="Результатов пока нет"
              description="Факты прохождения точек появятся после первого обхода."
              onNavigate={onNavigate}
            />
            <DashboardRequestsPanel
              requests={requests}
              onCreateRequest={() => onCreateRequest()}
              onOpenRequestById={onOpenRequestById}
            />
          </div>
        </div>

        <aside className="side-drawer dashboard-detail-drawer">
          <ActivePatrolDetail
            patrol={selectedPatrol}
            onCreateRequest={() => onCreateRequest()}
            onNavigate={onNavigate}
            onNotify={onNotify}
            onOpenRequest={() => onOpenRequest()}
          />
        </aside>
      </div>
    </div>
  );
}

function getDashboardReadiness(routeDirectory: RouteDirectoryItem[]): DashboardReadinessItem[] {
  return [
    { label: "Сотрудники", count: employeesFallback.length, action: "Открыть справочник", screen: "employees" },
    { label: "Маршруты", count: routeDirectory.length, action: "Настроить маршруты", screen: "routes" },
    { label: "План смены", count: scheduleCellsFallback.length, action: "Открыть планирование", screen: "schedule" },
    { label: "Результаты", count: patrolResultsFallback.length, action: "Открыть журнал", screen: "results" },
  ];
}
