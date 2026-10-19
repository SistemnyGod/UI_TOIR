import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { DataSourceMode } from "../types";
import type { ChangePasswordDto, SessionUserDto } from "../api/contracts";
import {
  clearStoredSessionToken,
  createSessionRepository,
  getStoredRememberMe,
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
    "emu.shift-reports.create",
    "emu.shift-reports.view",
    "emu.shift-reports.view-all",
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
  const generation = useRef(0);
  const [sessionVersion, setSessionVersion] = useState(0);
  function beginSessionOperation() {
    const version = ++generation.current;
    setSessionVersion(version);
    return version;
  }

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setSessionVersion(version);
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
      if (generation.current !== version) return;
      setUser(nextUser);
      setStatus("authenticated");
    } catch (error) {
      if (generation.current !== version) return;
      clearStoredSessionToken();
      setUser(null);
      setStatus(error instanceof ApiError && error.status === 401 ? "anonymous" : "error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось проверить сессию");
    }
  }, [dataSourceMode, repository]);

  useEffect(() => {
    void refresh();
    return () => { ++generation.current; };
  }, [refresh]);

  async function login(loginValue: string, password: string, rememberMe = false) {
    const version = beginSessionOperation();
    setStatus("loading");
    setErrorMessage(undefined);

    try {
      const session = await repository.login({ login: loginValue.trim(), password, rememberMe });
      if (generation.current !== version) return false;
      setStoredSessionToken(session.accessToken, rememberMe, session.expiresAt);
      setStoredLastLogin(loginValue);
      setUser(session.user);
      setStatus("authenticated");
      return true;
    } catch (error) {
      if (generation.current !== version) return false;
      clearStoredSessionToken();
      setUser(null);
      setStatus("anonymous");
      setErrorMessage(getSessionErrorMessage(error));
      return false;
    }
  }

  async function changePassword(payload: ChangePasswordDto) {
    if (dataSourceMode !== "api") return false;
    const version = generation.current;
    setErrorMessage(undefined);
    try {
      const nextSession = await repository.changePassword(payload);
      if (generation.current !== version) return false;
      setStoredSessionToken(nextSession.accessToken, getStoredRememberMe(), nextSession.expiresAt);
      setUser(nextSession.user);
      setStatus("authenticated");
      return true;
    } catch (error) {
      if (generation.current !== version) return false;
      setErrorMessage(getSessionErrorMessage(error));
      return false;
    }
  }
  async function logout() {
    beginSessionOperation();
    const pendingLogout = dataSourceMode === "api" && getStoredSessionToken()
      ? repository.logout().catch(() => undefined)
      : Promise.resolve();
    clearStoredSessionToken();
    setUser(dataSourceMode === "api" ? null : mockSessionUser);
    setStatus(dataSourceMode === "api" ? "anonymous" : "authenticated");
    setErrorMessage(undefined);
    await pendingLogout;
  }

  return {
    changePassword,
    errorMessage,
    isAuthenticated: status === "authenticated",
    login,
    logout,
    refresh,
    status,
    sessionVersion,
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
