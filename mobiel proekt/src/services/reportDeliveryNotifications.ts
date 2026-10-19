import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { ReportNotice } from "@/domain/reporting/reportNoticePolicy";

const channelId = "patrol360-reports";
const reminderIdentifierPrefix = "patrol360.report.autoSubmitReminder.";
const sentNoticesKey = "patrol360.reportDeliveryNotices.v1";
let channelReady: Promise<void> | null = null;

/** Report notices are shown on the lock screen: they carry no personal data. */
function ensureReportChannel() {
  if (Platform.OS !== "android") return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(channelId, {
    name: "Отчёты обхода",
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 250, 250, 250]
  }).then(() => undefined).catch((error) => {
    channelReady = null;
    throw error;
  });
  return channelReady;
}

async function present(identifier: string, title: string, body: string, data: Record<string, string>) {
  await ensureReportChannel();
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, data, sound: true },
    trigger: Platform.OS === "android" ? { channelId } : null
  });
}

function routeLabel(routeName: string | null) {
  return routeName?.trim() ? `«${routeName.trim()}»` : "обхода";
}

export async function scheduleAutoSubmitReminder(assignmentId: string, routeName: string | null, inMs: number, minutesLeft: number) {
  await ensureReportChannel();
  const seconds = Math.max(1, Math.round(inMs / 1000));
  await Notifications.scheduleNotificationAsync({
    identifier: reminderIdentifierPrefix + assignmentId,
    content: {
      title: "Отчёт не отправлен",
      body: `Все точки ${routeLabel(routeName)} заполнены. Через ${minutesLeft} мин. отчёт отправится сам — проверьте его сейчас.`,
      data: { entityType: "patrolAssignment", entityId: assignmentId },
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      ...(Platform.OS === "android" ? { channelId } : {})
    }
  });
}

export async function cancelAutoSubmitReminder(assignmentId: string) {
  const identifier = reminderIdentifierPrefix + assignmentId;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
  await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
}

export function notifyReportAutoSent(assignmentId: string, routeName: string | null) {
  return present(
    `patrol360.report.autoSent.${assignmentId}`,
    "Отчёт отправлен автоматически",
    `Отчёт ${routeLabel(routeName)} принят сервером. Все точки были заполнены, но отчёт не отправили вручную.`,
    { entityType: "patrolAssignment", entityId: assignmentId }
  );
}

export function presentReportNotice(notice: ReportNotice) {
  const identifier = `patrol360.report.${notice.kind}.${notice.clientOperationId}`;
  switch (notice.kind) {
    case "savedOffline":
      return present(identifier, "Нет сети — отчёт сохранён",
        `Отчёт ${routeLabel(notice.routeName)} хранится на телефоне и уйдёт сам, как только появится связь.`,
        { entityType: "patrolAssignment", entityId: notice.assignmentId });
    case "loginRequired":
      return present(identifier, "Войдите, чтобы отправить отчёт",
        `Сессия истекла. Отчёт ${routeLabel(notice.routeName)} сохранён и отправится сразу после входа.`,
        { entityType: "patrolAssignment", entityId: notice.assignmentId });
    case "needsDecision":
      return present(identifier, "Нужно решение",
        `Сервер не принял отчёт ${routeLabel(notice.routeName)}. Автоматический повтор не поможет — откройте очередь отправки.`,
        { entityType: "syncConflict", entityId: notice.clientOperationId });
  }
}

export async function readSentReportNotices(): Promise<Record<string, ReportNotice["kind"]>> {
  try {
    const value = await SecureStore.getItemAsync(sentNoticesKey);
    const parsed: unknown = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, ReportNotice["kind"]> : {};
  } catch {
    return {};
  }
}

export async function saveSentReportNotices(sent: Record<string, ReportNotice["kind"]>) {
  await SecureStore.setItemAsync(sentNoticesKey, JSON.stringify(sent));
}
