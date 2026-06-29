import { ApiClient } from "../api/client";
import type {
  CreateSiteUserDto,
  ResetSiteUserPasswordDto,
  RoleDto,
  SiteUserAccessDto,
  SiteUserAccessScopeUpsertDto,
  SiteUserCreatedDto,
  SiteUserDto,
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
}

export function createApiSiteUsersRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    async getUsers() {
      const users = await client.get<SiteUserDto[]>("/api/v1/site-users");
      return users.map(mapSiteUser);
    },
    getRoles() {
      return client.get<RoleDto[]>("/api/v1/site-users/roles");
    },
    getAccess(userId: string) {
      return client.get<SiteUserAccessDto>(`/api/v1/site-users/${userId}/access`);
    },
    async createUser(payload: SiteUserFormPayload) {
      const result = await client.post<SiteUserCreatedDto, CreateSiteUserDto>("/api/v1/site-users", mapCreateRequest(payload));
      return {
        temporaryPassword: result.temporaryPassword,
        user: mapSiteUser(result.user),
      };
    },
    async updateUser(userId: string, payload: SiteUserFormPayload) {
      const result = await client.put<SiteUserDto, UpdateSiteUserDto>(`/api/v1/site-users/${userId}`, mapUpdateRequest(payload));
      return mapSiteUser(result);
    },
    async updatePermissions(userId: string, permissionCodes: string[]) {
      const result = await client.put<SiteUserDto, UpdateSiteUserPermissionsDto>(`/api/v1/site-users/${userId}/permissions`, {
        permissionCodes,
      });
      return mapSiteUser(result);
    },
    updateScopes(userId: string, scopes: SiteUserAccessScopeUpsertDto[]) {
      return client.put<SiteUserAccessDto, UpdateSiteUserScopesDto>(`/api/v1/site-users/${userId}/scopes`, { scopes });
    },
    async blockUser(userId: string) {
      const result = await client.post<SiteUserDto>(`/api/v1/site-users/${userId}/block`);
      return mapSiteUser(result);
    },
    async unblockUser(userId: string) {
      const result = await client.post<SiteUserDto>(`/api/v1/site-users/${userId}/unblock`);
      return mapSiteUser(result);
    },
    resetPassword(userId: string) {
      return client.post<ResetSiteUserPasswordDto>(`/api/v1/site-users/${userId}/reset-password`);
    },
  };
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
    roleCodes: [mapRoleCode(payload.role)],
    status: mapStatusCode(payload.status),
  };
}

function mapUpdateRequest(payload: SiteUserFormPayload): UpdateSiteUserDto {
  return {
    displayName: payload.fullName.trim(),
    login: payload.login.trim(),
    permissionCodes: payload.permissionCodes ?? [],
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
