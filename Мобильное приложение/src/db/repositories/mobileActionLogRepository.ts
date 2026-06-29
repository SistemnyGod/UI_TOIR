import * as Crypto from "expo-crypto";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";

export type MobileActionLogEvent = {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  message: string;
  payload?: unknown;
};

export type MobileActionLogItem = {
  id: string;
  ownerUserId: string | null;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  message: string;
  payloadJson: string | null;
  createdAtLocal: string;
};

export async function logMobileAction(event: MobileActionLogEvent) {
  const db = await getDatabase();
  const ownerUserId = await getStoredOwnerUserId();
  const createdAtLocal = new Date().toISOString();
  const payloadJson = event.payload === undefined ? null : safeStringify(event.payload);

  await withSqliteBusyRetry(() =>
    db.runAsync(
      `
        INSERT INTO mobile_action_log (
          id,
          owner_user_id,
          event_type,
          entity_type,
          entity_id,
          message,
          payload_json,
          created_at_local
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Crypto.randomUUID(),
        ownerUserId,
        event.eventType,
        event.entityType ?? null,
        event.entityId ?? null,
        event.message,
        payloadJson,
        createdAtLocal
      ]
    )
  );
}

export async function listMobileActionLog(limit = 20): Promise<MobileActionLogItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    owner_user_id: string | null;
    event_type: string;
    entity_type: string | null;
    entity_id: string | null;
    message: string;
    payload_json: string | null;
    created_at_local: string;
  }>(
    `
      SELECT
        id,
        owner_user_id,
        event_type,
        entity_type,
        entity_id,
        message,
        payload_json,
        created_at_local
      FROM mobile_action_log
      ORDER BY created_at_local DESC
      LIMIT ?
    `,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    ownerUserId: row.owner_user_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    message: row.message,
    payloadJson: row.payload_json,
    createdAtLocal: row.created_at_local
  }));
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ value: String(value) });
  }
}
