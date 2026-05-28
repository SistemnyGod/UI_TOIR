import { getDatabase } from "@/db/database";
import { MobileEntityType, OutboxCommand, OutboxCommandStatus, OutboxCommandType, OutboxResponse } from "@/domain/sync/syncTypes";

export async function insertOutboxCommand(command: OutboxCommand) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO outbox_commands (
        client_operation_id,
        owner_user_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      command.clientOperationId,
      command.ownerUserId,
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

export async function listPendingOutboxCommands(limit = 25) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    client_operation_id: string;
    owner_user_id: string;
    command_type: string;
    entity_type: string;
    entity_local_id: string | null;
    entity_server_id: string | null;
    payload_json: string;
    created_at_local: string;
    updated_at_local: string | null;
    attempt_count: number;
    status: string;
  }>(
    `
      SELECT *
      FROM outbox_commands
      WHERE status IN ('pending', 'retryLater')
      ORDER BY created_at_local ASC
      LIMIT ?
    `,
    [limit]
  );

  return rows.map((row) => ({
    clientOperationId: row.client_operation_id,
    ownerUserId: row.owner_user_id,
    commandType: row.command_type as OutboxCommandType,
    entityType: row.entity_type as MobileEntityType,
    entityLocalId: row.entity_local_id,
    entityServerId: row.entity_server_id,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAtLocal: row.created_at_local,
    attemptCount: row.attempt_count,
    status: row.status as OutboxCommandStatus
  }));
}

export async function markOutboxCommandsSending(clientOperationIds: string[]) {
  if (clientOperationIds.length === 0) {
    return;
  }

  const db = await getDatabase();
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  const updatedAtLocal = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'sending',
          attempt_count = attempt_count + 1,
          updated_at_local = ?
      WHERE client_operation_id IN (${placeholders})
        AND status IN ('pending', 'retryLater')
    `,
    [updatedAtLocal, ...clientOperationIds]
  );
}

export async function markOutboxCommandsRetryLater(clientOperationIds: string[]) {
  if (clientOperationIds.length === 0) {
    return;
  }

  const db = await getDatabase();
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  const updatedAtLocal = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          updated_at_local = ?
      WHERE client_operation_id IN (${placeholders})
        AND status = 'sending'
    `,
    [updatedAtLocal, ...clientOperationIds]
  );
}

export async function resetStaleSendingOutboxCommands(staleBeforeIso: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          updated_at_local = ?
      WHERE status = 'sending'
        AND (updated_at_local IS NULL OR updated_at_local < ?)
    `,
    [updatedAtLocal, staleBeforeIso]
  );
}

export async function applyOutboxResponses(responses: OutboxResponse[]) {
  const db = await getDatabase();

  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const response of responses) {
      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = ?,
              entity_server_id = COALESCE(?, entity_server_id),
              updated_at_local = ?
          WHERE client_operation_id = ?
        `,
        [response.status, response.serverEntityId, new Date().toISOString(), response.clientOperationId]
      );

      if (response.status === "accepted" || response.status === "duplicate") {
        const command = await tx.getFirstAsync<{
          command_type: string;
          entity_local_id: string | null;
        }>(
          `
            SELECT command_type, entity_local_id
            FROM outbox_commands
            WHERE client_operation_id = ?
          `,
          [response.clientOperationId]
        );

        if (command?.command_type === "completePatrolAssignment" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE patrol_assignments
              SET status = 'completedServer'
              WHERE assignment_id = ?
            `,
            [command.entity_local_id]
          );
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = 'completed'
              WHERE request_id = (
                SELECT request_id
                FROM patrol_assignments
                WHERE assignment_id = ?
                LIMIT 1
              )
            `,
            [command.entity_local_id]
          );
        }

        if (command?.command_type === "completeWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'completedServer'
              WHERE task_id = ?
            `,
            [command.entity_local_id]
          );
        }

        if (command?.command_type === "pauseWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'paused'
              WHERE task_id = ?
            `,
            [command.entity_local_id]
          );
        }

        if (command?.command_type === "resumeWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'inProgress'
              WHERE task_id = ?
            `,
            [command.entity_local_id]
          );
        }

        if (command?.command_type === "createShiftRemark" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE shift_remarks
              SET status = ?,
                  server_remark_id = COALESCE(?, server_remark_id)
              WHERE remark_id = ?
            `,
            [response.status, response.serverEntityId, command.entity_local_id]
          );
        }

        if (command?.command_type === "attachShiftRemarkMedia" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE shift_remarks
              SET status = ?
              WHERE remark_id = ?
            `,
            [response.status, command.entity_local_id]
          );
        }
      }

      if (response.status === "conflict" || response.status === "rejected") {
        const command = await tx.getFirstAsync<{
          owner_user_id: string;
          entity_type: string;
          entity_local_id: string | null;
          payload_json: string;
        }>(
          `
            SELECT owner_user_id, entity_type, entity_local_id, payload_json
            FROM outbox_commands
            WHERE client_operation_id = ?
          `,
          [response.clientOperationId]
        );

        if (command) {
          const conflictId = response.conflictId ?? `${response.status}-${response.clientOperationId}`;
          await tx.runAsync(
            `
              INSERT OR REPLACE INTO sync_conflicts (
                conflict_id,
                owner_user_id,
                client_operation_id,
                entity_type,
                reason,
                payload_snapshot_json,
                status
              )
              VALUES (?, ?, ?, ?, ?, ?, 'open')
            `,
            [
              conflictId,
              command.owner_user_id,
              response.clientOperationId,
              command.entity_type,
              response.message,
              command.payload_json
            ]
          );

          if (command.entity_type === "shiftRemark" && command.entity_local_id) {
            await tx.runAsync(
              `
                UPDATE shift_remarks
                SET status = ?
                WHERE remark_id = ?
              `,
              [response.status, command.entity_local_id]
            );
          }
        }
      }
    }
  });
}
