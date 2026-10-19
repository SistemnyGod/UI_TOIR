import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { initializeDatabase } from "@/db/database";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { createNotificationIdWindow, isPresentedByNativeAndroid, readNotificationData } from "./notificationPresentation";

export const PATROL360_BACKGROUND_NOTIFICATION_TASK = "patrol360-background-notification";
const localPresentations = createNotificationIdWindow();

if (!TaskManager.isTaskDefined(PATROL360_BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    PATROL360_BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        await logMobileError("background.notification.payload.failed", error);
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }

      // A tap, or a notification already presented by the OS, only refreshes data.
      // Legacy direct FCM payloads with title/message are presented by Expo on Android.
      if (!isNotificationResponse(data) && data && typeof data === "object" && !data.notification) {
        const payload = readNotificationData(data.data);
        if (!isPresentedByNativeAndroid(data.data, Platform.OS)) {
          await showLocalNotification(payload).catch(error =>
            logMobileError("background.notification.presentation.failed", error));
        }
      }
      try {
        await initializeDatabase();
        const updated = await refreshMobileData();
        return updated
          ? Notifications.BackgroundNotificationTaskResult.NewData
          : Notifications.BackgroundNotificationTaskResult.NoData;
      } catch (error) {
        await logMobileError("background.notification.failed", error);
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }
    }
  );
}

export async function registerBackgroundNotificationTask() {
  const available = await TaskManager.isAvailableAsync();
  if (!available) {
    return { registered: false, reason: "unavailable" as const };
  }

  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(PATROL360_BACKGROUND_NOTIFICATION_TASK);
  if (!alreadyRegistered) {
    await Notifications.registerTaskAsync(PATROL360_BACKGROUND_NOTIFICATION_TASK);
  }

  return { registered: true, reason: null };
}

function isNotificationResponse(
  data: Notifications.NotificationTaskPayload
): data is Notifications.NotificationResponse {
  return typeof data === "object" && data !== null && "actionIdentifier" in data && "notification" in data;
}

async function showLocalNotification(data: Record<string, string>) {
  const notificationId = data.notificationId || data.tag;
  // Silent refreshes and malformed payloads must not produce a generic alert.
  if (!notificationId || !(data.title || data.message || data.body || data.alertTitle || data.alertBody)) return;
  if (!localPresentations.claim(notificationId)) return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
    if (presented.some(notification => notification.request.identifier === notificationId)) return;
    await Notifications.scheduleNotificationAsync({
      identifier: notificationId,
      content: {
        title: data.title || data.alertTitle || "Patrol360",
        body: data.message || data.alertBody || data.body || "Откройте приложение для просмотра.",
        data: {
          notificationId,
          type: data.type ?? "",
          entityType: data.entityType ?? "",
          entityId: data.entityId ?? ""
        },
        sound: true
      },
      trigger: null
    });
  } catch (error) {
    localPresentations.release(notificationId);
    throw error;
  }
}
