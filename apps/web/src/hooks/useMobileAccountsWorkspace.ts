import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type {
  AccountMode,
  CreateMobileAccountPayload,
  DataSourceMode,
  DataSourceStatus,
  MobileAccount,
  MobileAccountSecurityEvent,
  MobileAccountSession,
  UpdateMobileAccountPayload,
} from "../types";
import {
  attachEmployeeToMobileAccount,
  blockMobileAccountLocal,
  createApiMobileAccountsRepository,
  createLocalMobileAccount,
  deleteMobileAccount,
  detachEmployeeFromMobileAccount,
  isMobileAccountList,
  mobileAccountsFallback,
  mobileAccountsStorageKey,
  resetMobileAccountLocalPassword,
  securityEventsFallback,
  unblockMobileAccountLocal,
  updateMobileAccountLocal,
} from "../repositories/mobileAccountsRepository";
import { resolveMobileAccountSecurityTarget } from "../domain/mobileAccounts";
import { useStoredState } from "./useStoredState";

export interface TemporaryPasswordNotice {
  accountLogin: string;
  password: string;
  title: string;
}

export interface UseMobileAccountsWorkspaceParams {
  dataSourceMode: DataSourceMode;
  /** Account and security endpoints are only needed on the accounts screen. */
  enabled?: boolean;
  showTemporaryPassword: (notice: TemporaryPasswordNotice) => void;
  showToast: (message: string) => void;
}

export function useMobileAccountsWorkspace({
  dataSourceMode,
  enabled = true,
  showTemporaryPassword,
  showToast,
}: UseMobileAccountsWorkspaceParams) {
  const [accounts, setAccounts] = useStoredState<MobileAccount[]>(mobileAccountsStorageKey, mobileAccountsFallback, {
    validate: isMobileAccountList,
    version: 2,
  });
  const [accountMode, setAccountMode] = useState<AccountMode>("accounts");
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [accountCreateIntent, setAccountCreateIntent] = useState(0);
  const apiMobileAccounts = useMemo(() => createApiMobileAccountsRepository(), []);
  const [apiAccounts, setApiAccounts] = useState<MobileAccount[]>([]);
  const [accountListStatus, setAccountListStatus] = useState<DataSourceStatus>("idle");
  const [accountListErrorMessage, setAccountListErrorMessage] = useState<string | undefined>();
  const [mobileAccountSessions, setMobileAccountSessions] = useState<MobileAccountSession[]>([]);
  const [mobileAccountSecurityEvents, setMobileAccountSecurityEvents] = useState<MobileAccountSecurityEvent[]>(
    mapFallbackSecurityEvents(),
  );
  const [mobileAccountSecurityStatus, setMobileAccountSecurityStatus] = useState<DataSourceStatus>("idle");
  const [mobileAccountSecurityErrorMessage, setMobileAccountSecurityErrorMessage] = useState<string | undefined>();
  const mutationLocksRef = useRef(new Set<string>());
  const securityRequestIdRef = useRef(0);

  const visibleAccounts = dataSourceMode === "api" ? apiAccounts : accounts;

  const refreshMobileAccounts = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (dataSourceMode !== "api") {
        setAccountListStatus("idle");
        setAccountListErrorMessage(undefined);
        return;
      }

      setAccountListStatus("loading");
      setAccountListErrorMessage(undefined);

      try {
        const nextAccounts = await apiMobileAccounts.getAccounts({ signal });
        setApiAccounts(nextAccounts);
        setSelectedAccountId((currentId) => {
          if (nextAccounts.some((account) => account.id === currentId)) return currentId;
          return nextAccounts[0]?.id ?? "";
        });
        setAccountListStatus("ready");
      } catch (error) {
        if (signal?.aborted) return;

        const message = error instanceof Error ? error.message : "Не удалось загрузить мобильные аккаунты API";
        setAccountListStatus("error");
        setAccountListErrorMessage(message);
        showToast(`Не удалось загрузить мобильные аккаунты API: ${message}`);
      }
    },
    [apiMobileAccounts, dataSourceMode, showToast],
  );

  const refreshMobileAccountSecurity = useCallback(
    async ({ signal, accountId }: { signal?: AbortSignal; accountId?: string } = {}) => {
      if (dataSourceMode !== "api" || !enabled) {
        setMobileAccountSessions([]);
        setMobileAccountSecurityEvents(dataSourceMode === "mock" && enabled ? mapFallbackSecurityEvents() : []);
        setMobileAccountSecurityStatus("idle");
        setMobileAccountSecurityErrorMessage(undefined);
        return;
      }

      const requestId = securityRequestIdRef.current + 1;
      securityRequestIdRef.current = requestId;
      const targetAccountId = resolveMobileAccountSecurityTarget(accountId, selectedAccountId);
      if (!targetAccountId) {
        setMobileAccountSessions([]);
        setMobileAccountSecurityEvents([]);
        setMobileAccountSecurityStatus("ready");
        setMobileAccountSecurityErrorMessage(undefined);
        return;
      }

      setMobileAccountSecurityStatus("loading");
      setMobileAccountSecurityErrorMessage(undefined);

      try {
        const [sessions, securityEvents] = await Promise.all([
          apiMobileAccounts.getSessions(targetAccountId),
          apiMobileAccounts.getSecurityEvents(targetAccountId),
        ]);
        if (signal?.aborted || requestId !== securityRequestIdRef.current) return;

        setMobileAccountSessions(sessions);
        setMobileAccountSecurityEvents(securityEvents);
        setMobileAccountSecurityStatus("ready");
      } catch (error) {
        if (signal?.aborted || requestId !== securityRequestIdRef.current) return;

        const message = error instanceof Error ? error.message : "Не удалось загрузить сессии и журнал безопасности";
        setMobileAccountSessions([]);
        setMobileAccountSecurityEvents([]);
        setMobileAccountSecurityStatus("error");
        setMobileAccountSecurityErrorMessage(message);
      }
    },
    [apiMobileAccounts, dataSourceMode, enabled, selectedAccountId],
  );

  useEffect(() => {
    if (dataSourceMode === "api" && !enabled) return;

    if (visibleAccounts.length === 0) {
      if (selectedAccountId) setSelectedAccountId("");
      return;
    }

    if (!visibleAccounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(visibleAccounts[0].id);
    }
  }, [dataSourceMode, enabled, selectedAccountId, visibleAccounts]);

  useEffect(() => {
      if (dataSourceMode !== "api" || !enabled) {
      setAccountListStatus("idle");
      setAccountListErrorMessage(undefined);
      return;
    }

    const controller = new AbortController();
    void refreshMobileAccounts({ signal: controller.signal });
    return () => controller.abort();
  }, [dataSourceMode, enabled, refreshMobileAccounts]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    void refreshMobileAccountSecurity({ signal: controller.signal });
    return () => controller.abort();
  }, [enabled, refreshMobileAccountSecurity]);

  function openCreateAccountPanel() {
    setAccountMode("accounts");
    setAccountCreateIntent((value) => value + 1);
  }

  async function createMobileAccount(payload: CreateMobileAccountPayload) {
    return runExclusiveMutation("create", async () => {
      if (dataSourceMode === "api") {
        try {
          const result = await apiMobileAccounts.createAccount(payload);
          setApiAccounts((current) => [result.account, ...current.filter((account) => account.id !== result.account.id)]);
          setSelectedAccountId(result.account.id);
          setAccountMode("accounts");
          await refreshMobileAccounts();
          await refreshMobileAccountSecurity({ accountId: result.account.id });
          if (result.temporaryPassword) {
            showTemporaryPassword({
              accountLogin: result.account.login,
              password: result.temporaryPassword,
              title: "Временный пароль для нового аккаунта",
            });
          }
          showToast(`Мобильный аккаунт ${result.account.login} создан`);
        } catch (error) {
          showToast(getErrorMessage(error, "Не удалось создать мобильный аккаунт"));
          throw error;
        }
        return;
      }

      const { account, accounts: nextAccounts, temporaryPassword } = createLocalMobileAccount(accounts, payload);
      setAccounts(nextAccounts);
      setSelectedAccountId(account.id);
      setAccountMode("accounts");
      if (temporaryPassword) {
        showTemporaryPassword({
          accountLogin: account.login,
          password: temporaryPassword,
          title: "Временный пароль для локального аккаунта",
        });
      }
      showToast(`Мобильный аккаунт ${account.login} создан: ${account.employee}`);
    });
  }

  async function attachEmployeeToSelectedAccount(employeeId: string, employeeName: string) {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const normalizedEmployeeName = employeeName.trim();
    if (!employeeId || !normalizedEmployeeName) {
      showToast("Выберите сотрудника из справочника");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.attachEmployee(selectedAccountId, employeeId, normalizedEmployeeName);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity();
        showToast(`Аккаунт привязан к ${normalizedEmployeeName}`);
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось привязать сотрудника"));
        throw error;
      }
      return;
    }

    setAccounts(attachEmployeeToMobileAccount(accounts, selectedAccountId, normalizedEmployeeName, employeeId));
    showToast(`Аккаунт привязан к ${normalizedEmployeeName}`);
  }

  async function bindEmployeesToSelectedAccount(employeeIds: string[]) {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    if (employeeIds.length === 0) {
      showToast("Выберите хотя бы одного сотрудника");
      return;
    }

    if (employeeIds.length > 5) {
      showToast("К одному аккаунту можно привязать не более 5 сотрудников");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.bindEmployees(selectedAccountId, employeeIds);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity();
        showToast(`Привязано сотрудников: ${employeeIds.length}`);
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось сохранить привязку сотрудников"));
        throw error;
      }
      return;
    }

    const employeesById = new Map<string, string>();
    for (const account of accounts) {
      account.boundEmployeeIds.forEach((id, index) => employeesById.set(id, account.boundEmployees[index] ?? id));
    }

    setAccounts((current) =>
      current.map((account) =>
        account.id === selectedAccountId
          ? {
              ...account,
              boundEmployeeIds: employeeIds,
              boundEmployees: employeeIds.map((id) => employeesById.get(id) ?? id),
              employee: employeeIds.length > 0 ? employeesById.get(employeeIds[0]) ?? employeeIds[0] : "Не привязан",
              employeeScope: "selected",
              status: account.status === "Заблокирован" ? account.status : "Активен",
            }
          : account,
      ),
    );
    showToast(`Привязано сотрудников: ${employeeIds.length}`);
  }

  async function updateSelectedAccount(payload: UpdateMobileAccountPayload) {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        const account = await apiMobileAccounts.updateAccount(selectedAccountId, payload);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity();
        setSelectedAccountId(account.id);
        showToast(`Аккаунт ${account.login} сохранен`);
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось сохранить аккаунт"));
        throw error;
      }
      return;
    }

    setAccounts(updateMobileAccountLocal(accounts, selectedAccountId, payload));
    showToast(`Аккаунт ${payload.login} сохранен`);
  }

  async function toggleSelectedAccountBlock(accountId?: string) {
    const targetAccountId = accountId ?? selectedAccountId;
    if (!targetAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === targetAccountId);
    const isBlocked = account?.status === "Заблокирован";

    if (dataSourceMode === "api") {
      try {
        const nextAccount = isBlocked
          ? await apiMobileAccounts.unblockAccount(targetAccountId)
          : await apiMobileAccounts.blockAccount(targetAccountId);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity({ accountId: targetAccountId });
        showToast(isBlocked ? `Аккаунт ${nextAccount.login} разблокирован` : `Аккаунт ${nextAccount.login} заблокирован`);
      } catch (error) {
        showToast(getErrorMessage(error, isBlocked ? "Не удалось разблокировать аккаунт" : "Не удалось заблокировать аккаунт"));
        throw error;
      }
      return;
    }

    setAccounts(isBlocked ? unblockMobileAccountLocal(accounts, targetAccountId) : blockMobileAccountLocal(accounts, targetAccountId));
    showToast(isBlocked ? "Аккаунт разблокирован" : "Аккаунт заблокирован");
  }

  async function detachEmployeeFromSelectedAccount(employeeId?: string, accountId?: string) {
    const targetAccountId = accountId ?? selectedAccountId;
    if (!targetAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === targetAccountId);
    const resolvedEmployeeId = employeeId ?? account?.boundEmployeeIds?.[0];
    if (!resolvedEmployeeId && dataSourceMode === "api") {
      showToast("Для отвязки нужен employeeId. Перепривяжите сотрудника из справочника или обновите данные аккаунта.");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.detachEmployee(targetAccountId, resolvedEmployeeId!);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity({ accountId: targetAccountId });
        showToast("Сотрудник отвязан от аккаунта");
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось отвязать сотрудника"));
        throw error;
      }
      return;
    }

    setAccounts(detachEmployeeFromMobileAccount(accounts, targetAccountId, resolvedEmployeeId));
    showToast("Сотрудник отвязан от аккаунта");
  }

  async function deleteSelectedAccount() {
    return runExclusiveMutation("delete", async () => {
      const targetAccountId = selectedAccountId;
      if (!targetAccountId) {
        showToast("Сначала выберите мобильный аккаунт");
        return;
      }

      const account = visibleAccounts.find((item) => item.id === targetAccountId);
      const remainingAccounts = visibleAccounts.filter((item) => item.id !== targetAccountId);
      const nextSelectedAccountId = remainingAccounts[0]?.id ?? "";

      if (dataSourceMode === "api") {
        try {
          await apiMobileAccounts.deleteAccount(targetAccountId);
          setApiAccounts(remainingAccounts);
          setSelectedAccountId(nextSelectedAccountId);
          await refreshMobileAccounts();
          await refreshMobileAccountSecurity({ accountId: nextSelectedAccountId });
          showToast(account ? `Аккаунт ${account.login} удален` : "Аккаунт удален");
        } catch (error) {
          showToast(getErrorMessage(error, "Не удалось удалить аккаунт"));
          throw error;
        }
        return;
      }

      const nextAccounts = deleteMobileAccount(accounts, targetAccountId);
      setAccounts(nextAccounts);
      setSelectedAccountId(nextAccounts[0]?.id ?? "");
      showToast(account ? `Аккаунт ${account.login} удален из локального прототипа` : "Аккаунт удален");
    });
  }

  async function resetSelectedPassword() {
    return runExclusiveMutation("reset-password", async () => {
      const targetAccountId = selectedAccountId;
      if (!targetAccountId) {
        showToast("Сначала выберите мобильный аккаунт");
        return;
      }

      if (dataSourceMode === "api") {
        try {
          const account = visibleAccounts.find((item) => item.id === targetAccountId);
          const result = await apiMobileAccounts.resetPassword(targetAccountId);
          await refreshMobileAccounts();
          await refreshMobileAccountSecurity({ accountId: targetAccountId });
          showTemporaryPassword({
            accountLogin: account?.login ?? targetAccountId,
            password: result.temporaryPassword,
            title: "Временный пароль после сброса",
          });
          showToast("Временный пароль выдан");
        } catch (error) {
          showToast(getErrorMessage(error, "Не удалось сбросить пароль"));
          throw error;
        }
        return;
      }

      const result = resetMobileAccountLocalPassword(accounts, targetAccountId);
      setAccounts(result.accounts);
      const account = visibleAccounts.find((item) => item.id === targetAccountId);
      showTemporaryPassword({
        accountLogin: account?.login ?? targetAccountId,
        password: result.temporaryPassword,
        title: "Временный пароль после локального сброса",
      });
      showToast("Пароль обновлен");
    });
  }

  async function runExclusiveMutation<T>(key: string, operation: () => Promise<T> | T) {
    if (mutationLocksRef.current.has(key)) {
      throw new Error("Операция с мобильным аккаунтом уже выполняется.");
    }

    mutationLocksRef.current.add(key);
    try {
      return await operation();
    } finally {
      mutationLocksRef.current.delete(key);
    }
  }

  return {
    accountCreateIntent,
    accountListErrorMessage,
    accountListStatus,
    accountMode,
    accounts: visibleAccounts,
    createMobileAccount,
    deleteSelectedAccount,
    detachEmployeeFromSelectedAccount,
    mobileAccountSecurityErrorMessage,
    mobileAccountSecurityEvents,
    mobileAccountSecurityStatus,
    mobileAccountSessions,
    openCreateAccountPanel,
    refreshMobileAccountSecurity,
    refreshMobileAccounts,
    resetSelectedPassword,
    selectedAccountId,
    setAccountMode,
    setSelectedAccountId,
    attachEmployeeToSelectedAccount,
    bindEmployeesToSelectedAccount,
    toggleSelectedAccountBlock,
    updateSelectedAccount,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.errors) {
    const fieldMessages = Object.values(error.errors).flat().filter(Boolean);
    if (fieldMessages.length > 0) {
      return `${fallback}: ${fieldMessages[0]}`;
    }
  }

  return error instanceof Error ? `${fallback}: ${error.message}` : fallback;
}

function mapFallbackSecurityEvents(): MobileAccountSecurityEvent[] {
  return securityEventsFallback.map((event, index) => ({
    id: `local-security-${index}`,
    accountId: "local",
    eventType: event[1] ?? "local.event",
    message: event[2] ?? "",
    createdAt: event[0] ?? "",
    actor: event[3] ?? "local",
  }));
}
