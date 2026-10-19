import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { withOwnerExclusiveTransactionAsync } from "@/db/ownerTransaction";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { MobileNotificationDto } from "@/domain/patrol/patrolTypes";
import { mergeNotificationReadState } from "@/services/notificationReadState";

export async function saveDevicePushToken(deviceId: string, pushToken: string, context?: DataOwnerContext) {
  const scope = context ?? await captureDataOwnerContext();
  await assertDataOwnerContext(scope);
  const db = await getDatabase();
  await withSqliteBusyRetry(() => withOwnerExclusiveTransactionAsync(db, scope, tx =>
    tx.runAsync("UPDATE devices SET push_token = ? WHERE device_id = ? AND push_token IS NOT ?", [pushToken, deviceId, pushToken])));
}

export async function saveNotifications(notifications: MobileNotificationDto[], context?: DataOwnerContext) {
  const scope = context ?? await captureDataOwnerContext();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  if (notifications.length === 0) return false;

  const db = await getDatabase();
  return withSqliteBusyRetry(() =>
    withOwnerExclusiveTransactionAsync(db, scope, async (tx) => {
    const localById = new Map<string, MobileNotificationDto & { readSyncPending: number }>();
    for (let offset = 0; offset < notifications.length; offset += 200) {
      const ids = notifications.slice(offset, offset + 200).map(item => item.id);
      const localRows = await tx.getAllAsync<MobileNotificationDto & { readSyncPending: number }>(
        `SELECT notification_id AS id, notification_type AS type, title, message,
          entity_type AS entityType, entity_id AS entityId, created_at AS createdAt,
          read_at AS readAt, read_sync_pending AS readSyncPending
         FROM mobile_notifications WHERE owner_user_id = ? AND notification_id IN (${ids.map(() => "?").join(",")})`,
        [ownerUserId, ...ids]
      );
      for (const row of localRows) localById.set(row.id, row);
    }
    let changed = false;
    for (const notification of notifications) {
      const local = localById.get(notification.id);
      const mergedReadState = mergeNotificationReadState(
        {
          readAt: local?.readAt ?? null,
          readSyncPending: (local?.readSyncPending ?? 0) === 1
        },
        notification.readAt
      );
      if (local && local.type === notification.type && local.title === notification.title && local.message === notification.message
          && local.entityType === notification.entityType && local.entityId === notification.entityId && local.createdAt === notification.createdAt
          && local.readAt === mergedReadState.readAt && Boolean(local.readSyncPending) === mergedReadState.readSyncPending) continue;

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
      changed = true;
    }
    return changed;
    })
  );
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

export async function markLocalNotificationRead(notificationId: string, readAt: string, readSyncPending = true, context?: DataOwnerContext) {
  const scope = context ?? await captureDataOwnerContext();
  await assertDataOwnerContext(scope);

  const db = await getDatabase();
  await withSqliteBusyRetry(() => withOwnerExclusiveTransactionAsync(db, scope, tx => tx.runAsync(
    "UPDATE mobile_notifications SET read_at = ?, read_sync_pending = ? WHERE notification_id = ? AND owner_user_id = ?",
    [readAt, readSyncPending ? 1 : 0, notificationId, scope.ownerUserId]
  )));
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

export async function countUnreadNotifications(context?: DataOwnerContext) {
  const scope = context ?? await captureDataOwnerContext();
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM mobile_notifications WHERE owner_user_id = ? AND read_at IS NULL",
    [scope.ownerUserId]
  );
  await assertDataOwnerContext(scope);
  return row?.count ?? 0;
}

/**
 * Marks every unread notification of the owner as read on the phone and leaves
 * each one pending delivery, exactly like a single local read. Returns the ids
 * that changed so the caller can acknowledge them on the server.
 */
export async function markAllLocalNotificationsRead(readAt: string, context?: DataOwnerContext) {
  const scope = context ?? await captureDataOwnerContext();
  await assertDataOwnerContext(scope);
  const db = await getDatabase();
  return withSqliteBusyRetry(() => withOwnerExclusiveTransactionAsync(db, scope, async tx => {
    const rows = await tx.getAllAsync<{ notificationId: string }>(
      "SELECT notification_id AS notificationId FROM mobile_notifications WHERE owner_user_id = ? AND read_at IS NULL ORDER BY created_at DESC",
      [scope.ownerUserId]
    );
    if (rows.length === 0) return [];
    await tx.runAsync(
      "UPDATE mobile_notifications SET read_at = ?, read_sync_pending = 1 WHERE owner_user_id = ? AND read_at IS NULL",
      [readAt, scope.ownerUserId]
    );
    return rows.map(row => row.notificationId);
  }));
}
