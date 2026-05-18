import type { CreateMobileAccountPayload, MobileAccount } from "../types";

const DEFAULT_ROLE = "Маршрутный обходчик";
const UNBOUND_EMPLOYEE = "Не привязан";
const ALL_EMPLOYEES = "Все сотрудники";
export const PASSWORD_STATE_REQUIRES_CHANGE = "Требует смены пароля";
export const PASSWORD_STATE_SET_ON_FIRST_LOGIN = "Задается при первом входе";

export interface MobileAccountDraftResult {
  account: MobileAccount;
  temporaryPassword?: string;
}

export function isMobileAccountList(value: unknown): value is MobileAccount[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as MobileAccount).id === "string" &&
        typeof (item as MobileAccount).login === "string" &&
        typeof (item as MobileAccount).employee === "string" &&
        typeof (item as MobileAccount).passwordState === "string" &&
        ((item as MobileAccount).employeeScope === "selected" || (item as MobileAccount).employeeScope === "all") &&
        (!("boundEmployeeIds" in item) || Array.isArray((item as MobileAccount).boundEmployeeIds)) &&
        Array.isArray((item as MobileAccount).boundEmployees) &&
        typeof (item as MobileAccount).status === "string",
    )
  );
}

export function createMobileAccountDraft({
  payload,
  existingCount,
  existingLogins,
}: {
  payload: CreateMobileAccountPayload;
  existingCount: number;
  existingLogins: Set<string>;
}): MobileAccountDraftResult {
  const employee = payload.employee.trim();
  const employeeScope = payload.employeeScope;
  const boundEmployees = employeeScope === "all" ? [] : normalizeEmployeeList(employee);
  const bindEmployee = employeeScope === "all" || (payload.bindEmployee && boundEmployees.length > 0);
  const loginBase = normalizeLogin(payload.login || employee || `mobile-${existingCount + 1}`);
  const login = makeUniqueLogin(loginBase, existingLogins);
  const temporaryPassword = payload.temporaryPassword ? createTemporaryPassword() : undefined;

  return {
    account: {
      id: `mobile-${Date.now()}-${existingCount + 1}`,
      login,
      passwordState: temporaryPassword ? PASSWORD_STATE_REQUIRES_CHANGE : PASSWORD_STATE_SET_ON_FIRST_LOGIN,
      employee: bindEmployee ? formatEmployeeAccess(employeeScope, boundEmployees) : UNBOUND_EMPLOYEE,
      employeeScope,
      boundEmployeeIds: [],
      boundEmployees,
      role: payload.role.trim() || DEFAULT_ROLE,
      status: bindEmployee ? "Активен" : "Не привязан",
      session: "-",
      lastSeen: "Не входил",
      device: payload.restrictToBoundDevice ? "Ожидает привязки" : "Любое устройство",
      version: "-",
    },
    temporaryPassword,
  };
}

export function bindMobileAccountToEmployee(
  accounts: MobileAccount[],
  accountId: string,
  employeeName: string,
): MobileAccount[] {
  const normalizedEmployeeName = employeeName.trim();
  if (!normalizedEmployeeName) return accounts;

  return accounts.map((account) => {
    if (account.id !== accountId) return account;

    const nextEmployees = addEmployee(account.boundEmployees ?? [], normalizedEmployeeName);

    return {
      ...account,
      boundEmployeeIds: account.boundEmployeeIds ?? [],
      boundEmployees: nextEmployees,
      employee: formatEmployeeAccess("selected", nextEmployees),
      employeeScope: "selected",
      status: account.status === "Заблокирован" ? account.status : ("Активен" as const),
    };
  });
}

export function resetMobileAccountPassword(accounts: MobileAccount[], accountId: string) {
  const temporaryPassword = createTemporaryPassword();

  return {
    accounts: accounts.map((account) =>
      account.id === accountId ? { ...account, passwordState: PASSWORD_STATE_REQUIRES_CHANGE } : account,
    ),
    temporaryPassword,
  };
}

export function getMobileAccountAccessLabel(account: MobileAccount) {
  return formatEmployeeAccess(account.employeeScope, account.boundEmployees ?? []);
}

export function getMobileAccountBindingCount(account: MobileAccount) {
  return account.employeeScope === "all" ? ALL_EMPLOYEES : `${(account.boundEmployees ?? []).length} привязано`;
}

function normalizeLogin(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(" ", ".")
    .replace(/[^a-z0-9._-]/g, "");

  return normalized || "mobile";
}

function normalizeEmployeeList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function addEmployee(currentEmployees: string[], employeeName: string) {
  return currentEmployees.includes(employeeName) ? currentEmployees : [...currentEmployees, employeeName];
}

function formatEmployeeAccess(scope: MobileAccount["employeeScope"], employees: string[]) {
  if (scope === "all") return ALL_EMPLOYEES;
  if (employees.length === 0) return UNBOUND_EMPLOYEE;
  if (employees.length === 1) return employees[0];
  return `${employees[0]} +${employees.length - 1}`;
}

function makeUniqueLogin(baseLogin: string, existingLogins: Set<string>) {
  if (!existingLogins.has(baseLogin)) return baseLogin;

  let index = 2;
  let candidate = `${baseLogin}${index}`;
  while (existingLogins.has(candidate)) {
    index += 1;
    candidate = `${baseLogin}${index}`;
  }

  return candidate;
}

function createTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
