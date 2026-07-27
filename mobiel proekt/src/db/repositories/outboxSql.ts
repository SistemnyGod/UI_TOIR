import * as SQLite from "expo-sqlite";

import { currentContourId } from "@/core/environments";
import { OutboxCommand } from "@/domain/sync/syncTypes";
import { applyWorkTaskServerRevision } from "@/domain/emu/workTaskRevisionPolicy";
import { getCommandAggregateKey } from "@/sync/outboxOrderingPolicy";

export type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

export async function insertOutboxCommandInTransaction(executor: SqlExecutor, command: OutboxCommand) {
  const contourId = command.contourId ?? currentContourId;
  const aggregateKey = command.aggregateKey ?? getCommandAggregateKey(command) ?? `operation:${command.clientOperationId}`;
  const nextSequenceRow = await executor.getFirstAsync<{ nextSequence: number }>(
    "SELECT COALESCE(MAX(sequence_no), 0) + 1 AS nextSequence FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND aggregate_key IS ?",
    [command.ownerUserId, contourId, aggregateKey ?? null]
  );
  const sequenceNo = command.sequenceNo ?? nextSequenceRow?.nextSequence ?? 1;

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
        aggregate_key,
        sequence_no,
        attempt_count,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      command.clientOperationId,
      command.ownerUserId,
      contourId,
      command.commandType,
      command.entityType,
      command.entityLocalId ?? null,
      command.entityServerId ?? null,
      JSON.stringify(command.payload),
      command.createdAtLocal,
      command.createdAtLocal,
      aggregateKey,
      sequenceNo,
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

export async function updatePendingWorkTaskRevisionInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  taskLocalId: string,
  serverRevision: number | null,
  serverEntityId: string | null
) {
  if (serverRevision === null && !serverEntityId) {
    return;
  }

  const rows = await tx.getAllAsync<{
    client_operation_id: string;
    command_type: OutboxCommand["commandType"];
    status: OutboxCommand["status"];
    entity_server_id: string | null;
    payload_json: string;
  }>(
    `
      SELECT client_operation_id, command_type, status, entity_server_id, payload_json
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND entity_type = 'workTask'
        AND entity_local_id = ?
        AND status IN ('pending', 'retryLater')
    `,
    [ownerUserId, currentContourId, taskLocalId]
  );

  const parsedCommands: {
    row: (typeof rows)[number];
    command: {
      commandType: OutboxCommand["commandType"];
      status: OutboxCommand["status"];
      entityServerId: string | null;
      payload: Record<string, unknown>;
    };
  }[] = [];
  for (const row of rows) {
    try {
      parsedCommands.push({
        row,
        command: {
          commandType: row.command_type,
          status: row.status,
          entityServerId: row.entity_server_id,
          payload: JSON.parse(row.payload_json) as Record<string, unknown>
        }
      });
    } catch {
      // Preserve malformed commands for their normal validation path.
    }
  }
  const updated = applyWorkTaskServerRevision(
    parsedCommands.map((item) => item.command),
    serverRevision,
    serverEntityId
  );
  const updatedAtLocal = new Date().toISOString();

  for (let index = 0; index < updated.length; index += 1) {
    const next = updated[index];
    const row = parsedCommands[index]?.row;
    if (!row || next === parsedCommands[index]?.command || next.payload === parsedCommands[index]?.command.payload) {
      continue;
    }
    await tx.runAsync(
      `
        UPDATE outbox_commands
        SET entity_server_id = COALESCE(?, entity_server_id),
            payload_json = ?,
            updated_at_local = ?
        WHERE owner_user_id = ?
          AND contour_id = ?
          AND client_operation_id = ?
          AND status IN ('pending', 'retryLater')
      `,
      [
        next.entityServerId,
        JSON.stringify(next.payload),
        updatedAtLocal,
        ownerUserId,
        currentContourId,
        row.client_operation_id
      ]
    );
  }
}