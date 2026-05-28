import { useCallback, useEffect, useMemo, useState } from "react";
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
      const message = error instanceof Error ? error.message : "Не удалось загрузить пользователей сайта";
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

    const result = await apiSiteUsers.createUser(payload);
    await refreshUsers();
    showTemporaryPassword({
      accountLogin: result.user.login,
      password: result.temporaryPassword,
      title: "Временный пароль пользователя сайта",
    });
    showToast(`Пользователь ${result.user.login} создан`);
  }

  async function toggleBlockUser(user: SiteUser) {
    if (dataSourceMode !== "api") {
      showToast("Блокировка будет сохранена после подключения backend API");
      return;
    }

    const nextUser = user.status === "Заблокирован"
      ? await apiSiteUsers.unblockUser(user.id)
      : await apiSiteUsers.blockUser(user.id);
    await refreshUsers();
    showToast(nextUser.status === "Заблокирован" ? `Пользователь ${nextUser.login} заблокирован` : `Пользователь ${nextUser.login} активен`);
  }

  async function resetPassword(user: SiteUser) {
    if (dataSourceMode !== "api") {
      showToast("Сброс пароля будет выполнен через backend");
      return;
    }

    const result = await apiSiteUsers.resetPassword(user.id);
    showTemporaryPassword({
      accountLogin: user.login,
      password: result.temporaryPassword,
      title: "Временный пароль пользователя сайта",
    });
    showToast(`Временный пароль для ${user.login} выдан`);
  }

  return {
    createUser,
    errorMessage,
    refreshUsers,
    resetPassword,
    status,
    toggleBlockUser,
    users,
  };
}
