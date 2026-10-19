import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type {
  PermissionOverrideDto,
  SiteUserAccessCatalogDto,
  SiteUserAccessDto,
  SiteUserAccessScopeUpsertDto,
  SiteUserAuditPageDto,
  SiteUserSessionsDto,
} from "../api/contracts";
import type { DataSourceMode, DataSourceStatus, SiteUser } from "../types";
import {
  buildCompatibilityAccessCatalog,
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
  sessionKey = "",
  showTemporaryPassword,
  showToast,
}: {
  dataSourceMode: DataSourceMode;
  sessionKey?: string;
  showTemporaryPassword: (notice: TemporarySiteUserPasswordNotice) => void;
  showToast: (message: string) => void;
}) {
  const apiSiteUsers = useMemo(() => createApiSiteUsersRepository(), []);
  const [apiUsers, setApiUsers] = useState<SiteUser[]>([]);
  const [catalog, setCatalog] = useState<SiteUserAccessCatalogDto | null>(null);
  const [emuSections, setEmuSections] = useState<Array<{ id: string; name: string; isActive: boolean; sortOrder: number }>>([]);
  const [status, setStatus] = useState<DataSourceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const owner = `${dataSourceMode}:${sessionKey}`;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [loadedOwner, setLoadedOwner] = useState(owner);
  const requestVersion = useRef(0);
  const isCurrentOwner = useCallback(() => ownerRef.current === owner, [owner]);
  const ownsData = loadedOwner === owner;

  const users = dataSourceMode === "api" ? (ownsData ? apiUsers : []) : siteUsersFallback;

  useEffect(() => {
    setApiUsers([]); setCatalog(null); setEmuSections([]);
    setErrorMessage(undefined); setStatus("idle"); setLoadedOwner(owner);
  }, [owner]);

  const refreshUsers = useCallback(async () => {
    if (!isCurrentOwner()) return;
    const version = ++requestVersion.current;
    if (dataSourceMode !== "api") {
      setStatus("idle");
      setErrorMessage(undefined);
      return;
    }

    setStatus("loading");
    setErrorMessage(undefined);

    try {
      const useServerCatalog = import.meta.env.VITE_SITE_USER_ACCESS_CATALOG === "true";
      const [usersResult, sectionsResult, rolesResult, catalogResult] = await Promise.allSettled([
        apiSiteUsers.getUsers(),
        apiSiteUsers.getEmuSections(),
        apiSiteUsers.getRoles(),
        useServerCatalog ? apiSiteUsers.getAccessCatalog() : Promise.resolve(null),
      ]);
      if (!isCurrentOwner() || version !== requestVersion.current) return;
      if (usersResult.status === "rejected") {
        throw usersResult.reason;
      }
      const nextCatalog = catalogResult.status === "fulfilled" && catalogResult.value
        ? catalogResult.value
        : buildCompatibilityAccessCatalog(rolesResult.status === "fulfilled" ? rolesResult.value : [], usersResult.value);
      setApiUsers(usersResult.value);
      setCatalog(nextCatalog);
      setEmuSections(sectionsResult.status === "fulfilled" ? sectionsResult.value : []);
      setStatus("ready");
    } catch (error) {
      if (!isCurrentOwner() || version !== requestVersion.current) return;
      const message = formatApiError(error, "Не удалось загрузить пользователей");
      setStatus("error");
      setErrorMessage(message);
    }
  }, [apiSiteUsers, dataSourceMode, isCurrentOwner]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  async function createUser(payload: SiteUserFormPayload) {
    if (!isCurrentOwner()) return;
    if (dataSourceMode !== "api") {
      showToast("Local draft mode is active.");
      return;
    }

    try {
      const result = await apiSiteUsers.createUser(payload);
      if (!isCurrentOwner()) return;
      await refreshUsers();
      if (!isCurrentOwner()) return;
      showTemporaryPassword({
        accountLogin: result.user.login,
        password: result.temporaryPassword || payload.initialPassword || "",
        title: "Temporary password",
      });
      showToast("User " + result.user.login + " created.");
    } catch (error) {
      if (!isCurrentOwner()) return;
      showToast(formatApiError(error, "User was not created."));
      throw error;
    }
  }

  async function updateUser(userId: string, payload: SiteUserFormPayload) {
    if (!isCurrentOwner()) return;
    if (dataSourceMode !== "api") {
      showToast("Changes will be saved after the backend is connected.");
      return;
    }

    try {
      const result = await apiSiteUsers.updateUser(userId, payload);
      if (!isCurrentOwner()) return;
      setApiUsers((current) => current.map((user) => user.id === userId ? result : user));
      showToast("User " + result.login + " updated.");
    } catch (error) {
      if (!isCurrentOwner()) return;
      showToast(formatApiError(error, "User was not updated."));
      throw error;
    }
  }

  const loadUserAccess = useCallback(async (userId: string): Promise<SiteUserAccessDto | null> => {
    if (!isCurrentOwner() || dataSourceMode !== "api") return null;

    try {
      const value = await apiSiteUsers.getAccess(userId);
      return isCurrentOwner() ? value : null;
    } catch (error) {
      if (!isCurrentOwner()) return null;
      showToast(formatApiError(error, "Could not load user access."));
      return null;
    }
  }, [apiSiteUsers, dataSourceMode, showToast, isCurrentOwner]);

  const loadAudit = useCallback(async (userId: string, page = 1): Promise<SiteUserAuditPageDto | null> => {
    if (!isCurrentOwner() || dataSourceMode !== "api") return null;
    try {
      const value = await apiSiteUsers.getAudit(userId, { page, pageSize: 10 });
      return isCurrentOwner() ? value : null;
    } catch (error) {
      if (!isCurrentOwner()) return null;
      if (error instanceof ApiError && error.status === 404) {
        return { items: [], page, pageSize: 10, totalCount: 0, changedPermissionsLast30Days: 0 };
      }
      showToast(formatApiError(error, "Не удалось загрузить аудит пользователя."));
      return null;
    }
  }, [apiSiteUsers, dataSourceMode, showToast, isCurrentOwner]);

  const loadSessions = useCallback(async (userId: string): Promise<SiteUserSessionsDto | null> => {
    if (!isCurrentOwner() || dataSourceMode !== "api") return null;
    try {
      const result = await apiSiteUsers.getSessions(userId);
      return isCurrentOwner() ? result : null;
    } catch (error) {
      if (!isCurrentOwner()) return null;
      if (error instanceof ApiError && error.status === 404) {
        return { items: [], activeCount: 0 };
      }
      showToast(formatApiError(error, "Не удалось загрузить активные сессии."));
      return null;
    }
  }, [apiSiteUsers, dataSourceMode, showToast, isCurrentOwner]);

  async function exportAudit(userId: string) {
    if (!isCurrentOwner()) return;
    if (dataSourceMode !== "api") return;
    try {
      const file = await apiSiteUsers.exportAudit(userId);
      if (!isCurrentOwner()) return;
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.downloadName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (!isCurrentOwner()) return;
      showToast(error instanceof ApiError && error.status === 404 ? "Экспорт аудита станет доступен после обновления API." : formatApiError(error, "Не удалось экспортировать аудит."));
    }
  }
  async function saveUserPermissions(
    userId: string,
    permissionCodes: string[],
    permissionOverrides: PermissionOverrideDto[] = [],
  ) {
    if (!isCurrentOwner()) return;
    if (dataSourceMode !== "api") {
      showToast("Permission changes are available in API mode.");
      return null;
    }

    try {
      const updated = await apiSiteUsers.updatePermissions(userId, permissionCodes, permissionOverrides);
      if (!isCurrentOwner()) return;
      setApiUsers((current) => current.map((user) => user.id === userId ? updated : user));
      showToast("Настройки прав сохранены.");
      return updated;
    } catch (error) {
      if (!isCurrentOwner()) return;
      showToast(formatApiError(error, "Не удалось сохранить права."));
      throw error;
    }
  }

  async function saveUserScopes(
    userId: string,
    scopes: SiteUserAccessScopeUpsertDto[],
    scopeMode: "all" | "selected" = "selected",
  ) {
    if (!isCurrentOwner()) return;
    if (dataSourceMode !== "api") {
      showToast("EMU scope changes are available in API mode.");
      return null;
    }

    try {
      const updated = await apiSiteUsers.updateScopes(userId, scopes, scopeMode);
      if (!isCurrentOwner()) return;
      showToast("Доступ к участкам ЭМУ сохранен.");
      return updated;
    } catch (error) {
      if (!isCurrentOwner()) return;
      showToast(formatApiError(error, "Не удалось сохранить доступ к участкам ЭМУ."));
      throw error;
    }
  }

  async function toggleBlockUser(user: SiteUser) {
    if (!isCurrentOwner()) return;
    if (dataSourceMode !== "api") {
      showToast("Blocking is available in API mode.");
      return;
    }

    try {
      const updated = user.status === "Заблокирован"
        ? await apiSiteUsers.unblockUser(user.id)
        : await apiSiteUsers.blockUser(user.id);
      if (!isCurrentOwner()) return;
      setApiUsers((current) => current.map((item) => item.id === user.id ? updated : item));
      showToast("User status updated.");
    } catch (error) {
      if (!isCurrentOwner()) return;
      showToast(formatApiError(error, "User status was not changed."));
      throw error;
    }
  }

  async function resetPassword(user: SiteUser) {
    if (!isCurrentOwner()) return;
    if (dataSourceMode !== "api") {
      showToast("Password reset is available in API mode.");
      return;
    }

    try {
      const result = await apiSiteUsers.resetPassword(user.id);
      if (!isCurrentOwner()) return;
      showTemporaryPassword({
        accountLogin: user.login,
        password: result.temporaryPassword,
        title: "New temporary password",
      });
      showToast("Temporary password regenerated.");
    } catch (error) {
      if (!isCurrentOwner()) return;
      showToast(formatApiError(error, "Password was not reset."));
      throw error;
    }
  }

  return {
    catalog: ownsData ? catalog : null,
    createUser,
    emuSections: ownsData ? emuSections : [],
    errorMessage,
    exportAudit,
    loadAudit,
    loadSessions,
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
