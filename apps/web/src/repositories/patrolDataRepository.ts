import { activePatrols, dashboardMetrics, routeDirectory } from "../data";
import { ApiClient } from "../api/client";
import type { AssignmentDto, DashboardSummaryDto, EmployeeDto, RouteDto } from "../api/contracts";
import type { ActivePatrol, EmployeeDirectoryItem, Metric, RouteDirectoryItem, RoutePoint } from "../types";

export interface PatrolDataSnapshot {
  activePatrols: ActivePatrol[];
  dashboardMetrics: Metric[];
  employees: EmployeeDirectoryItem[];
  routeDirectory: RouteDirectoryItem[];
}

export interface PatrolDataRepository {
  getSnapshot: () => Promise<PatrolDataSnapshot>;
}

const mockSnapshot: PatrolDataSnapshot = {
  activePatrols,
  dashboardMetrics,
  employees: [],
  routeDirectory,
};

export function createMockPatrolDataRepository(): PatrolDataRepository {
  return {
    async getSnapshot() {
      return mockSnapshot;
    },
  };
}

export function createApiPatrolDataRepository({
  baseUrl,
  fetcher,
}: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}): PatrolDataRepository {
  const client = new ApiClient({ baseUrl, fetcher });

  return {
    async getSnapshot() {
      const [summary, assignments, routes, employees] = await Promise.all([
        client.get<DashboardSummaryDto>("/api/v1/dashboards/summary"),
        client.get<AssignmentDto[]>("/api/v1/dashboards/active-patrols"),
        client.get<RouteDto[]>("/api/v1/routes"),
        client.get<EmployeeDto[]>("/api/v1/employees"),
      ]);

      return {
        activePatrols: assignments.map(mapAssignment),
        dashboardMetrics: mapDashboardMetrics(summary, routes.length),
        employees: employees.map(mapEmployee),
        routeDirectory: routes.map(mapRoute),
      };
    },
  };
}

export function emptyPatrolDataSnapshot(): PatrolDataSnapshot {
  return {
    activePatrols: [],
    dashboardMetrics: [],
    employees: [],
    routeDirectory: [],
  };
}

function mapDashboardMetrics(summary: DashboardSummaryDto, routeCount: number): Metric[] {
  return [
    {
      label: "Активные обходы сейчас",
      value: String(summary.activePatrols),
      delta: "из API",
      tone: "blue",
      icon: "run",
    },
    {
      label: "Просроченные обходы",
      value: String(summary.delayedPatrols),
      delta: "требуют внимания",
      tone: "red",
      icon: "!",
    },
    {
      label: "Выявленные замечания",
      value: String(summary.issues),
      delta: "по активной смене",
      tone: "orange",
      icon: "!",
    },
    {
      label: "Маршрутов в справочнике",
      value: String(routeCount),
      delta: `${summary.shiftCoveragePercent}% покрытия смен`,
      tone: "violet",
      icon: "map",
    },
  ];
}

function mapAssignment(assignment: AssignmentDto): ActivePatrol {
  return {
    id: assignment.id,
    employee: assignment.employeeName,
    employeeId: "из API",
    route: assignment.routeName,
    zone: "территория из API",
    shift: (assignment.shift === "Ночь" ? "Ночь" : "День") as ActivePatrol["shift"],
    currentPoint: "ожидает детализации",
    status: mapAssignmentStatus(assignment.status),
    progress: assignment.progressPercent,
    eta: assignment.eta,
    deviation: "—",
  };
}

function mapAssignmentStatus(status: string): ActivePatrol["status"] {
  if (status === "В пути") return "В пути" as ActivePatrol["status"];
  if (status === "Задержка") return "Задержка" as ActivePatrol["status"];
  if (status === "Нет связи") return "Нет связи" as ActivePatrol["status"];
  if (status === "Завершает") return "Завершает" as ActivePatrol["status"];
  if (status === "Ожидает") return "Ожидает" as ActivePatrol["status"];
  if (status === "Запланирован") return "Запланирован" as ActivePatrol["status"];

  return "Ожидает" as ActivePatrol["status"];
}

export function mapRoute(route: RouteDto): RouteDirectoryItem {
  return {
    id: route.id,
    name: route.name,
    territory: route.territory,
    status: route.status as RouteDirectoryItem["status"],
    description: route.description,
    duration: route.duration,
    distance: route.distance,
    periodicity: route.periodicity || `Версия ${route.versionNo}`,
    points: route.points.map((point) => ({
      id: point.id,
      order: point.sequenceNo,
      name: point.name,
      zone: point.zone,
      type: point.type as RoutePoint["type"],
      tag: point.tag || point.nfcCode || "—",
      interval: point.interval,
      expectedTime: point.expectedTime,
      status: point.status as RoutePoint["status"],
      requiresPhoto: point.requiresPhoto,
    })),
  };
}

export function mapEmployee(employee: EmployeeDto): EmployeeDirectoryItem {
  return {
    id: employee.id,
    fullName: employee.fullName,
    initials: employee.fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join(""),
    personnelNo: employee.personnelNo,
    position: employee.position,
    department: employee.department,
    zone: employee.department,
    status: employee.status as EmployeeDirectoryItem["status"],
    routesDone: 0,
    routesTotal: 0,
    mobileStatus: (employee.hasMobileAccount ? "Привязан" : "Не привязан") as EmployeeDirectoryItem["mobileStatus"],
    lastSeen: new Date(employee.lastSeenAt).toLocaleString("ru-RU"),
    phone: "",
    hiredAt: "",
    brigade: "",
    shift: employee.shift,
    leader: "",
    email: "",
  };
}
