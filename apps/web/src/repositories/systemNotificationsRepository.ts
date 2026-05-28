import { ApiClient } from "../api/client";
import type { SystemNotificationDto } from "../api/contracts";
import { getStoredSessionToken } from "./sessionRepository";

export interface SystemNotificationsRepository {
  list(limit?: number): Promise<SystemNotificationDto[]>;
}

export function createSystemNotificationsRepository({ baseUrl }: { baseUrl?: string } = {}): SystemNotificationsRepository {
  const client = new ApiClient({ baseUrl, getAuthToken: getStoredSessionToken });

  return {
    list(limit = 20) {
      return client.get<SystemNotificationDto[]>(`/api/v1/system-notifications?limit=${limit}`);
    },
  };
}
