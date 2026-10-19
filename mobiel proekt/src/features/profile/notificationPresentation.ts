import type { MobileNotificationDto } from "@/domain/patrol/patrolTypes";
export function notificationPath(notification: Pick<MobileNotificationDto, "entityType" | "entityId">) {
  const type = notification.entityType?.toLowerCase() ?? "";
  if (type.includes("report")) return "/settings/sync-queue";
  if (notification.entityId && type.includes("request")) return `/patrol/request/${notification.entityId}`;
  if (notification.entityId && (type.includes("assignment") || type.includes("patrol"))) return `/patrol/assignment/${notification.entityId}`;
  return null;
}
export function notificationDay(value: string, now = new Date()) {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "Дата неизвестна";
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU");
}
