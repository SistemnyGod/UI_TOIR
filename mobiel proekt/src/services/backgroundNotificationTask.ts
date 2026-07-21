import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { initializeDatabase } from "@/db/database";
import { refreshMobileData } from "@/services/mobileDataRefreshService";

export const PATROL360_BACKGROUND_NOTIFICATION_TASK = "patrol360-background-notification";

if (!TaskManager.isTaskDefined(PATROL360_BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    PATROL360_BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }

      const payload = isNotificationResponse(data) ? data.notification.request.content.data : data;
      try {
        await initializeDatabase();
        const updated = await refreshMobileData();
        if (!isNotificationResponse(data)) {
          await showLocalNotification(payload);
        }
        return updated
          ? Notifications.BackgroundNotificationTaskResult.NewData
          : Notifications.BackgroundNotificationTaskResult.NoData;
      } catch {
        if (!isNotificationResponse(data)) {
          await showLocalNotification(payload).catch(() => undefined);
        }
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

async function showLocalNotification(payload: unknown) {
  const data = asStringRecord(payload);
  const title = data.title || "Patrol360";
  const body = data.body || "Данные обновлены. Откройте приложение для просмотра.";
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        notificationId: data.notificationId ?? "",
        type: data.type ?? "",
        entityType: data.entityType ?? "",
        entityId: data.entityId ?? ""
      },
      sound: true
    },
    trigger: null
  });
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}
