import { activePatrols, dashboardMetrics, routeDirectory } from "../data";
import { ApiClient } from "../api/client";
import type { AssignmentDto, DashboardSummaryDto, EmployeeDto, RouteDto } from "../api/contracts";
import type { ActivePatrol, EmployeeDirectoryItem, Metric, RouteDirectoryItem, RoutePoint } from "../types";
import { mapAssignment as mapApiAssignment } from "./assignmentsRepository";

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
        client.get<RouteDto[]>("/api/v1/routes?includeArchived=true"),
        client.get<EmployeeDto[]>("/api/v1/employees"),
      ]);

      return {
        activePatrols: assignments.map(mapApiAssignment),
        dashboardMetrics: mapDashboardMetrics(summary, routes.filter((route) => route.status !== "Архив").length),
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
      label: "Завершено обходов сегодня",
      value: String(summary.completedToday ?? 0),
      delta: "по результатам обходов",
      tone: "green",
      icon: "check",
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

export function mapRoute(route: RouteDto): RouteDirectoryItem {
  return {
    id: route.id,
    versionNo: route.versionNo,
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
      tag: point.tag || point.nfcCode || "-",
      description: point.description || "",
      instruction: point.instruction || "",
      interval: point.interval,
      expectedTime: point.expectedTime,
      status: point.status as RoutePoint["status"],
      nfcCode: point.nfcCode ?? undefined,
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
    employeeGroup: employee.employeeGroup ?? "",
    birthDate: employee.birthDate ?? "",
    zone: employee.department,
    status: employee.status as EmployeeDirectoryItem["status"],
    routesDone: 0,
    routesTotal: 0,
    mobileStatus: (employee.hasMobileAccount ? "Привязан" : "Не привязан") as EmployeeDirectoryItem["mobileStatus"],
    lastSeen: new Date(employee.lastSeenAt).toLocaleString("ru-RU"),
    phone: "",
    hiredAt: employee.hiredAt ?? "",
    brigade: "",
    shift: employee.shift,
    leader: "",
    email: "",
  };
}
