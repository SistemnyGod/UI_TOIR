import { mobileRequest } from "@/api/httpClient";
import { notificationListResponseSchema, notificationSchema, registerPushTokenResponseSchema } from "@/api/schemas";
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
  return mobileRequest<RegisterPushTokenResponse>("/api/v1/mobile/devices/push-token", registerPushTokenResponseSchema, {
    method: "POST",
    body: payload
  });
}

export function listNotifications(unreadOnly = false) {
  return mobileRequest<MobileNotificationDto[]>(
    `/api/v1/mobile/notifications?unreadOnly=${unreadOnly ? "true" : "false"}`,
    notificationListResponseSchema
  );
}

export function markNotificationRead(notificationId: string) {
  return mobileRequest<MobileNotificationDto>(
    `/api/v1/mobile/notifications/${notificationId}/read`,
    notificationSchema,
    { method: "POST" }
  );
}
