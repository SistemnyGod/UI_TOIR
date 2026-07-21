import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { MobileNotificationDto } from "@/domain/patrol/patrolTypes";
import { mergeNotificationReadState } from "@/services/notificationReadState";

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
      const local = await tx.getFirstAsync<{ read_at: string | null; read_sync_pending: number }>(
        `
          SELECT read_at, read_sync_pending
          FROM mobile_notifications
          WHERE notification_id = ? AND owner_user_id = ?
        `,
        [notification.id, ownerUserId]
      );
      const mergedReadState = mergeNotificationReadState(
        {
          readAt: local?.read_at ?? null,
          readSyncPending: (local?.read_sync_pending ?? 0) === 1
        },
        notification.readAt
      );

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
            read_at,
            read_sync_pending
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(notification_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            notification_type = excluded.notification_type,
            title = excluded.title,
            message = excluded.message,
            entity_type = excluded.entity_type,
            entity_id = excluded.entity_id,
            created_at = excluded.created_at,
            read_at = excluded.read_at,
            read_sync_pending = excluded.read_sync_pending
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
          mergedReadState.readAt,
          mergedReadState.readSyncPending ? 1 : 0
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

export async function markLocalNotificationRead(notificationId: string, readAt: string, readSyncPending = true) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    "UPDATE mobile_notifications SET read_at = ?, read_sync_pending = ? WHERE notification_id = ? AND owner_user_id = ?",
    [readAt, readSyncPending ? 1 : 0, notificationId, ownerUserId]
  );
}

export async function listPendingNotificationReads() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const db = await getDatabase();
  return db.getAllAsync<{ notificationId: string; readAt: string }>(
    `
      SELECT
        notification_id AS notificationId,
        read_at AS readAt
      FROM mobile_notifications
      WHERE owner_user_id = ?
        AND read_sync_pending = 1
        AND read_at IS NOT NULL
    `,
    [ownerUserId]
  );
}
