import { siteUsers } from "../data";
import type { SiteUser } from "../types";

export const siteUsersFallback = siteUsers;

export const roleDescriptions: Array<{ role: SiteUser["role"]; description: string }> = [
  { role: "Администратор", description: "Полный доступ ко всем модулям и настройкам." },
  { role: "Оператор", description: "Работа с обходами, назначениями и результатами." },
  { role: "Руководитель", description: "Просмотр отчетов, аналитика, управление командой." },
  { role: "Аудитор", description: "Только чтение, аудит и экспорт данных." },
];

export function findSiteUser(users: SiteUser[], userId: string) {
  return users.find((item) => item.id === userId);
}

export function countUsersByRole(users: SiteUser[], role: SiteUser["role"]) {
  return users.filter((user) => user.role === role).length;
}
