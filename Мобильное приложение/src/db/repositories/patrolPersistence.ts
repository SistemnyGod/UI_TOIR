import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { getDatabase } from "@/db/database";
import type { PointListItem } from "@/db/repositories/patrolRepository";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";

export type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

export async function updateLatestPendingMarkPhotoPayloadInTransaction(
  executor: SqlExecutor,
  assignmentId: string,
  pointId: string,
  photoClientFileIds: string[]
) {
  const command = await executor.getFirstAsync<{
    client_operation_id: string;
    payload_json: string;
  }>(
    `
      SELECT client_operation_id, payload_json
      FROM outbox_commands
      WHERE entity_local_id = ?
        AND command_type IN ('markPatrolPointOk', 'markPatrolPointIssue')
        AND status IN ('pending', 'retryLater')
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [pointId]
  );

  if (!command) {
    return;
  }

  const payload = JSON.parse(command.payload_json) as Record<string, unknown>;
  if (payload.assignmentId !== assignmentId || payload.pointId !== pointId) {
    return;
  }

  await executor.runAsync(
    `
      UPDATE outbox_commands
      SET payload_json = ?,
          updated_at_local = ?
      WHERE client_operation_id = ?
    `,
    [
      JSON.stringify({
        ...payload,
        photoClientFileIds
      }),
      new Date().toISOString(),
      command.client_operation_id
    ]
  );
}

export async function supersedePendingPointStatusCommands(
  executor: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  pointId: string
) {
  const commands = await executor.getAllAsync<{
    clientOperationId: string;
    payloadJson: string;
  }>(
    `
      SELECT
        client_operation_id AS clientOperationId,
        payload_json AS payloadJson
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND entity_local_id = ?
        AND command_type IN ('markPatrolPointOk', 'markPatrolPointIssue')
        AND status IN ('pending', 'retryLater')
    `,
    [ownerUserId, pointId]
  );
  const supersededIds = commands
    .filter((command) => {
      try {
        const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
        return payload.assignmentId === assignmentId && payload.pointId === pointId;
      } catch {
        return false;
      }
    })
    .map((command) => command.clientOperationId);

  if (supersededIds.length === 0) {
    return;
  }

  const placeholders = supersededIds.map(() => "?").join(", ");
  await executor.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'superseded',
          last_error = NULL,
          updated_at_local = ?
      WHERE client_operation_id IN (${placeholders})
        AND status IN ('pending', 'retryLater')
    `,
    [new Date().toISOString(), ...supersededIds]
  );
}

export async function upsertPointResult(input: {
  ownerUserId: string;
  assignmentId: string;
  pointId: string;
  status: PointListItem["status"];
  comment: string | null;
  issueTypeId: string | null;
  severity: string | null;
  deferredReason: string | null;
  completedAtLocal: string | null;
  syncStatus: string;
    confirmationType: "nfc" | "qr" | "manual" | null;
  nfcUidHash: string | null;
  scannedAtLocal: string | null;
  photoClientFileIds: string[];
}) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() => upsertPointResultInTransaction(db, input));
}

export async function upsertPointResultInTransaction(executor: SqlExecutor, input: {
  ownerUserId: string;
  assignmentId: string;
  pointId: string;
  status: PointListItem["status"];
  comment: string | null;
  issueTypeId: string | null;
  severity: string | null;
  deferredReason: string | null;
  completedAtLocal: string | null;
  syncStatus: string;
  confirmationType: "nfc" | "qr" | "manual" | null;
  nfcUidHash: string | null;
  scannedAtLocal: string | null;
  photoClientFileIds: string[];
}) {
  const existing = await executor.getFirstAsync<{ localResultId: string }>(
    `
      SELECT local_result_id AS localResultId
      FROM point_results
      WHERE owner_user_id = ?
        AND assignment_id = ?
        AND point_id = ?
      LIMIT 1
    `,
    [input.ownerUserId, input.assignmentId, input.pointId]
  );
  const localResultId = existing?.localResultId ?? Crypto.randomUUID();

  await executor.runAsync(
    `
      INSERT OR REPLACE INTO point_results (
        local_result_id,
        owner_user_id,
        assignment_id,
        point_id,
        status,
        comment,
        issue_type_id,
        severity,
        deferred_reason,
        completed_at_local,
        sync_status,
        confirmation_type,
        nfc_uid_hash,
        scanned_at_local,
        photo_client_file_ids_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      localResultId,
      input.ownerUserId,
      input.assignmentId,
      input.pointId,
      input.status,
      input.comment,
      input.issueTypeId,
      input.severity,
      input.deferredReason,
      input.completedAtLocal,
      input.syncStatus,
      input.confirmationType,
      input.nfcUidHash,
      input.scannedAtLocal,
      JSON.stringify(input.photoClientFileIds)
    ]
  );
}

export function parseStringArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
