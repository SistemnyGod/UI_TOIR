import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { listNotifications, markNotificationRead, registerPushToken } from "@/api/notificationApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { getAccessToken } from "@/auth/tokenStorage";
import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { emitSyncEvent } from "@/sync/syncEvents";
import { createNotificationIdWindow, readNotificationData } from "./notificationPresentation";
import { createScopedSingleFlight } from "./scopedSingleFlight";
import {
  listPendingNotificationReads,
  markAllLocalNotificationsRead,
  markLocalNotificationRead,
  saveDevicePushToken,
  saveNotifications
} from "@/db/repositories/notificationRepository";

const foregroundPresentations = createNotificationIdWindow();
const registrationFlight = createScopedSingleFlight<Awaited<ReturnType<typeof registerPushToken>>>();
const notificationFlight = createScopedSingleFlight<Awaited<ReturnType<typeof listNotifications>>>();
const registrationLifetimeMs = 30 * 60_000;
let lastRegistration: { key: string; at: number; result: Awaited<ReturnType<typeof registerPushToken>> } | null = null;
const ownerKey = (context: DataOwnerContext) => JSON.stringify([context.ownerUserId, context.contourId, context.generation]);

async function ensurePushRegistration(context: DataOwnerContext, pushToken: string) {
  const deviceId = await getOrCreateDeviceId();
  await assertDataOwnerContext(context);
  const key = JSON.stringify([ownerKey(context), deviceId, pushToken]);
  if (lastRegistration?.key === key && Date.now() - lastRegistration.at < registrationLifetimeMs) return lastRegistration.result;
  return registrationFlight(key, async () => {
    await assertDataOwnerContext(context);
    const result = await registerPushToken({ deviceId, pushToken });
    await assertDataOwnerContext(context);
    await saveDevicePushToken(deviceId, pushToken, context);
    await assertDataOwnerContext(context);
    lastRegistration = { key, at: Date.now(), result };
    return result;
  });
}
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const content = notification.request.content;
    const data = readNotificationData(content.data);
    // A genuinely headless transport message has no visible content. Its task
    // may create a local alert; do not display a blank transport alert first.
    const hasContent = Boolean(content.title?.trim() || content.body?.trim());
    const show = hasContent && foregroundPresentations.claim(data.notificationId || data.tag || notification.request.identifier);
    return {
      shouldPlaySound: show,
      shouldSetBadge: false,
      shouldShowBanner: show,
      shouldShowList: show
    };
  }
});

export async function registerPushNotifications() {
  const context = await captureDataOwnerContext();
  const pushToken = await getDevicePushTokenSafe({ requestPermission: true });
  if (!pushToken) {
    return null;
  }

  return ensurePushRegistration(context, pushToken);
}

export async function refreshPushRegistrationIfAllowed() {
  const context = await captureDataOwnerContext();
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return null;
  }

  const pushToken = await getDevicePushTokenSafe({ requestPermission: false });
  if (!pushToken) {
    return null;
  }

  return ensurePushRegistration(context, pushToken);
}

export async function syncMobileNotifications() {
  const context = await captureDataOwnerContext();
  return notificationFlight(ownerKey(context), () => syncMobileNotificationsForOwner(context));
}

async function syncMobileNotificationsForOwner(context: DataOwnerContext) {
  await assertDataOwnerContext(context);
  const notifications = await listNotifications(false);
  await assertDataOwnerContext(context);
  let changed = await saveNotifications(notifications, context) !== false;
  const pendingReads = await listPendingNotificationReads();
  for (const pendingRead of pendingReads) {
    await assertDataOwnerContext(context);
    try {
      const updated = await markNotificationRead(pendingRead.notificationId);
      await markLocalNotificationRead(
        pendingRead.notificationId,
        updated.readAt ?? pendingRead.readAt,
        false,
        context
      );
      changed = true;
    } catch {
      // Keep the local read marker and retry on the next connected refresh.
    }
  }
  await assertDataOwnerContext(context);
  if (changed) emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [], refreshedZones: ['notifications'] });
  return notifications;
}

export async function markMobileNotificationRead(notificationId: string) {
  const context = await captureDataOwnerContext();
  const localReadAt = new Date().toISOString();
  await markLocalNotificationRead(notificationId, localReadAt, true, context);
  await assertDataOwnerContext(context);
  emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [], refreshedZones: ['notifications'] });
  const notification = await markNotificationRead(notificationId);
  await markLocalNotificationRead(notificationId, notification.readAt ?? localReadAt, false, context);
  return notification;
}

export type MarkAllNotificationsResult = { marked: number; delivered: number; pending: number };

/**
 * "Прочитать все". The server has no bulk endpoint, so every notification is
 * acknowledged through the same per-item read endpoint as a single tap. The
 * local read is committed first; reads that cannot be delivered stay
 * read_sync_pending and are retried by syncMobileNotifications.
 */
export async function markAllMobileNotificationsRead(): Promise<MarkAllNotificationsResult> {
  const context = await captureDataOwnerContext();
  const localReadAt = new Date().toISOString();
  const ids = await markAllLocalNotificationsRead(localReadAt, context);
  await assertDataOwnerContext(context);
  if (ids.length === 0) return { marked: 0, delivered: 0, pending: 0 };
  emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [], refreshedZones: ['notifications'] });
  let delivered = 0;
  for (const notificationId of ids) {
    await assertDataOwnerContext(context);
    try {
      const notification = await markNotificationRead(notificationId);
      await markLocalNotificationRead(notificationId, notification.readAt ?? localReadAt, false, context);
      delivered++;
    } catch {
      // Without a connection every further request would wait for its own
      // timeout. Leave the rest pending for the next connected refresh, but
      // do not report a changed session as a delivery problem.
      await assertDataOwnerContext(context);
      break;
    }
  }
  return { marked: ids.length, delivered, pending: ids.length - delivered };
}

export function subscribeToMobilePushEvents({
  onNotification,
  onNotificationResponse
}: {
  onNotification: () => void;
  onNotificationResponse: (response: Notifications.NotificationResponse) => void;
}) {
  let active = true;
  let lastResponseId: string | null = null;
  const handleResponse = (response: Notifications.NotificationResponse) => {
    if (!active) return;
    const responseId = response.notification.request.identifier;
    if (responseId === lastResponseId) {
      return;
    }
    lastResponseId = responseId;
    onNotificationResponse(response);
  };

  const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
    if (active) onNotification();
  });
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleResponse(response);
  });

  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) {
        handleResponse(response);
      }
    })
    .catch(() => {
      // A missing or unavailable cold-start response must not block app startup.
    });

  return () => {
    active = false;
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

let pendingDevicePushToken: ReturnType<typeof Notifications.getDevicePushTokenAsync> | null = null;

async function getDevicePushTokenSafe(options: { requestPermission: boolean }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      acquireDevicePushToken(options),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 5000); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function acquireDevicePushToken({ requestPermission }: { requestPermission: boolean }) {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("patrol360", {
        importance: Notifications.AndroidImportance.HIGH,
        name: "Patrol360",
        vibrationPattern: [0, 250, 250, 250]
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    const finalPermission = permission.granted || !requestPermission
      ? permission
      : await Notifications.requestPermissionsAsync();
    if (!finalPermission.granted) {
      return null;
    }

    // Reuse a pending native request even after the caller's deadline expires.
    // Its late result is only a token; registration still checks the account.
    if (!pendingDevicePushToken) {
      const request = Notifications.getDevicePushTokenAsync();
      pendingDevicePushToken = request;
      void request.finally(() => {
        if (pendingDevicePushToken === request) pendingDevicePushToken = null;
      }).catch(() => undefined);
    }
    const token = await pendingDevicePushToken;
    return token.data;
  } catch {
    return null;
  }
}
