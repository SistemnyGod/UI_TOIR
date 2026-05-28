import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { MobileNotificationDto } from "@/domain/patrol/patrolTypes";

export async function saveDevicePushToken(deviceId: string, pushToken: string) {
  const db = await getDatabase();
  await db.runAsync("UPDATE devices SET push_token = ? WHERE device_id = ?", [pushToken, deviceId]);
}

export async function saveNotifications(notifications: MobileNotificationDto[]) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return;
  }

  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const notification of notifications) {
      await tx.runAsync(
        `
          INSERT INTO mobile_notifications (
            notification_id,
            owner_user_id,
            notification_type,
            title,
            message,
            entity_type,
            entity_id,
            created_at,
            read_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(notification_id) DO UPDATE SET
            notification_type = excluded.notification_type,
            title = excluded.title,
            message = excluded.message,
            entity_type = excluded.entity_type,
            entity_id = excluded.entity_id,
            created_at = excluded.created_at,
            read_at = excluded.read_at
        `,
        [
          notification.id,
          ownerUserId,
          notification.type,
          notification.title,
          notification.message,
          notification.entityType,
          notification.entityId,
          notification.createdAt,
          notification.readAt
        ]
      );
    }
  });
}

export async function listLocalNotifications(limit = 5) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const db = await getDatabase();
  return db.getAllAsync<MobileNotificationDto>(
    `
      SELECT
        notification_id AS id,
        notification_type AS type,
        title,
        message,
        entity_type AS entityType,
        entity_id AS entityId,
        created_at AS createdAt,
        read_at AS readAt
      FROM mobile_notifications
      WHERE owner_user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    [ownerUserId, limit]
  );
}

export async function markLocalNotificationRead(notificationId: string, readAt: string) {
  const db = await getDatabase();
  await db.runAsync("UPDATE mobile_notifications SET read_at = ? WHERE notification_id = ?", [readAt, notificationId]);
}
