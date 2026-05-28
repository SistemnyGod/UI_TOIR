import { scheduleCells, weekDays } from "../data";
import { ApiClient, type ApiRequestOptions } from "../api/client";
import type { EmployeeDto, RouteDto } from "../api/contracts";

export const scheduleCellsFallback = scheduleCells;
export const weekDaysFallback = weekDays;

export interface ScheduleReferenceEmployee {
  id: string;
  fullName: string;
  department: string;
  shift: string;
  status: string;
}

export interface ScheduleReferenceRoute {
  id: string;
  name: string;
  territory: string;
  duration: string;
}

export interface ScheduleReferenceData {
  employees: ScheduleReferenceEmployee[];
  routes: ScheduleReferenceRoute[];
}

export function createApiScheduleRepository({
  baseUrl,
  fetcher,
}: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}) {
  const client = new ApiClient({ baseUrl, fetcher });

  return {
    async getReferences(options: ApiRequestOptions = {}): Promise<ScheduleReferenceData> {
      const [employees, routes] = await Promise.all([
        client.get<EmployeeDto[]>("/api/v1/employees", options),
        client.get<RouteDto[]>("/api/v1/routes", options),
      ]);

      return {
        employees: employees.map((employee) => ({
          id: employee.id,
          fullName: employee.fullName,
          department: employee.department || "Без участка",
          shift: employee.shift || "День",
          status: employee.status || "Активен",
        })),
        routes: routes.map((route) => ({
          id: route.id,
          name: route.name,
          territory: route.territory || "Без территории",
          duration: route.duration || "-",
        })),
      };
    },
  };
}
