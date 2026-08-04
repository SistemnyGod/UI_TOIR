import { ApiClient, ApiError } from "../api/client";
import type {
  AccessModuleDto,
  CreateSiteUserDto,
  EmuReferenceDto,
  PermissionCatalogItemDto,
  PermissionOverrideDto,
  ResetSiteUserPasswordDto,
  RoleDto,
  SiteUserAccessCatalogDto,
  SiteUserAccessDto,
  SiteUserAccessScopeUpsertDto,
  SiteUserAuditPageDto,
  SiteUserCreatedDto,
  SiteUserDto,
  SiteUserListResponseDto,
  SiteUserSessionsDto,
  UpdateSiteUserDto,
  UpdateSiteUserPermissionsDto,
  UpdateSiteUserScopesDto,
} from "../api/contracts";
import { siteUsers } from "../data";
import type { SiteUser } from "../types";

export const SITE_USER_ROLES = ["Оператор", "Оператор ЭМУ", "Руководитель", "Аудитор", "Администратор"] as const;
export const SITE_USER_STATUSES = ["Активен", "Неактивен", "Заблокирован"] as const;
export const siteUsersFallback = siteUsers;

export const roleDescriptions: Array<{ role: SiteUser["role"]; description: string }> = [
  { role: "Администратор", description: "Полный доступ ко всем модулям, настройкам, ролям и индивидуальным правам." },
  { role: "Оператор", description: "Работа с обходами, назначениями и результатами без системного администрирования." },
  { role: "Оператор ЭМУ", description: "Создание и ведение карточек работ ЭМУ по назначенным участкам." },
  { role: "Руководитель", description: "Контроль отчетов, аналитики, команд и согласований." },
  { role: "Аудитор", description: "Просмотр, аудит и экспорт данных без изменения записей." },
];

export interface SiteUserFormPayload {
  login: string;
  fullName: string;
  initialPassword?: string;
  confirmPassword?: string;
  role: SiteUser["role"];
  status: SiteUser["status"];
  permissionCodes?: string[];
  enabledModuleKeys?: string[];
  permissionOverrides?: PermissionOverrideDto[];
  requirePasswordChange?: boolean;
}

export function createApiSiteUsersRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    async getUsers() {
      const users = await client.get<SiteUserDto[]>("/api/v1/site-users");
      return users.map(mapSiteUser);
    },
    async queryUsers(params: { search?: string; role?: string; status?: string; page?: number; pageSize?: number } = {}) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") query.set(key, String(value));
      });
      const result = await client.get<SiteUserListResponseDto>("/api/v1/site-users/query?" + query.toString());
      return { ...result, items: result.items.map(mapSiteUser) };
    },
    getAccessCatalog() {
      return client.get<SiteUserAccessCatalogDto>("/api/v1/site-users/access-catalog");
    },
    async getEmuSections() {
      const settings = await client.get<{ sections: EmuReferenceDto[] }>("/api/v1/emu/settings");
      return settings.sections.filter((section) => section.isActive);
    },
    getRoles() {
      return client.get<RoleDto[]>("/api/v1/site-users/roles");
    },
    getAccess(userId: string) {
      return client.get<SiteUserAccessDto>("/api/v1/site-users/" + userId + "/access");
    },
    async createUser(payload: SiteUserFormPayload) {
      const result = await client.post<SiteUserCreatedDto, CreateSiteUserDto>("/api/v1/site-users", mapCreateRequest(payload));
      return { temporaryPassword: result.temporaryPassword, user: mapSiteUser(result.user) };
    },
    async updateUser(userId: string, payload: SiteUserFormPayload) {
      const result = await client.put<SiteUserDto, UpdateSiteUserDto>("/api/v1/site-users/" + userId, mapUpdateRequest(payload));
      return mapSiteUser(result);
    },
    async updatePermissions(userId: string, permissionCodes: string[], permissionOverrides: PermissionOverrideDto[] = []) {
      const body = { permissionCodes, permissionOverrides };
      try {
        const result = await client.put<SiteUserDto, UpdateSiteUserPermissionsDto>("/api/v1/site-users/" + userId + "/permission-overrides", body);
        return mapSiteUser(result);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        const result = await client.put<SiteUserDto, UpdateSiteUserPermissionsDto>("/api/v1/site-users/" + userId + "/permissions", body);
        return mapSiteUser(result);
      }
    },
    async updateScopes(userId: string, scopes: SiteUserAccessScopeUpsertDto[], scopeMode: "all" | "selected" = "selected") {
      const body = { scopes, scopeMode };
      try {
        return await client.put<SiteUserAccessDto, UpdateSiteUserScopesDto>("/api/v1/site-users/" + userId + "/emu-scope", body);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        return client.put<SiteUserAccessDto, UpdateSiteUserScopesDto>("/api/v1/site-users/" + userId + "/scopes", body);
      }
    },
    getAudit(userId: string, params: Record<string, string | number | undefined> = {}) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") query.set(key, String(value));
      });
      return client.get<SiteUserAuditPageDto>("/api/v1/site-users/" + userId + "/audit?" + query.toString());
    },
    getSessions(userId: string) {
      return client.get<SiteUserSessionsDto>("/api/v1/site-users/" + userId + "/sessions");
    },
    exportAudit(userId: string) {
      return client.download("/api/v1/site-users/" + userId + "/audit/export");
    },
    async blockUser(userId: string) {
      const result = await client.post<SiteUserDto>("/api/v1/site-users/" + userId + "/block");
      return mapSiteUser(result);
    },
    async unblockUser(userId: string) {
      const result = await client.post<SiteUserDto>("/api/v1/site-users/" + userId + "/unblock");
      return mapSiteUser(result);
    },
    resetPassword(userId: string) {
      return client.post<ResetSiteUserPasswordDto>("/api/v1/site-users/" + userId + "/reset-password");
    },
  };
}

export function buildCompatibilityAccessCatalog(roles: RoleDto[], users: SiteUser[]): SiteUserAccessCatalogDto {
  const permissionCodes = [...new Set([
    ...roles.flatMap((role) => role.permissions),
    ...users.flatMap((user) => user.access),
  ])].sort((left, right) => left.localeCompare(right));

  const moduleDefinitions = [
    { key: "patrol", name: "Обход", description: "Маршруты, назначения, результаты и сотрудники" },
    { key: "inventory", name: "Бухгалтерия", description: "Склад, выдача, СИЗ и отчетность" },
    { key: "emu", name: "ЭМУ", description: "Работы, планы, отчеты и участки ЭМУ" },
    { key: "perco", name: "PERCo-Web", description: "Интеграция, синхронизация и журнал" },
    { key: "administration", name: "Администрирование", description: "Пользователи и мобильные аккаунты" },
  ] as const;

  const permissions = permissionCodes.map<PermissionCatalogItemDto>((code, index) => {
    const moduleKey = getCompatibilityModuleKey(code);
    const action = code.split(".").at(-1) ?? "view";
    return {
      code,
      name: humanizePermissionCode(code, moduleKey),
      moduleKey,
      category: code.includes("audit") || code.includes("reports") ? "Отчеты" : isCompatibilityViewAction(action) ? "Просмотр" : "Управление",
      isViewDefault: isCompatibilityViewAction(action),
      displayOrder: index,
    };
  });

  const modules = moduleDefinitions
    .map<AccessModuleDto>((definition) => ({
      ...definition,
      permissions: permissions.filter((permission) => permission.moduleKey === definition.key),
    }))
    .filter((module) => module.permissions.length > 0);

  return { roles, modules };
}

function getCompatibilityModuleKey(code: string) {
  if (code.startsWith("emu.")) return "emu";
  if (code.startsWith("inventory.")) return "inventory";
  if (code.startsWith("integrations.perco.")) return "perco";
  if (code.startsWith("site_users.") || code.startsWith("mobile_accounts.")) return "administration";
  return "patrol";
}

function humanizePermissionCode(code: string, moduleKey: string) {
  const moduleNames: Record<string, string> = {
    patrol: "обходов",
    inventory: "бухгалтерии",
    emu: "ЭМУ",
    perco: "PERCo-Web",
    administration: "администрирования",
  };
  const prefix = moduleKey === "emu" ? "emu." : moduleKey === "inventory" ? "inventory." : moduleKey === "perco" ? "integrations.perco." : "";
  const normalized = prefix && code.startsWith(prefix) ? code.slice(prefix.length) : code;
  const parts = normalized.split(".");
  const action = parts.pop() ?? "view";
  const subjectKey = parts.join(".");
  const subjects: Record<string, string> = {
    dashboard: "дашборда",
    routes: "маршрутов",
    employees: "сотрудников",
    requests: "заявок",
    assignments: "назначений",
    mobile_accounts: "мобильных аккаунтов",
    site_users: "пользователей",
    schedule: "планового обхода",
    results: "результатов обходов",
    work: "работ ЭМУ",
    directories: "справочников ЭМУ",
    "favorite-employees": "избранных сотрудников",
    plan: "плана ЭМУ",
    "plan.recurrence": "повторяющихся задач",
    reports: "отчетов",
    time: "учета времени",
    audit: "аудита",
    "work-accounting": "учета работ",
    history: "истории работ",
    completed: "выполненных работ",
    shift: "смены",
    decision: "решений",
    "shift-reports": "сменных отчетов",
    scope: "участков ЭМУ",
    items: "номенклатуры и остатков",
    stock: "остатков и движений",
    issue: "выдачи и возврата",
    custody: "ответственного хранения",
    ppe: "СИЗ",
    settings: "настроек и справочников",
    import: "импорта данных",
    users: "прав пользователей",
    logs: "журнала ошибок",
  };
  const actions: Record<string, string> = {
    read: "Просмотр",
    view: "Просмотр",
    write: "Управление",
    manage: "Управление",
    create: "Создание",
    update: "Изменение",
    delete: "Удаление",
    pause: "Пауза и продолжение",
    complete: "Завершение",
    approve: "Согласование",
    "override-approval": "Обход согласования",
    export: "Экспорт",
    import: "Импорт",
    sync: "Синхронизация",
    match: "Сопоставление",
    resolve: "Обработка",
    adjust: "Корректировка",
    all: "Доступ ко всем",
  };
  const subject = subjects[subjectKey] ?? moduleNames[moduleKey] ?? subjectKey.replace(/[._-]+/g, " ");
  return `${actions[action] ?? "Доступ"} ${subject}`;
}

function isCompatibilityViewAction(action: string) {
  return action === "read" || action === "view";
}
export function findSiteUser(users: SiteUser[], userId: string) {
  return users.find((item) => item.id === userId);
}

export function countUsersByRole(users: SiteUser[], role: SiteUser["role"]) {
  return users.filter((user) => user.role === role).length;
}

function mapCreateRequest(payload: SiteUserFormPayload): CreateSiteUserDto {
  return {
    displayName: payload.fullName.trim(),
    initialPassword: payload.initialPassword?.trim(),
    login: payload.login.trim(),
    permissionCodes: payload.permissionCodes ?? [],
    permissionOverrides: payload.permissionOverrides,
    enabledModuleKeys: payload.enabledModuleKeys,
    requirePasswordChange: payload.requirePasswordChange,
    roleCodes: [mapRoleCode(payload.role)],
    status: mapStatusCode(payload.status),
  };
}

function mapUpdateRequest(payload: SiteUserFormPayload): UpdateSiteUserDto {
  return {
    displayName: payload.fullName.trim(),
    login: payload.login.trim(),
    permissionCodes: payload.permissionCodes ?? [],
    permissionOverrides: payload.permissionOverrides,
    requirePasswordChange: payload.requirePasswordChange,
    roleCodes: [mapRoleCode(payload.role)],
    status: mapStatusCode(payload.status),
  };
}

function mapSiteUser(user: SiteUserDto): SiteUser {
  const primaryRole = user.roles[0] ?? "operator";
  return {
    id: user.id,
    login: user.login,
    fullName: user.displayName,
    role: mapRoleLabel(primaryRole),
    roleCode: primaryRole,
    permissionOverrides: user.permissionOverrides ?? [],
    requirePasswordChange: user.requirePasswordChange ?? false,
    status: mapStatusLabel(user.status),
    lastLogin: formatDateTime(user.lastLoginAt),
    createdAt: formatDateTime(user.createdAt),
    access: user.permissions,
    directPermissions: user.directPermissions,
    recentSessions: user.lastLoginAt ? [formatDateTime(user.lastLoginAt)] : [],
  };
}

function mapRoleLabel(roleCode: string): SiteUser["role"] {
  if (roleCode === "admin") return "Администратор";
  if (roleCode === "auditor") return "Аудитор";
  if (roleCode === "emu_operator") return "Оператор ЭМУ";
  if (roleCode === "manager") return "Руководитель";
  return "Оператор";
}

function mapRoleCode(role: SiteUser["role"]) {
  if (role === "Администратор") return "admin";
  if (role === "Аудитор") return "auditor";
  if (role === "Оператор ЭМУ") return "emu_operator";
  if (role === "Руководитель") return "manager";
  return "operator";
}

function mapStatusLabel(status: string): SiteUser["status"] {
  if (status === "blocked") return "Заблокирован";
  if (status === "inactive") return "Неактивен";
  return "Активен";
}

function mapStatusCode(status: SiteUser["status"]) {
  if (status === "Заблокирован") return "blocked";
  if (status === "Неактивен") return "inactive";
  return "active";
}

function formatDateTime(value: string | null) {
  if (!value) return "нет данных";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU");
}
