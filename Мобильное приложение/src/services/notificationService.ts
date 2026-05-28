import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { listNotifications, markNotificationRead, registerPushToken } from "@/api/notificationApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { getAccessToken } from "@/auth/tokenStorage";
import {
  markLocalNotificationRead,
  saveDevicePushToken,
  saveNotifications
} from "@/db/repositories/notificationRepository";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function registerPushNotifications() {
  const pushToken = await getDevicePushTokenSafe({ requestPermission: true });
  if (!pushToken) {
    return null;
  }

  const deviceId = await getOrCreateDeviceId();
  const result = await registerPushToken({ deviceId, pushToken });
  await saveDevicePushToken(deviceId, pushToken);

  return result;
}

export async function refreshPushRegistrationIfAllowed() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return null;
  }

  const pushToken = await getDevicePushTokenSafe({ requestPermission: false });
  if (!pushToken) {
    return null;
  }

  const deviceId = await getOrCreateDeviceId();
  const result = await registerPushToken({ deviceId, pushToken });
  await saveDevicePushToken(deviceId, pushToken);

  return result;
}

export async function syncMobileNotifications() {
  const notifications = await listNotifications(false);
  await saveNotifications(notifications);
  return notifications;
}

export async function markMobileNotificationRead(notificationId: string) {
  const notification = await markNotificationRead(notificationId);
  await markLocalNotificationRead(notificationId, notification.readAt ?? new Date().toISOString());
  return notification;
}

export function subscribeToMobilePushEvents({
  onNotification,
  onNotificationResponse
}: {
  onNotification: () => void;
  onNotificationResponse: (response: Notifications.NotificationResponse) => void;
}) {
  const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
    onNotification();
  });
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    onNotificationResponse(response);
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

async function getDevicePushTokenSafe({ requestPermission }: { requestPermission: boolean }) {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("patrol360", {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Patrol360"
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    const finalPermission = permission.granted || !requestPermission
      ? permission
      : await Notifications.requestPermissionsAsync();
    if (!finalPermission.granted) {
      return null;
    }

    const token = await Notifications.getDevicePushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}
