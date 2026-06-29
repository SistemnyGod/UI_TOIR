import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import type { DataSourceMode } from "../types";
import type { SessionUserDto } from "../api/contracts";
import {
  clearStoredSessionToken,
  createSessionRepository,
  getStoredSessionToken,
  setStoredLastLogin,
  setStoredSessionToken,
} from "../repositories/sessionRepository";

export type SessionStatus = "loading" | "anonymous" | "authenticated" | "error";

const mockSessionUser: SessionUserDto = {
  id: "mock-session-user",
  login: "mock",
  displayName: "Пользователь панели",
  roles: ["operator"],
  permissions: [
    "dashboard.read",
    "routes.read",
    "employees.read",
    "requests.read",
    "assignments.read",
    "routes.write",
    "employees.write",
    "requests.write",
    "assignments.write",
    "mobile_accounts.write",
    "site_users.write",
    "schedule.write",
    "results.read",
    "emu.view",
    "emu.work.create",
    "emu.work.update",
    "emu.work.pause",
    "emu.work.complete",
    "emu.work.delete",
    "emu.directories.manage",
    "emu.favorite-employees.manage",
    "emu.plan.view",
    "emu.plan.manage",
    "emu.plan.approve",
    "emu.plan.override-approval",
    "emu.plan.recurrence.manage",
    "emu.reports.view",
    "emu.time.override",
    "emu.audit.view",
    "inventory.view",
    "inventory.items.manage",
    "inventory.stock.view",
    "inventory.issue.manage",
    "inventory.custody.manage",
    "inventory.ppe.manage",
    "inventory.reports.view",
    "inventory.reports.export",
    "inventory.settings.manage",
    "inventory.import",
    "inventory.audit.view",
    "inventory.users.manage",
    "integrations.perco.view",
    "integrations.perco.manage",
    "integrations.perco.sync",
    "integrations.perco.match",
    "integrations.perco.logs.view",
  ],
};

export function useSession(dataSourceMode: DataSourceMode) {
  const repository = useMemo(() => createSessionRepository(), []);
  const [status, setStatus] = useState<SessionStatus>(dataSourceMode === "api" ? "loading" : "authenticated");
  const [user, setUser] = useState<SessionUserDto | null>(dataSourceMode === "api" ? null : mockSessionUser);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    if (dataSourceMode !== "api") {
      setUser(mockSessionUser);
      setStatus("authenticated");
      setErrorMessage(undefined);
      return;
    }

    if (!getStoredSessionToken()) {
      setUser(null);
      setStatus("anonymous");
      setErrorMessage(undefined);
      return;
    }

    setStatus("loading");
    setErrorMessage(undefined);

    try {
      const nextUser = await repository.me();
      setUser(nextUser);
      setStatus("authenticated");
    } catch (error) {
      clearStoredSessionToken();
      setUser(null);
      setStatus(error instanceof ApiError && error.status === 401 ? "anonymous" : "error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось проверить сессию");
    }
  }, [dataSourceMode, repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(loginValue: string, password: string, rememberMe = false) {
    setStatus("loading");
    setErrorMessage(undefined);

    try {
      const session = await repository.login({ login: loginValue.trim(), password, rememberMe });
      setStoredSessionToken(session.accessToken, rememberMe, session.expiresAt);
      setStoredLastLogin(loginValue);
      setUser(session.user);
      setStatus("authenticated");
      return true;
    } catch (error) {
      clearStoredSessionToken();
      setUser(null);
      setStatus("anonymous");
      setErrorMessage(getSessionErrorMessage(error));
      return false;
    }
  }

  async function logout() {
    if (dataSourceMode === "api" && getStoredSessionToken()) {
      try {
        await repository.logout();
      } catch {
        // Local token cleanup is still the source of truth for the UI state.
      }
    }

    clearStoredSessionToken();
    setUser(dataSourceMode === "api" ? null : mockSessionUser);
    setStatus(dataSourceMode === "api" ? "anonymous" : "authenticated");
    setErrorMessage(undefined);
  }

  return {
    errorMessage,
    isAuthenticated: status === "authenticated",
    login,
    logout,
    refresh,
    status,
    user,
  };
}

function getSessionErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.errors) {
    const firstFieldError = Object.values(error.errors).flat().filter(Boolean)[0];
    if (firstFieldError) return firstFieldError;
  }

  if (error instanceof ApiError && error.status === 401) {
    return "Неверный логин или пароль";
  }

  if (error instanceof ApiError && error.path?.includes("/auth/login")) {
    if (error.status === 404) {
      return "Сервис авторизации не обновлен. Перезапустите backend и попробуйте снова.";
    }

    if (error.status === 0) {
      return "Сервис авторизации недоступен. Проверьте, что backend запущен.";
    }
  }

  return error instanceof Error ? error.message : "Не удалось войти";
}
