import { ApiClient } from "../api/client";
import type {
  CreateSiteUserDto,
  ResetSiteUserPasswordDto,
  RoleDto,
  SiteUserCreatedDto,
  SiteUserDto,
  UpdateSiteUserDto,
} from "../api/contracts";
import { siteUsers } from "../data";
import type { SiteUser } from "../types";

export const siteUsersFallback = siteUsers;

export const roleDescriptions: Array<{ role: SiteUser["role"]; description: string }> = [
  { role: "Администратор", description: "Полный доступ ко всем модулям и настройкам." },
  { role: "Оператор", description: "Работа с обходами, назначениями и результатами." },
  { role: "Руководитель", description: "Просмотр отчетов, аналитика, управление командой." },
  { role: "Аудитор", description: "Только чтение, аудит и экспорт данных." },
];

export interface SiteUserFormPayload {
  login: string;
  fullName: string;
  role: SiteUser["role"];
  status: SiteUser["status"];
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
    async createUser(payload: SiteUserFormPayload) {
      const request = mapCreateRequest(payload);
      const result = await client.post<SiteUserCreatedDto, CreateSiteUserDto>("/api/v1/site-users", request);
      return {
        temporaryPassword: result.temporaryPassword,
        user: mapSiteUser(result.user),
      };
    },
    async updateUser(userId: string, payload: SiteUserFormPayload) {
      const request = mapCreateRequest(payload);
      const result = await client.put<SiteUserDto, UpdateSiteUserDto>(`/api/v1/site-users/${userId}`, request);
      return mapSiteUser(result);
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
    login: payload.login.trim(),
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
    recentSessions: user.lastLoginAt ? [formatDateTime(user.lastLoginAt)] : [],
  };
}

function mapRoleLabel(roleCode: string): SiteUser["role"] {
  if (roleCode === "admin") return "Администратор";
  if (roleCode === "auditor") return "Аудитор";
  if (roleCode === "manager") return "Руководитель";
  return "Оператор";
}

function mapRoleCode(role: SiteUser["role"]) {
  if (role === "Администратор") return "admin";
  if (role === "Аудитор") return "auditor";
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
  if (!value) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU");
}
