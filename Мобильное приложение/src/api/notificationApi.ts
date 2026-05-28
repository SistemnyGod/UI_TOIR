import { mobileRequest } from "@/api/httpClient";
import { MobileNotificationDto } from "@/domain/patrol/patrolTypes";

export type RegisterPushTokenRequest = {
  deviceId: string;
  pushToken: string;
};

export type RegisterPushTokenResponse = {
  deviceId: string;
  pushEnabled: boolean;
  registeredAt: string;
};

export function registerPushToken(payload: RegisterPushTokenRequest) {
  return mobileRequest<RegisterPushTokenResponse>("/api/v1/mobile/devices/push-token", {
    method: "POST",
    body: payload
  });
}

export function listNotifications(unreadOnly = false) {
  return mobileRequest<MobileNotificationDto[]>(`/api/v1/mobile/notifications?unreadOnly=${unreadOnly ? "true" : "false"}`);
}

export function markNotificationRead(notificationId: string) {
  return mobileRequest<MobileNotificationDto>(`/api/v1/mobile/notifications/${notificationId}/read`, {
    method: "POST"
  });
}
