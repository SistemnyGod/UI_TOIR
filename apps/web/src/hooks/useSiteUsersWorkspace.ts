import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import type { SiteUserAccessDto, SiteUserAccessScopeUpsertDto } from "../api/contracts";
import type { DataSourceMode, DataSourceStatus, SiteUser } from "../types";
import {
  createApiSiteUsersRepository,
  siteUsersFallback,
  type SiteUserFormPayload,
} from "../repositories/siteUsersRepository";

export interface TemporarySiteUserPasswordNotice {
  accountLogin: string;
  password: string;
  title: string;
}

export function useSiteUsersWorkspace({
  dataSourceMode,
  showTemporaryPassword,
  showToast,
}: {
  dataSourceMode: DataSourceMode;
  showTemporaryPassword: (notice: TemporarySiteUserPasswordNotice) => void;
  showToast: (message: string) => void;
}) {
  const apiSiteUsers = useMemo(() => createApiSiteUsersRepository(), []);
  const [apiUsers, setApiUsers] = useState<SiteUser[]>([]);
  const [status, setStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const users = dataSourceMode === "api" ? apiUsers : siteUsersFallback;

  const refreshUsers = useCallback(async () => {
    if (dataSourceMode !== "api") {
      setStatus("idle");
      setErrorMessage(undefined);
      return;
    }

    setStatus("loading");
    setErrorMessage(undefined);

    try {
      const nextUsers = await apiSiteUsers.getUsers();
      setApiUsers(nextUsers);
      setStatus("ready");
    } catch (error) {
      const message = formatApiError(error, "Не удалось загрузить пользователей сайта");
      setApiUsers([]);
      setStatus("error");
      setErrorMessage(message);
    }
  }, [apiSiteUsers, dataSourceMode]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  async function createUser(payload: SiteUserFormPayload) {
    if (dataSourceMode !== "api") {
      showToast("Пользователь сохранен как локальный UI-черновик");
      return;
    }

    try {
      const result = await apiSiteUsers.createUser(payload);
      await refreshUsers();
      showTemporaryPassword({
        accountLogin: result.user.login,
        password: result.temporaryPassword || payload.initialPassword || "",
        title: "Пароль пользователя сайта задан",
      });
      showToast(`Пользователь ${result.user.login} создан`);
    } catch (error) {
      showToast(formatApiError(error, "Пользователь не создан"));
      throw error;
    }
  }

  async function updateUser(userId: string, payload: SiteUserFormPayload) {
    if (dataSourceMode !== "api") {
      showToast("Изменения пользователя будут сохранены после подключения backend API");
      return;
    }

    try {
      const result = await apiSiteUsers.updateUser(userId, payload);
      setApiUsers((current) => current.map((user) => user.id === userId ? result : user));
      showToast(`Пользователь ${result.login} обновлен`);
    } catch (error) {
      showToast(formatApiError(error, "Пользователь не обновлен"));
      throw error;
    }
  }

  const loadUserAccess = useCallback(async (userId: string): Promise<SiteUserAccessDto | null> => {
    if (dataSourceMode !== "api") {
      return null;
    }

    try {
      return await apiSiteUsers.getAccess(userId);
    } catch (error) {
      showToast(formatApiError(error, "Не удалось загрузить права пользователя"));
      return null;
    }
  }, [apiSiteUsers, dataSourceMode, showToast]);

  async function saveUserPermissions(userId: string, permissionCodes: string[]) {
    if (dataSourceMode !== "api") {
      showToast("Индивидуальные права будут сохранены после подключения backend API");
      return null;
    }

    try {
      const updated = await apiSiteUsers.updatePermissions(userId, permissionCodes);
      setApiUsers((current) => current.map((user) => user.id === userId ? updated : user));
      showToast("Индивидуальные права сохранены");
      return updated;
    } catch (error) {
      showToast(formatApiError(error, "Права не сохранены"));
      throw error;
    }
  }

  async function saveUserScopes(userId: string, scopes: SiteUserAccessScopeUpsertDto[]) {
    if (dataSourceMode !== "api") {
      showToast("Ограничения по участкам будут сохранены после подключения backend API");
      return null;
    }

    try {
      const updated = await apiSiteUsers.updateScopes(userId, scopes);
      showToast("Ограничения по участкам сохранены");
      return updated;
    } catch (error) {
      showToast(formatApiError(error, "Участки не сохранены"));
      throw error;
    }
  }

  async function toggleBlockUser(user: SiteUser) {
    if (dataSourceMode !== "api") {
      showToast("Блокировка будет доступна после подключения backend API");
      return;
    }

    try {
      const updated = user.status === "Заблокирован"
        ? await apiSiteUsers.unblockUser(user.id)
        : await apiSiteUsers.blockUser(user.id);
      setApiUsers((current) => current.map((item) => item.id === user.id ? updated : item));
      showToast(updated.status === "Заблокирован" ? "Пользователь заблокирован" : "Пользователь разблокирован");
    } catch (error) {
      showToast(formatApiError(error, "Статус пользователя не изменен"));
      throw error;
    }
  }

  async function resetPassword(user: SiteUser) {
    if (dataSourceMode !== "api") {
      showToast("Сброс пароля будет выполнен через backend");
      return;
    }

    try {
      const result = await apiSiteUsers.resetPassword(user.id);
      showTemporaryPassword({
        accountLogin: user.login,
        password: result.temporaryPassword,
        title: "Новый временный пароль",
      });
      showToast("Пароль пересоздан");
    } catch (error) {
      showToast(formatApiError(error, "Пароль не пересоздан"));
      throw error;
    }
  }

  return {
    createUser,
    errorMessage,
    loadUserAccess,
    refreshUsers,
    resetPassword,
    saveUserPermissions,
    saveUserScopes,
    status,
    toggleBlockUser,
    updateUser,
    users,
  };
}

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const fieldMessages = error.errors
      ? Object.values(error.errors).flat().filter(Boolean)
      : [];
    return fieldMessages[0] ?? error.problem?.detail ?? error.message ?? fallback;
  }

  return error instanceof Error ? error.message : fallback;
}
