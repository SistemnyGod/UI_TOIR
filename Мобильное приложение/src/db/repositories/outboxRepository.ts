import { getDatabase } from "@/db/database";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandStatus, OutboxCommandType, OutboxResponse } from "@/domain/sync/syncTypes";

export type SyncQueueCommandItem = {
  clientOperationId: string;
  commandType: OutboxCommandType;
  entityType: MobileEntityType;
  entityLocalId: string | null;
  entityServerId: string | null;
  status: OutboxCommandStatus;
  createdAtLocal: string;
  updatedAtLocal: string | null;
  attemptCount: number;
  lastError: string | null;
  assignmentRouteName: string | null;
};

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

export async function listPendingOutboxCommands(ownerUserId: string, limit = 25) {
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
      WHERE owner_user_id = ?
        AND status IN ('pending', 'retryLater')
      ORDER BY created_at_local ASC
      LIMIT ?
    `,
    [ownerUserId, limit]
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

export async function countPendingOutboxCommands(ownerUserId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND status IN ('pending', 'sending', 'retryLater')
    `,
    [ownerUserId]
  );

  return row?.count ?? 0;
}

export async function getOutboxCommandDeliveryState(clientOperationId: string) {
  const db = await getDatabase();
  return db.getFirstAsync<{
    status: OutboxCommandStatus;
    lastError: string | null;
  }>(
    `
      SELECT
        status,
        last_error AS lastError
      FROM outbox_commands
      WHERE client_operation_id = ?
    `,
    [clientOperationId]
  );
}

export async function getCompleteReportDeliveryState(ownerUserId: string, assignmentId: string) {
  const db = await getDatabase();
  return db.getFirstAsync<{
    clientOperationId: string;
    status: OutboxCommandStatus;
    lastError: string | null;
    attemptCount: number;
    updatedAtLocal: string | null;
  }>(
    `
      SELECT
        client_operation_id AS clientOperationId,
        status,
        last_error AS lastError,
        attempt_count AS attemptCount,
        updated_at_local AS updatedAtLocal
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND command_type = 'completePatrolAssignment'
        AND entity_local_id = ?
        AND status <> 'superseded'
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, assignmentId]
  );
}

export async function hasPendingOutboxCommands(ownerUserId: string) {
  return (await countPendingOutboxCommands(ownerUserId)) > 0;
}

export async function listSyncQueueCommands(ownerUserId: string, limit = 100) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    client_operation_id: string;
    command_type: string;
    entity_type: string;
    entity_local_id: string | null;
    entity_server_id: string | null;
    status: string;
    created_at_local: string;
    updated_at_local: string | null;
    attempt_count: number;
    last_error: string | null;
    assignment_route_name: string | null;
  }>(
    `
      SELECT
        command.client_operation_id,
        command.command_type,
        command.entity_type,
        command.entity_local_id,
        command.entity_server_id,
        command.status,
        command.created_at_local,
        command.updated_at_local,
        command.attempt_count,
        command.last_error,
        assignment.route_name AS assignment_route_name
      FROM outbox_commands command
      LEFT JOIN patrol_assignments assignment
        ON assignment.assignment_id = command.entity_local_id
      WHERE command.owner_user_id = ?
        AND command.status IN ('pending', 'sending', 'retryLater', 'rejected', 'conflict')
      ORDER BY
        CASE command.status
          WHEN 'sending' THEN 0
          WHEN 'retryLater' THEN 1
          WHEN 'pending' THEN 2
          ELSE 3
        END,
        COALESCE(command.updated_at_local, command.created_at_local) DESC
      LIMIT ?
    `,
    [ownerUserId, limit]
  );

  return rows.map<SyncQueueCommandItem>((row) => ({
    clientOperationId: row.client_operation_id,
    commandType: row.command_type as OutboxCommandType,
    entityType: row.entity_type as MobileEntityType,
    entityLocalId: row.entity_local_id,
    entityServerId: row.entity_server_id,
    status: row.status as OutboxCommandStatus,
    createdAtLocal: row.created_at_local,
    updatedAtLocal: row.updated_at_local,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    assignmentRouteName: row.assignment_route_name
  }));
}

export async function listUnconfirmedCompleteReportCommands(ownerUserId: string, assignmentId?: string) {
  const db = await getDatabase();
  const assignmentFilter = assignmentId ? "AND entity_local_id = ?" : "";
  const params = assignmentId ? [ownerUserId, assignmentId] : [ownerUserId];
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
      WHERE owner_user_id = ?
        AND command_type = 'completePatrolAssignment'
        AND status IN ('pending', 'sending', 'retryLater')
        ${assignmentFilter}
      ORDER BY updated_at_local ASC, created_at_local ASC
    `,
    params
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
          last_error = NULL,
          updated_at_local = ?
      WHERE client_operation_id IN (${placeholders})
        AND status IN ('pending', 'retryLater')
    `,
    [updatedAtLocal, ...clientOperationIds]
  );
}

export async function markOutboxCommandsRetryLater(clientOperationIds: string[], lastError?: string) {
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
          last_error = COALESCE(?, last_error),
          updated_at_local = ?
      WHERE client_operation_id IN (${placeholders})
        AND status = 'sending'
    `,
    [lastError ?? null, updatedAtLocal, ...clientOperationIds]
  );
}

export async function markPendingOutboxCommandsRetryLater(ownerUserId: string, lastError: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          last_error = ?,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND status IN ('pending', 'sending', 'retryLater')
    `,
    [lastError, updatedAtLocal, ownerUserId]
  );
}

export async function markPendingOutboxCommandsAuthRequired(ownerUserId: string, lastError: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `
        UPDATE outbox_commands
        SET status = 'retryLater',
            last_error = ?,
            updated_at_local = ?
        WHERE owner_user_id = ?
          AND status IN ('pending', 'sending', 'retryLater')
      `,
      [lastError, updatedAtLocal, ownerUserId]
    );

    await tx.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'authRequired'
        WHERE owner_user_id = ?
          AND status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError')
          AND EXISTS (
            SELECT 1
            FROM outbox_commands command
            WHERE command.entity_local_id = patrol_assignments.assignment_id
              AND command.status = 'retryLater'
          )
      `,
      [ownerUserId]
    );

    await tx.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'authRequired'
        WHERE owner_user_id = ?
          AND status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError')
          AND EXISTS (
            SELECT 1
            FROM point_results result
            WHERE result.assignment_id = patrol_assignments.assignment_id
              AND result.sync_status <> 'synced'
          )
      `,
      [ownerUserId]
    );

    await tx.runAsync(
      `
        UPDATE patrol_request_board
        SET status = 'authRequired'
        WHERE owner_user_id = ?
          AND EXISTS (
          SELECT 1
          FROM patrol_assignments assignment
          WHERE assignment.request_id = patrol_request_board.request_id
            AND assignment.status = 'authRequired'
        )
      `,
      [ownerUserId]
    );
  });
}

export async function resetStaleSendingOutboxCommands(ownerUserId: string, staleBeforeIso: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          last_error = COALESCE(last_error, 'Отправка зависла и будет повторена автоматически.'),
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND status = 'sending'
        AND (updated_at_local IS NULL OR updated_at_local < ?)
    `,
    [updatedAtLocal, ownerUserId, staleBeforeIso]
  );
}

export async function resetSendingOutboxCommandsForManualRetry(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          last_error = 'Пользователь запустил повторную отправку.',
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND status = 'sending'
    `,
    [updatedAtLocal, ownerUserId]
  );
}

export async function finalizeAcceptedCompleteReportCommands(ownerUserId: string, assignmentId?: string) {
  const db = await getDatabase();
  let finalized = 0;

  await db.withExclusiveTransactionAsync(async (tx) => {
    const assignmentFilter = assignmentId ? "AND command.entity_local_id = ?" : "";
    const params = assignmentId ? [ownerUserId, assignmentId] : [ownerUserId];
    const rows = await tx.getAllAsync<{ assignment_id: string }>(
      `
        SELECT command.entity_local_id AS assignment_id
        FROM outbox_commands command
        INNER JOIN patrol_assignments assignment
          ON assignment.assignment_id = command.entity_local_id
        WHERE command.owner_user_id = ?
          AND command.command_type = 'completePatrolAssignment'
          AND command.status IN ('accepted', 'duplicate')
          AND command.entity_local_id IS NOT NULL
          AND assignment.status = 'completedLocal'
          ${assignmentFilter}
      `,
      params
    );

    for (const row of rows) {
      await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET status = 'completedServer'
          WHERE assignment_id = ?
        `,
        [row.assignment_id]
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
        [row.assignment_id]
      );
    }

    finalized = rows.length;
  });

  return { finalized };
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
              last_error = ?,
              updated_at_local = ?
          WHERE client_operation_id = ?
        `,
        [
          response.status,
          response.serverEntityId,
          isProblemResponse(response.status) ? response.message : null,
          new Date().toISOString(),
          response.clientOperationId
        ]
      );

      if (response.status === "accepted" || response.status === "duplicate") {
        const command = await tx.getFirstAsync<{
          owner_user_id: string;
          command_type: string;
          entity_local_id: string | null;
        }>(
          `
            SELECT owner_user_id, command_type, entity_local_id
            FROM outbox_commands
            WHERE client_operation_id = ?
          `,
          [response.clientOperationId]
        );

        if (command?.command_type === "completePatrolAssignment" && command.entity_local_id) {
          const terminalStatus = isCancelledCompletionResponse(response) ? "cancelledServer" : "completedServer";
          const requestStatus = isCancelledCompletionResponse(response) ? "cancelledServer" : "completed";

          await tx.runAsync(
            `
              UPDATE outbox_commands
              SET status = 'superseded',
                  last_error = NULL,
                  updated_at_local = ?
              WHERE owner_user_id = ?
                AND command_type = 'completePatrolAssignment'
                AND entity_local_id = ?
                AND client_operation_id <> ?
                AND status IN ('rejected', 'conflict')
            `,
            [new Date().toISOString(), command.owner_user_id, command.entity_local_id, response.clientOperationId]
          );

          await tx.runAsync(
            `
              UPDATE sync_conflicts
              SET status = 'resolved'
              WHERE owner_user_id = ?
                AND status NOT IN ('resolved', 'dismissed')
                AND client_operation_id IN (
                  SELECT client_operation_id
                  FROM outbox_commands
                  WHERE owner_user_id = ?
                    AND command_type = 'completePatrolAssignment'
                    AND entity_local_id = ?
                    AND status IN ('accepted', 'duplicate', 'superseded')
                )
            `,
            [command.owner_user_id, command.owner_user_id, command.entity_local_id]
          );

          await tx.runAsync(
            `
              UPDATE patrol_assignments
              SET status = ?
              WHERE assignment_id = ?
            `,
            [terminalStatus, command.entity_local_id]
          );
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = ?
              WHERE request_id = (
                SELECT request_id
                FROM patrol_assignments
                WHERE assignment_id = ?
                LIMIT 1
                )
            `,
            [requestStatus, command.entity_local_id]
          );
        }

        if (
          command?.entity_local_id
          && [
            "acceptPatrolRequest",
            "startPatrolAssignment",
            "pausePatrolAssignment",
            "resumePatrolAssignment",
            "handoffPatrolAssignment"
          ].includes(command.command_type)
        ) {
          const nextStatus =
            command.command_type === "pausePatrolAssignment"
              ? "paused"
              : command.command_type === "handoffPatrolAssignment"
                ? "needsDispatcherDecision"
                : command.command_type === "acceptPatrolRequest"
                  ? "accepted"
                  : "inProgress";

          await tx.runAsync(
            `
              UPDATE patrol_assignments
              SET status = ?,
                  revision = COALESCE(?, revision)
              WHERE assignment_id = ?
            `,
            [nextStatus, response.serverRevision, command.entity_local_id]
          );
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = ?
              WHERE request_id = (
                SELECT request_id
                FROM patrol_assignments
                WHERE assignment_id = ?
                LIMIT 1
              )
            `,
            [nextStatus, command.entity_local_id]
          );
        }

        if (command?.command_type === "completeWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'completedServer',
                  sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE task_id = ?
            `,
            [response.serverRevision, command.entity_local_id]
          );
        }

        if (command?.command_type === "pauseWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'paused',
                  sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE task_id = ?
            `,
            [response.serverRevision, command.entity_local_id]
          );
        }

        if (command?.command_type === "resumeWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'inProgress',
                  sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE task_id = ?
            `,
            [response.serverRevision, command.entity_local_id]
          );
        }

        if ((command?.command_type === "createWorkTask" || command?.command_type === "updateWorkTask") && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE task_id = ?
            `,
            [response.serverRevision, command.entity_local_id]
          );
        }

        if (command?.command_type === "createShiftRemark" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE shift_remarks
              SET status = ?,
                  server_remark_id = COALESCE(?, server_remark_id),
                  sync_status = 'synced'
              WHERE remark_id = ?
            `,
            [response.status, response.serverEntityId, command.entity_local_id]
          );
        }

        if (command?.command_type === "attachShiftRemarkMedia" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE shift_remarks
              SET status = ?,
                  sync_status = 'synced'
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
                SET status = ?,
                    sync_status = ?
                WHERE remark_id = ?
              `,
              [response.status, response.status, command.entity_local_id]
            );
          }

          if (command.entity_type === "workTask" && command.entity_local_id) {
            await tx.runAsync(
              `
                UPDATE work_tasks
                SET sync_status = ?
                WHERE task_id = ?
              `,
              [response.status, command.entity_local_id]
            );
          }

          if (command.entity_type === "patrolAssignment" && command.entity_local_id) {
            const nextStatus = response.status === "conflict" ? "needsDispatcherDecision" : "syncError";
            await tx.runAsync(
              `
                UPDATE patrol_assignments
                SET status = ?
                WHERE assignment_id = ?
              `,
              [nextStatus, command.entity_local_id]
            );
            await tx.runAsync(
              `
                UPDATE patrol_request_board
                SET status = ?
                WHERE request_id = (
                  SELECT request_id
                  FROM patrol_assignments
                  WHERE assignment_id = ?
                  LIMIT 1
                )
              `,
              [nextStatus, command.entity_local_id]
            );
          }
        }
      }
    }
  });

  for (const response of responses) {
    if (response.status !== "conflict" && response.status !== "rejected") {
      continue;
    }

    void logMobileAction({
      eventType: `sync.${response.status}`,
      entityType: "outboxCommand",
      entityId: response.clientOperationId,
      message: response.status === "conflict" ? "Команда требует проверки оператора." : "Команда отклонена сервером.",
      payload: response
    }).catch(() => undefined);
  }
}

function isProblemResponse(status: OutboxResponse["status"]) {
  return status === "conflict" || status === "rejected" || status === "retryLater";
}

function isCancelledCompletionResponse(response: OutboxResponse) {
  return (
    (response.status === "accepted" || response.status === "duplicate")
    && response.message.toLowerCase().includes("dispatcher cancellation")
  );
}
