import type { MobileAccount, MobileAccountSecurityEvent, MobileAccountSession } from "../../types";

export function accountInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "АК";
}

export function accountBindingLabel(account: MobileAccount) {
  return account.employeeScope === "all" ? "Все сотрудники" : `${account.boundEmployees.length} из 5 сотрудников`;
}

export function accountTime(value?: string | null) {
  if (!value || value === "-") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function isSessionOnline(status: string) {
  return ["online", "онлайн"].includes(status.trim().toLowerCase());
}

// An unclosed refresh session is not proof that the device is currently online.
export function isSessionUnfinished(session: MobileAccountSession) {
  if (session.endedAt) return false;
  const state = session.status.trim().toLowerCase();
  return !["вышел", "завершена", "завершено", "ended", "revoked", "expired", "истекла", "отозвана"].includes(state);
}

export function newestSessions(sessions: MobileAccountSession[]) {
  return [...sessions].sort((left, right) => timestamp(right.lastSeenAt || right.startedAt) - timestamp(left.lastSeenAt || left.startedAt));
}

export function accountDevices(sessions: MobileAccountSession[]) {
  const devices = new Map<string, MobileAccountSession>();
  for (const session of newestSessions(sessions)) {
    // Never collapse two real device IDs merely because their model names match.
    const key = session.deviceId || (session.device ? `${session.device}|${session.platform}` : session.id);
    if (!devices.has(key)) devices.set(key, session);
  }
  return [...devices.values()];
}

export function newestEvents(events: MobileAccountSecurityEvent[]) {
  return [...events].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function accountEventTitle(event: MobileAccountSecurityEvent) {
  const type = event.eventType.toLowerCase().replace(/[._-]+/g, " ");
  if (type.includes("employee attached")) return "Сотрудник привязан";
  if (type.includes("employee detached")) return "Сотрудник отвязан";
  if (type.includes("login")) return /fail|denied|reject/.test(type) ? "Вход отклонён" : "Вход в приложение";
  if (type.includes("logout")) return "Выход из приложения";
  if (type.includes("password") || type.includes("reset")) return "Пароль изменён";
  if (type.includes("unblock")) return "Доступ восстановлен";
  if (type.includes("block")) return "Доступ заблокирован";
  if (type.includes("create")) return "Аккаунт создан";
  if (type.includes("updated")) return "Аккаунт изменён";
  if (type.includes("deleted")) return "Аккаунт удалён";
  return "Событие доступа";
}
