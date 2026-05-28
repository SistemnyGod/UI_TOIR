import { initialAccounts, securityEvents } from "../data";
import { ApiClient, type ApiRequestOptions } from "../api/client";
import type {
  AvailableEmployeeDto,
  AttachMobileAccountEmployeeDto,
  BindMobileAccountEmployeesDto,
  CreateMobileAccountDto,
  MobileAccountCreatedDto,
  MobileAccountDto,
  MobileAccountSecurityEventDto,
  MobileAccountSessionDto,
  ResetMobileAccountPasswordDto,
  UpdateMobileAccountDto,
} from "../api/contracts";
import {
  bindMobileAccountToEmployee,
  createMobileAccountDraft,
  isMobileAccountList,
  resetMobileAccountPassword,
} from "../domain/mobileAccounts";
import type {
  CreateMobileAccountPayload,
  EmployeeDirectoryItem,
  MobileAccount,
  MobileAccountSecurityEvent,
  MobileAccountSession,
  UpdateMobileAccountPayload,
} from "../types";

export interface MobileAccountCreateResult {
  account: MobileAccount;
  temporaryPassword?: string;
}

export const mobileAccountsStorageKey = "patrol360.mobileAccounts.v2";
export const mobileAccountsFallback = initialAccounts;
export const securityEventsFallback = securityEvents;
export { isMobileAccountList };

export function createLocalMobileAccount(accounts: MobileAccount[], payload: CreateMobileAccountPayload) {
  const result = createMobileAccountDraft({
    payload,
    existingCount: accounts.length,
    existingLogins: new Set(accounts.map((item) => item.login)),
  });

  return {
    account: result.account,
    accounts: [result.account, ...accounts],
    temporaryPassword: result.temporaryPassword,
  };
}

export function attachEmployeeToMobileAccount(
  accounts: MobileAccount[],
  accountId: string,
  employeeName: string,
  employeeId?: string,
) {
  const nextAccounts = bindMobileAccountToEmployee(accounts, accountId, employeeName);
  return nextAccounts.map((account) => {
    if (account.id !== accountId || !employeeId) return account;
    const nextIds = account.boundEmployeeIds?.includes(employeeId)
      ? account.boundEmployeeIds
      : [...(account.boundEmployeeIds ?? []), employeeId];
    return { ...account, boundEmployeeIds: nextIds };
  });
}

export function updateMobileAccountLocal(
  accounts: MobileAccount[],
  accountId: string,
  payload: UpdateMobileAccountPayload,
) {
  return accounts.map((account) =>
    account.id === accountId
      ? {
          ...account,
          login: payload.login.trim(),
          role: payload.role.trim(),
          status: payload.status,
        }
      : account,
  );
}

export function blockMobileAccountLocal(accounts: MobileAccount[], accountId: string) {
  return accounts.map((account) =>
    account.id === accountId ? { ...account, status: "Заблокирован" as const, session: "-" as const } : account,
  );
}

export function unblockMobileAccountLocal(accounts: MobileAccount[], accountId: string) {
  return accounts.map((account) => {
    if (account.id !== accountId) return account;
    const hasAccess = account.employeeScope === "all" || (account.boundEmployees ?? []).length > 0;
    return { ...account, status: hasAccess ? ("Активен" as const) : ("Не привязан" as const) };
  });
}

export function detachEmployeeFromMobileAccount(accounts: MobileAccount[], accountId: string, employeeId?: string) {
  return accounts.map((account) => {
    if (account.id !== accountId) return account;
    const boundEmployeeIds = account.boundEmployeeIds ?? [];
    const removeIndex = employeeId ? boundEmployeeIds.indexOf(employeeId) : 0;
    const nextEmployees = (account.boundEmployees ?? []).filter((_, index) => index !== removeIndex);
    const nextIds = employeeId ? boundEmployeeIds.filter((id) => id !== employeeId) : boundEmployeeIds.slice(1);
    const nextStatus =
      account.status === "Заблокирован" ? account.status : nextEmployees.length > 0 ? ("Активен" as const) : ("Не привязан" as const);

    return {
      ...account,
      boundEmployeeIds: nextIds,
      boundEmployees: nextEmployees,
      employee: nextEmployees.length > 0 ? nextEmployees[0] : "Не привязан",
      status: nextStatus,
    };
  });
}

export function deleteMobileAccount(accounts: MobileAccount[], accountId: string) {
  return accounts.filter((account) => account.id !== accountId);
}

export function resetMobileAccountLocalPassword(accounts: MobileAccount[], accountId: string) {
  return resetMobileAccountPassword(accounts, accountId);
}

export function createApiMobileAccountsRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    async getAccounts(options: ApiRequestOptions = {}) {
      const accounts = await client.get<MobileAccountDto[]>("/api/v1/mobile-accounts", options);
      return accounts.map((account) => mapMobileAccount(account));
    },

    async createAccount(payload: CreateMobileAccountPayload) {
      const result = await client.post<MobileAccountCreatedDto, CreateMobileAccountDto>(
        "/api/v1/mobile-accounts",
        mapCreateMobileAccountPayload(payload),
      );
      return {
        account: mapMobileAccount(result.account),
        temporaryPassword: result.temporaryPassword ?? undefined,
      } satisfies MobileAccountCreateResult;
    },

    async attachEmployee(accountId: string, employeeId: string, employeeName?: string) {
      const account = await client.post<MobileAccountDto, AttachMobileAccountEmployeeDto>(
        `/api/v1/mobile-accounts/${accountId}/employees`,
        { employeeId, employeeName },
      );
      return mapMobileAccount(account);
    },

    async bindEmployees(accountId: string, employeeIds: string[]) {
      const account = await client.put<MobileAccountDto, BindMobileAccountEmployeesDto>(
        `/api/v1/mobile-accounts/${accountId}/employees/bind`,
        { employeeIds },
      );
      return mapMobileAccount(account);
    },

    async updateAccount(accountId: string, payload: UpdateMobileAccountPayload) {
      const account = await client.put<MobileAccountDto, UpdateMobileAccountDto>(
        `/api/v1/mobile-accounts/${accountId}`,
        payload,
      );
      return mapMobileAccount(account);
    },

    async blockAccount(accountId: string) {
      const account = await client.post<MobileAccountDto, Record<string, never>>(
        `/api/v1/mobile-accounts/${accountId}/block`,
        {},
      );
      return mapMobileAccount(account);
    },

    async unblockAccount(accountId: string) {
      const account = await client.post<MobileAccountDto, Record<string, never>>(
        `/api/v1/mobile-accounts/${accountId}/unblock`,
        {},
      );
      return mapMobileAccount(account);
    },

    async detachEmployee(accountId: string, employeeId: string) {
      const account = await client.delete<MobileAccountDto>(`/api/v1/mobile-accounts/${accountId}/employees/${employeeId}`);
      return mapMobileAccount(account);
    },

    async getSessions(accountId: string) {
      const sessions = await client.get<MobileAccountSessionDto[]>(`/api/v1/mobile-accounts/${accountId}/sessions`);
      return sessions.map(mapMobileAccountSession);
    },

    async getSecurityEvents(accountId: string) {
      const events = await client.get<MobileAccountSecurityEventDto[]>(`/api/v1/mobile-accounts/${accountId}/security-events`);
      return events.map(mapMobileAccountSecurityEvent);
    },

    async getAvailableEmployees(accountId: string) {
      const employees = await client.get<AvailableEmployeeDto[]>(`/api/v1/mobile-accounts/${accountId}/available-employees`);
      return employees.map(mapAvailableEmployee);
    },

    async resetPassword(accountId: string) {
      return client.post<ResetMobileAccountPasswordDto, Record<string, never>>(
        `/api/v1/mobile-accounts/${accountId}/reset-password`,
        {},
      );
    },

    async deleteAccount(accountId: string) {
      await client.delete(`/api/v1/mobile-accounts/${accountId}`);
    },
  };
}

function mapCreateMobileAccountPayload(payload: CreateMobileAccountPayload): CreateMobileAccountDto {
  return {
    employee: payload.employee,
    employeeScope: payload.employeeScope,
    login: payload.login,
    role: payload.role,
    bindEmployee: payload.bindEmployee,
    restrictToBoundDevice: payload.restrictToBoundDevice,
    temporaryPassword: payload.temporaryPassword,
    password: payload.password,
    confirmPassword: payload.confirmPassword,
    status: payload.status,
    language: payload.language,
    requirePasswordChange: payload.requirePasswordChange,
    restrictToLinkedDevices: payload.restrictToLinkedDevices,
  };
}

function mapMobileAccount(account: MobileAccountDto): MobileAccount {
  return {
    id: account.id,
    login: account.login,
    passwordState: account.passwordState,
    employee: account.employee,
    employeeScope: account.employeeScope,
    boundEmployeeIds: account.boundEmployeeIds ?? [],
    boundEmployees: account.boundEmployees,
    role: account.role,
    status: account.status as MobileAccount["status"],
    session: account.session as MobileAccount["session"],
    lastSeen: account.lastSeen,
    device: account.device,
    version: account.version,
  };
}

function mapMobileAccountSession(session: MobileAccountSessionDto): MobileAccountSession {
  return {
    id: session.id,
    accountId: session.accountId,
    status: session.status,
    deviceId: session.deviceId,
    device: session.device,
    platform: session.platform,
    appVersion: session.appVersion,
    ipAddress: session.ipAddress,
    lastSeenAt: session.lastSeenAt,
  };
}

function mapMobileAccountSecurityEvent(event: MobileAccountSecurityEventDto): MobileAccountSecurityEvent {
  return {
    id: event.id,
    accountId: event.accountId,
    eventType: event.eventType,
    message: event.message,
    createdAt: event.createdAt,
    actor: event.actor,
  };
}

function mapAvailableEmployee(employee: AvailableEmployeeDto): EmployeeDirectoryItem {
  return {
    id: employee.id,
    fullName: employee.fullName,
    initials: employee.fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join(""),
    personnelNo: "",
    position: employee.role,
    department: employee.department,
    employeeGroup: "",
    birthDate: "",
    zone: employee.department,
    status: "Активен",
    routesDone: 0,
    routesTotal: 0,
    mobileStatus: "Не привязан",
    lastSeen: "",
    phone: "",
    hiredAt: "",
    brigade: "",
    shift: employee.area,
    leader: "",
    email: "",
  };
}
