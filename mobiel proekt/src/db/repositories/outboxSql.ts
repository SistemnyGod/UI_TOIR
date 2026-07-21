import * as SQLite from "expo-sqlite";

import { currentContourId } from "@/core/environments";
import { OutboxCommand } from "@/domain/sync/syncTypes";

export type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;

export async function insertOutboxCommandInTransaction(executor: SqlExecutor, command: OutboxCommand) {
  await executor.runAsync(
    `
      INSERT INTO outbox_commands (
        client_operation_id,
        owner_user_id,
        contour_id,
        command_type,
        entity_type,
        entity_local_id,
        entity_server_id,
        payload_json,
        created_at_local,
        updated_at_local,
        attempt_count,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      command.clientOperationId,
      command.ownerUserId,
      command.contourId ?? currentContourId,
      command.commandType,
      command.entityType,
      command.entityLocalId ?? null,
      command.entityServerId ?? null,
      JSON.stringify(command.payload),
      command.createdAtLocal,
      command.createdAtLocal,
      command.attemptCount,
      command.status
    ]
  );
}

export async function updatePendingCompleteReportBaseRevisionInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  baseRevision: number
) {
  const commands = await tx.getAllAsync<{
    client_operation_id: string;
    payload_json: string;
  }>(
    `
      SELECT client_operation_id, payload_json
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND command_type = 'completePatrolAssignment'
        AND entity_local_id = ?
        AND status IN ('pending', 'retryLater')
    `,
    [ownerUserId, currentContourId, assignmentId]
  );

  for (const command of commands) {
    try {
      const payload = JSON.parse(command.payload_json) as Record<string, unknown>;
      payload.baseRevision = baseRevision;
      await tx.runAsync(
        "UPDATE outbox_commands SET payload_json = ?, updated_at_local = ? WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
        [JSON.stringify(payload), new Date().toISOString(), ownerUserId, currentContourId, command.client_operation_id]
      );
    } catch {
      // The report command will be rejected by its normal payload validation;
      // never replace an unreadable payload with a partial one.
    }
  }
}