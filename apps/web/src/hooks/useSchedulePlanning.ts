import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createApiScheduleRepository,
  type ScheduleReferenceEmployee,
  type ScheduleReferenceRoute,
} from "../repositories/scheduleRepository";
import type {
  ActivePatrol,
  DataSourceStatus,
  EmployeeDirectoryItem,
  RouteDirectoryItem,
  ScheduleCell,
  ScheduleMode,
  ServiceRequest,
} from "../types";

interface UseSchedulePlanningOptions {
  activePatrols: ActivePatrol[];
  anchorDate: string;
  employeeDirectory: EmployeeDirectoryItem[];
  mode: ScheduleMode;
  requests: ServiceRequest[];
  routeDirectory: RouteDirectoryItem[];
  selectedCellId: string;
  shiftFilter: "all" | "day" | "night";
}

function isPlannedCell(cell: ScheduleCell) {
  return cell.state === "planned" || cell.state === "alternate";
}

function isExceptionCell(cell: ScheduleCell) {
  return cell.state === "transfer" || cell.state === "vacation" || cell.state === "sick";
}

export function useSchedulePlanning({
  activePatrols,
  anchorDate,
  employeeDirectory,
  mode,
  requests,
  routeDirectory,
  selectedCellId,
  shiftFilter,
}: UseSchedulePlanningOptions) {
  const apiSchedule = useMemo(() => createApiScheduleRepository(), []);
  const [apiEmployees, setApiEmployees] = useState<ScheduleReferenceEmployee[]>([]);
  const [apiRoutes, setApiRoutes] = useState<ScheduleReferenceRoute[]>([]);
  const [status, setStatus] = useState<DataSourceStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const refreshScheduleReferences = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      setStatus("loading");
      setErrorMessage(undefined);

      try {
        const references = await apiSchedule.getReferences({ signal });
        if (signal?.aborted) return;

        setApiEmployees(references.employees);
        setApiRoutes(references.routes);
        setStatus("ready");
      } catch (error) {
        if (signal?.aborted) return;

        setApiEmployees([]);
        setApiRoutes([]);
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить сотрудников и маршруты для расписания");
      }
    },
    [apiSchedule],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshScheduleReferences({ signal: controller.signal });

    return () => controller.abort();
  }, [refreshScheduleReferences]);

  return useMemo(() => {
    const employees = employeeDirectory.length > 0
      ? employeeDirectory.map(mapDirectoryEmployee)
      : apiEmployees;
    const routes = routeDirectory.length > 0
      ? routeDirectory.map(mapDirectoryRoute)
      : apiRoutes;
    const periodDays = buildPeriodDays(parseDateInput(anchorDate), mode);
    const scheduleCells = buildScheduleCells({
      activePatrols,
      employees,
      periodDays,
      requests,
      routes,
      shiftFilter,
    });
    const selected = scheduleCells.find((cell) => cell.id === selectedCellId);
    const plannedCount = scheduleCells.filter(isPlannedCell).length;
    const exceptionCount = scheduleCells.filter(isExceptionCell).length;
    const dayCount = scheduleCells.filter((cell) => isPlannedCell(cell) && cell.shift === "Дневная").length;
    const nightCount = scheduleCells.filter((cell) => isPlannedCell(cell) && cell.shift === "Ночная").length;
    const rowKeys = new Set(scheduleCells.filter((cell) => cell.state !== "empty").map((cell) => `${cell.employeeId}:${cell.shift}`));
    const coverageBase = Math.max(periodDays.length * Math.max(rowKeys.size, 1), 1);
    const coveragePercent = Math.round((plannedCount / coverageBase) * 100);

    return {
      coveragePercent,
      dayCount,
      errorMessage,
      exceptionCount,
      nightCount,
      plannedCount,
      refreshScheduleReferences,
      scheduleCells,
      selected,
      status,
      weekDays: periodDays.map((day) => day.label),
    };
  }, [
    activePatrols,
    anchorDate,
    apiEmployees,
    apiRoutes,
    employeeDirectory,
    errorMessage,
    mode,
    refreshScheduleReferences,
    requests,
    routeDirectory,
    selectedCellId,
    shiftFilter,
    status,
  ]);
}

function mapDirectoryEmployee(employee: EmployeeDirectoryItem): ScheduleReferenceEmployee {
  return {
    id: employee.id,
    fullName: employee.fullName,
    department: employee.department || employee.zone || "Без участка",
    shift: employee.shift || "День",
    status: employee.status,
  };
}

function mapDirectoryRoute(route: RouteDirectoryItem): ScheduleReferenceRoute {
  return {
    id: route.id,
    name: route.name,
    territory: route.territory || "Без территории",
    duration: route.duration || "-",
  };
}

function buildScheduleCells({
  activePatrols,
  employees,
  periodDays,
  requests,
  routes,
  shiftFilter,
}: {
  activePatrols: ActivePatrol[];
  employees: ScheduleReferenceEmployee[];
  periodDays: Array<{ key: string; label: string }>;
  requests: ServiceRequest[];
  routes: ScheduleReferenceRoute[];
  shiftFilter: "all" | "day" | "night";
}) {
  const cells = new Map<string, ScheduleCell>();
  const visibleEmployees = employees.filter((employee) => {
    const shift = toScheduleShift(employee.shift);
    if (isUnavailable(employee.status)) return false;
    if (shiftFilter === "day") return shift === "Дневная";
    if (shiftFilter === "night") return shift === "Ночная";
    return true;
  });

  for (const employee of visibleEmployees) {
    const shift = toScheduleShift(employee.shift);
    for (const day of periodDays) {
      const cell = createCell({
        date: day.key,
        day: day.label,
        employee,
        id: `empty:${employee.id}:${shift}:${day.key}`,
        route: undefined,
        shift,
        state: "empty",
      });
      cells.set(cell.id, cell);
    }
  }

  for (const request of requests) {
    const employee = findEmployeeById(employees, request.employeeId ?? "") ?? findEmployee(employees, request.employee || request.responsible);
    const route = findRouteById(routes, request.routeId ?? "") ?? findRoute(routes, request.route);
    const day = request.scheduledDate ? findPeriodDay(periodDays, request.scheduledDate) : undefined;

    if (!employee || !route || !day) continue;

    const shift = toScheduleShift(employee.shift);
    if (shiftFilter === "day" && shift !== "Дневная") continue;
    if (shiftFilter === "night" && shift !== "Ночная") continue;

    const cell = createCell({
      date: day.key,
      day: day.label,
      employee,
      id: `request:${request.id}`,
      requestId: request.id,
      route,
      shift,
      state: request.status === "Закрыта" ? "alternate" : "planned",
      scheduledTime: request.scheduledTime,
      notificationText: request.notificationText,
      notifyEmployee: request.notifyEmployee,
    });
    cells.delete(`empty:${employee.id}:${shift}:${day.key}`);
    cells.set(cell.id, cell);
  }

  for (const patrol of activePatrols) {
    const employee = findEmployeeById(employees, patrol.employeeId) ?? findEmployee(employees, patrol.employee);
    const route = findRoute(routes, patrol.route);
    const day = findPeriodDay(periodDays, toDateInput(new Date())) ?? periodDays[0];

    if (!employee || !route || !day) continue;

    const shift = toScheduleShift(patrol.shift || employee.shift);
    if (shiftFilter === "day" && shift !== "Дневная") continue;
    if (shiftFilter === "night" && shift !== "Ночная") continue;

    const cell = createCell({
      assignmentId: patrol.id,
      date: day.key,
      day: day.label,
      employee,
      id: `assignment:${patrol.id}`,
      route,
      shift,
      state: "planned",
      scheduledTime: patrol.startedAt,
    });
    cells.delete(`empty:${employee.id}:${shift}:${day.key}`);
    cells.set(cell.id, cell);
  }

  return Array.from(cells.values());
}

function createCell({
  assignmentId,
  date,
  day,
  employee,
  id,
  notifyEmployee,
  notificationText,
  requestId,
  route,
  scheduledTime,
  shift,
  state,
}: {
  assignmentId?: string;
  date: string;
  day: string;
  employee: ScheduleReferenceEmployee;
  id: string;
  notifyEmployee?: boolean;
  notificationText?: string;
  requestId?: string;
  route?: ScheduleReferenceRoute;
  scheduledTime?: string;
  shift: ScheduleCell["shift"];
  state: ScheduleCell["state"];
}): ScheduleCell {
  return {
    assignmentId,
    date,
    day,
    employee: employee.fullName,
    employeeId: employee.id,
    id,
    notifyEmployee,
    notificationText,
    requestId,
    route: route?.name ?? "",
    routeId: route?.id,
    scheduledTime,
    shift,
    state,
    zone: route?.territory ?? employee.department,
  };
}

function parseDateInput(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildPeriodDays(anchor: Date, mode: ScheduleMode) {
  if (mode === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const length = end.getDate();
    return Array.from({ length }, (_, index) => {
      const date = new Date(start);
      date.setDate(index + 1);

      return {
        key: toDateInput(date),
        label: formatMonthDay(date),
      };
    });
  }

  const start = new Date(anchor);
  const dayOfWeek = start.getDay() === 0 ? 7 : start.getDay();
  start.setDate(start.getDate() - dayOfWeek + 1);
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      key: toDateInput(date),
      label: formatWeekDay(date),
    };
  });
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekDay(date: Date) {
  const dayName = new Intl.DateTimeFormat("ru-RU", { weekday: "short" })
    .format(date)
    .replace(".", "");
  const day = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);

  return `${capitalize(dayName)} ${day}`;
}

function formatMonthDay(date: Date) {
  const day = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "");
  return `${day} ${capitalize(weekday)}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function findPeriodDay(periodDays: Array<{ key: string; label: string }>, dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;

  const key = toDateInput(date);
  return periodDays.find((day) => day.key === key);
}

function findEmployee(employees: ScheduleReferenceEmployee[], name: string) {
  const normalized = normalize(name);
  if (!normalized) return undefined;
  return employees.find((employee) => normalize(employee.fullName) === normalized || normalize(employee.fullName).includes(normalized));
}

function findEmployeeById(employees: ScheduleReferenceEmployee[], id: string) {
  return employees.find((employee) => employee.id === id);
}

function findRouteById(routes: ScheduleReferenceRoute[], id: string) {
  return routes.find((route) => route.id === id);
}

function findRoute(routes: ScheduleReferenceRoute[], name: string) {
  const normalized = normalize(name);
  if (!normalized) return undefined;
  return routes.find((route) => normalize(route.name) === normalized || normalize(route.name).includes(normalized) || normalized.includes(normalize(route.name)));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isUnavailable(status: string) {
  return status.includes("Офлайн") || status.includes("Отпуск");
}

function toScheduleShift(value: string): ScheduleCell["shift"] {
  return value.includes("Ноч") || value.includes("Ночь") ? "Ночная" : "Дневная";
}
