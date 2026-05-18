import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useStoredState } from "./useStoredState";

export interface TemporaryPasswordNotice {
  accountLogin: string;
  password: string;
  title: string;
}

export interface UseMobileAccountsWorkspaceParams {
  dataSourceMode: DataSourceMode;
  showTemporaryPassword: (notice: TemporaryPasswordNotice) => void;
  showToast: (message: string) => void;
}

export function useMobileAccountsWorkspace({
  dataSourceMode,
  showTemporaryPassword,
  showToast,
}: UseMobileAccountsWorkspaceParams) {
  const [accounts, setAccounts] = useStoredState<MobileAccount[]>(mobileAccountsStorageKey, mobileAccountsFallback, {
    validate: isMobileAccountList,
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
        setApiAccounts([]);
        setAccountListStatus("error");
        setAccountListErrorMessage(message);
        showToast(`Не удалось загрузить мобильные аккаунты API: ${message}`);
      }
    },
    [apiMobileAccounts, dataSourceMode, showToast],
  );

  const refreshMobileAccountSecurity = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (dataSourceMode !== "api") {
        setMobileAccountSessions([]);
        setMobileAccountSecurityEvents(mapFallbackSecurityEvents());
        setMobileAccountSecurityStatus("idle");
        setMobileAccountSecurityErrorMessage(undefined);
        return;
      }

      if (!selectedAccountId) {
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
          apiMobileAccounts.getSessions(selectedAccountId),
          apiMobileAccounts.getSecurityEvents(selectedAccountId),
        ]);
        if (signal?.aborted) return;

        setMobileAccountSessions(sessions);
        setMobileAccountSecurityEvents(securityEvents);
        setMobileAccountSecurityStatus("ready");
      } catch (error) {
        if (signal?.aborted) return;

        const message = error instanceof Error ? error.message : "Не удалось загрузить сессии и журнал безопасности";
        setMobileAccountSessions([]);
        setMobileAccountSecurityEvents([]);
        setMobileAccountSecurityStatus("error");
        setMobileAccountSecurityErrorMessage(message);
      }
    },
    [apiMobileAccounts, dataSourceMode, selectedAccountId],
  );

  useEffect(() => {
    if (visibleAccounts.length === 0) {
      if (selectedAccountId) setSelectedAccountId("");
      return;
    }

    if (!visibleAccounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(visibleAccounts[0].id);
    }
  }, [selectedAccountId, visibleAccounts]);

  useEffect(() => {
    if (dataSourceMode !== "api") {
      setAccountListStatus("idle");
      setAccountListErrorMessage(undefined);
      return;
    }

    const controller = new AbortController();
    void refreshMobileAccounts({ signal: controller.signal });
    return () => controller.abort();
  }, [dataSourceMode, refreshMobileAccounts]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshMobileAccountSecurity({ signal: controller.signal });
    return () => controller.abort();
  }, [refreshMobileAccountSecurity]);

  function openCreateAccountPanel() {
    setAccountMode("accounts");
    setAccountCreateIntent((value) => value + 1);
  }

  async function createMobileAccount(payload: CreateMobileAccountPayload) {
    if (dataSourceMode === "api") {
      try {
        const result = await apiMobileAccounts.createAccount(payload);
        await refreshMobileAccounts();
        setSelectedAccountId(result.account.id);
        setAccountMode("accounts");
        await refreshMobileAccountSecurity();
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

  async function toggleSelectedAccountBlock() {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === selectedAccountId);
    const isBlocked = account?.status === "Заблокирован";

    if (dataSourceMode === "api") {
      try {
        const nextAccount = isBlocked
          ? await apiMobileAccounts.unblockAccount(selectedAccountId)
          : await apiMobileAccounts.blockAccount(selectedAccountId);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity();
        showToast(isBlocked ? `Аккаунт ${nextAccount.login} разблокирован` : `Аккаунт ${nextAccount.login} заблокирован`);
      } catch (error) {
        showToast(getErrorMessage(error, isBlocked ? "Не удалось разблокировать аккаунт" : "Не удалось заблокировать аккаунт"));
        throw error;
      }
      return;
    }

    setAccounts(isBlocked ? unblockMobileAccountLocal(accounts, selectedAccountId) : blockMobileAccountLocal(accounts, selectedAccountId));
    showToast(isBlocked ? "Аккаунт разблокирован" : "Аккаунт заблокирован");
  }

  async function detachEmployeeFromSelectedAccount(employeeId?: string) {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === selectedAccountId);
    const resolvedEmployeeId = employeeId ?? account?.boundEmployeeIds?.[0];
    if (!resolvedEmployeeId && dataSourceMode === "api") {
      showToast("Для отвязки нужен employeeId. Перепривяжите сотрудника из справочника или обновите данные аккаунта.");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.detachEmployee(selectedAccountId, resolvedEmployeeId!);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity();
        showToast("Сотрудник отвязан от аккаунта");
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось отвязать сотрудника"));
        throw error;
      }
      return;
    }

    setAccounts(detachEmployeeFromMobileAccount(accounts, selectedAccountId, resolvedEmployeeId));
    showToast("Сотрудник отвязан от аккаунта");
  }

  async function deleteSelectedAccount() {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === selectedAccountId);

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.deleteAccount(selectedAccountId);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity();
        showToast(account ? `Аккаунт ${account.login} удален` : "Аккаунт удален");
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось удалить аккаунт"));
        throw error;
      }
      return;
    }

    const nextAccounts = deleteMobileAccount(accounts, selectedAccountId);
    setAccounts(nextAccounts);
    setSelectedAccountId(nextAccounts[0]?.id ?? "");
    showToast(account ? `Аккаунт ${account.login} удален из локального прототипа` : "Аккаунт удален");
  }

  async function resetSelectedPassword() {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        const result = await apiMobileAccounts.resetPassword(selectedAccountId);
        await refreshMobileAccounts();
        await refreshMobileAccountSecurity();
        const account = visibleAccounts.find((item) => item.id === selectedAccountId);
        showTemporaryPassword({
          accountLogin: account?.login ?? selectedAccountId,
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

    const result = resetMobileAccountLocalPassword(accounts, selectedAccountId);
    setAccounts(result.accounts);
    const account = visibleAccounts.find((item) => item.id === selectedAccountId);
    showTemporaryPassword({
      accountLogin: account?.login ?? selectedAccountId,
      password: result.temporaryPassword,
      title: "Временный пароль после локального сброса",
    });
    showToast("Пароль обновлен");
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
    id: `mock-security-${index}`,
    accountId: "mock",
    eventType: event[1] ?? "mock.event",
    message: event[2] ?? "",
    createdAt: event[0] ?? "",
    actor: event[3] ?? "mock",
  }));
}
