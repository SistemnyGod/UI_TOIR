import { initialAccounts, securityEvents } from "../data";
import { ApiClient, type ApiRequestOptions } from "../api/client";
import type {
  AttachMobileAccountEmployeeDto,
  CreateMobileAccountDto,
  MobileAccountCreatedDto,
  MobileAccountDto,
  ResetMobileAccountPasswordDto,
} from "../api/contracts";
import {
  bindMobileAccountToEmployee,
  createMobileAccountDraft,
  isMobileAccountList,
  resetMobileAccountPassword,
} from "../domain/mobileAccounts";
import type { CreateMobileAccountPayload, MobileAccount } from "../types";

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

export function attachEmployeeToMobileAccount(accounts: MobileAccount[], accountId: string, employeeName: string) {
  return bindMobileAccountToEmployee(accounts, accountId, employeeName);
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

    async attachEmployee(accountId: string, employeeName: string) {
      const account = await client.post<MobileAccountDto, AttachMobileAccountEmployeeDto>(
        `/api/v1/mobile-accounts/${accountId}/employees`,
        { employeeName },
      );
      return mapMobileAccount(account);
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
  };
}

function mapMobileAccount(account: MobileAccountDto): MobileAccount {
  return {
    id: account.id,
    login: account.login,
    password: account.passwordState,
    employee: account.employee,
    employeeScope: account.employeeScope,
    boundEmployees: account.boundEmployees,
    role: account.role,
    status: account.status as MobileAccount["status"],
    session: account.session as MobileAccount["session"],
    lastSeen: account.lastSeen,
    device: account.device,
    version: account.version,
  };
}
