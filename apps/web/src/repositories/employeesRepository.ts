import { employeeDirectory } from "../data";
import { ApiClient } from "../api/client";
import type { CreateEmployeeDto, EmployeeDto, UpdateEmployeeDto } from "../api/contracts";
import type { EmployeeDirectoryItem, EmployeeFormPayload } from "../types";
import { mapEmployee } from "./patrolDataRepository";

export const employeesStorageKey = "patrol360.employees.v1";
export const employeesFallback = employeeDirectory;
export const isEmployeeDirectoryList = (value: unknown): value is EmployeeDirectoryItem[] => Array.isArray(value);

export interface EmployeeMetrics {
  total: number;
  active: number;
  onShift: number;
  mobileBound: number;
}

export function getEmployeeMetrics(employees: EmployeeDirectoryItem[]): EmployeeMetrics {
  return {
    total: employees.length,
    active: employees.filter((item) => item.status === "Активен" || item.status === "На смене").length,
    onShift: employees.filter((item) => item.status === "На смене").length,
    mobileBound: employees.filter((item) => item.mobileStatus === "Привязан").length,
  };
}

export function findEmployee(employees: EmployeeDirectoryItem[], employeeId: string) {
  return employees.find((item) => item.id === employeeId);
}

export function getEmployeeRouteProgress(employee?: EmployeeDirectoryItem) {
  if (!employee) return 0;
  return Math.round((employee.routesDone / Math.max(1, employee.routesTotal)) * 100);
}

export function createLocalEmployee(employees: EmployeeDirectoryItem[], payload: EmployeeFormPayload) {
  const employee = toEmployeeDirectoryItem(`local-employee-${Date.now()}`, payload);

  return {
    employee,
    employees: [employee, ...employees],
  };
}

export function updateLocalEmployee(
  employees: EmployeeDirectoryItem[],
  employeeId: string,
  payload: EmployeeFormPayload,
) {
  return employees.map((employee) =>
    employee.id === employeeId
      ? {
          ...employee,
          ...toEmployeeDirectoryItem(employee.id, payload),
          routesDone: employee.routesDone,
          routesTotal: employee.routesTotal,
          lastSeen: employee.lastSeen,
        }
      : employee,
  );
}

export function deleteLocalEmployee(employees: EmployeeDirectoryItem[], employeeId: string) {
  return employees.map((employee) =>
    employee.id === employeeId
      ? {
          ...employee,
          status: "Офлайн" as EmployeeDirectoryItem["status"],
          mobileStatus: "Не привязан" as EmployeeDirectoryItem["mobileStatus"],
        }
      : employee,
  );
}

export function createApiEmployeesRepository({ baseUrl = "" }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    async createEmployee(payload: EmployeeFormPayload) {
      const employee = await client.post<EmployeeDto, CreateEmployeeDto>("/api/v1/employees", mapEmployeePayload(payload));
      return mapEmployee(employee);
    },

    async updateEmployee(employeeId: string, payload: EmployeeFormPayload) {
      const employee = await client.put<EmployeeDto, UpdateEmployeeDto>(
        `/api/v1/employees/${employeeId}`,
        mapEmployeePayload(payload),
      );
      return mapEmployee(employee);
    },

    async deleteEmployee(employeeId: string) {
      await client.delete(`/api/v1/employees/${employeeId}`);
    },
  };
}

function mapEmployeePayload(payload: EmployeeFormPayload): CreateEmployeeDto {
  return {
    fullName: payload.fullName,
    personnelNo: payload.personnelNo,
    position: payload.position,
    department: payload.department,
    status: payload.status,
    shift: payload.shift,
    hasMobileAccount: payload.hasMobileAccount,
  };
}

function toEmployeeDirectoryItem(id: string, payload: EmployeeFormPayload): EmployeeDirectoryItem {
  const initials = payload.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return {
    id,
    fullName: payload.fullName,
    initials,
    personnelNo: payload.personnelNo,
    position: payload.position,
    department: payload.department,
    zone: payload.department,
    status: payload.status,
    routesDone: 0,
    routesTotal: 0,
    mobileStatus: (payload.hasMobileAccount ? "Привязан" : "Не привязан") as EmployeeDirectoryItem["mobileStatus"],
    lastSeen: new Date().toLocaleString("ru-RU"),
    phone: "",
    hiredAt: "",
    brigade: "",
    shift: payload.shift,
    leader: "",
    email: "",
  };
}
