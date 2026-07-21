import { getDatabase } from "@/db/database";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { updatePendingCompleteReportBaseRevisionInTransaction } from "@/db/repositories/outboxSql";
import { MobileEntityType, OutboxCommand, OutboxCommandStatus, OutboxCommandType, OutboxResponse } from "@/domain/sync/syncTypes";
import { extractAssignmentId, extractCompletionFileIds, isCancelledCompletionResponse, isProblemResponse } from "@/db/repositories/outboxPolicies";
import { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";

export type { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";

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

export async function getOutboxCommandDeliveryState(ownerUserId: string, clientOperationId: string) {
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
      WHERE owner_user_id = ? AND client_operation_id = ?
    `,
    [ownerUserId, clientOperationId]
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

export async function listUnconfirmedCompleteReportCommands(
  ownerUserId: string,
  assignmentId?: string,
  limit = 24
) {
  const db = await getDatabase();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
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
      LIMIT ?
    `,
    [...params, boundedLimit]
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

export async function markOutboxCommandsSending(ownerUserId: string, clientOperationIds: string[]) {
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
      WHERE owner_user_id = ?
        AND client_operation_id IN (${placeholders})
        AND status IN ('pending', 'retryLater')
    `,
    [updatedAtLocal, ownerUserId, ...clientOperationIds]
  );
}

export async function markOutboxCommandsRetryLater(ownerUserId: string, clientOperationIds: string[], lastError?: string) {
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
      WHERE owner_user_id = ?
        AND client_operation_id IN (${placeholders})
        AND status = 'sending'
    `,
    [lastError ?? null, updatedAtLocal, ownerUserId, ...clientOperationIds]
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

  // Authentication is a delivery condition, not a patrol lifecycle state.
  // Replacing `inProgress` with `authRequired` stranded a patrol after a user
  // signed back in.  Keep its operational state intact and surface the sign-in
  // requirement from the pending outbox command instead.
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

export async function resetStaleSendingOutboxCommands(ownerUserId: string, staleBeforeIso: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          last_error = COALESCE(last_error, 'РћС‚РїСЂР°РІРєР° Р·Р°РІРёСЃР»Р° Рё Р±СѓРґРµС‚ РїРѕРІС‚РѕСЂРµРЅР° Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.'),
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
          last_error = 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°РїСѓСЃС‚РёР» РїРѕРІС‚РѕСЂРЅСѓСЋ РѕС‚РїСЂР°РІРєСѓ.',
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
          WHERE owner_user_id = ? AND assignment_id = ?
        `,
        [ownerUserId, row.assignment_id]
      );
      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = 'completed'
          WHERE owner_user_id = ? AND request_id = (
            SELECT request_id
            FROM patrol_assignments
            WHERE owner_user_id = ? AND assignment_id = ?
            LIMIT 1
          )
        `,
        [ownerUserId, ownerUserId, row.assignment_id]
      );
    }

    finalized = rows.length;
  });

  return { finalized };
}

export async function applyOutboxResponses(ownerUserId: string, responses: OutboxResponse[]) {
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
          WHERE owner_user_id = ? AND client_operation_id = ?
        `,
        [
          response.status,
          response.serverEntityId,
          isProblemResponse(response.status) ? response.message : null,
          new Date().toISOString(),
          ownerUserId,
          response.clientOperationId
        ]
      );

      if (response.status === "accepted" || response.status === "duplicate") {
        const command = await tx.getFirstAsync<{
          owner_user_id: string;
          command_type: string;
          entity_local_id: string | null;
          payload_json: string;
        }>(
          `
            SELECT owner_user_id, command_type, entity_local_id, payload_json
            FROM outbox_commands
            WHERE owner_user_id = ? AND client_operation_id = ?
          `,
          [ownerUserId, response.clientOperationId]
        );

        if (command?.command_type === "completePatrolAssignment" && command.entity_local_id) {
          for (const clientFileId of extractCompletionFileIds(command.payload_json)) {
            await tx.runAsync(
              "UPDATE files SET status = 'linked' WHERE owner_user_id = ? AND client_file_id = ? AND status = 'uploaded'",
              [command.owner_user_id, clientFileId]
            );
          }

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
              WHERE owner_user_id = ? AND assignment_id = ?
            `,
            [terminalStatus, command.owner_user_id, command.entity_local_id]
          );
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = ?
              WHERE request_id = (
                SELECT request_id
                FROM patrol_assignments
                WHERE owner_user_id = ? AND assignment_id = ?
                LIMIT 1
                )
            `,
            [requestStatus, command.owner_user_id, command.entity_local_id]
          );
        }

        if (command?.command_type === "releasePatrolRequest" && command.entity_local_id) {
          const request = await tx.getFirstAsync<{ request_id: string }>(
            `
              SELECT request_id
              FROM patrol_assignments
              WHERE owner_user_id = ? AND assignment_id = ?
              LIMIT 1
            `,
            [command.owner_user_id, command.entity_local_id]
          );

          if (request?.request_id) {
            await tx.runAsync(
              `
                UPDATE patrol_request_board
                SET status = CASE WHEN assigned_full_name IS NULL THEN 'available' ELSE 'assigned' END
                WHERE owner_user_id = ? AND request_id = ?
              `,
              [command.owner_user_id, request.request_id]
            );
          }

          await tx.runAsync("DELETE FROM point_results WHERE owner_user_id = ? AND assignment_id = ?", [command.owner_user_id, command.entity_local_id]);
          await tx.runAsync("DELETE FROM assignment_route_points WHERE assignment_id = ?", [command.entity_local_id]);
          await tx.runAsync("DELETE FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ?", [command.owner_user_id, command.entity_local_id]);
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
              WHERE owner_user_id = ? AND assignment_id = ?
            `,
            [nextStatus, response.serverRevision, command.owner_user_id, command.entity_local_id]
          );
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = ?
              WHERE request_id = (
                SELECT request_id
                FROM patrol_assignments
                WHERE owner_user_id = ? AND assignment_id = ?
                LIMIT 1
              )
            `,
            [nextStatus, command.owner_user_id, command.entity_local_id]
          );

          if (response.serverRevision !== null) {
            await updatePendingCompleteReportBaseRevisionInTransaction(
              tx,
              command.owner_user_id,
              command.entity_local_id,
              response.serverRevision
            );
          }
        }

        if (command?.command_type === "completeWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'completedServer',
                  sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE owner_user_id = ? AND task_id = ?
            `,
            [response.serverRevision, command.owner_user_id, command.entity_local_id]
          );
        }

        if (command?.command_type === "pauseWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'paused',
                  sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE owner_user_id = ? AND task_id = ?
            `,
            [response.serverRevision, command.owner_user_id, command.entity_local_id]
          );
        }

        if (command?.command_type === "resumeWorkTask" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET status = 'inProgress',
                  sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE owner_user_id = ? AND task_id = ?
            `,
            [response.serverRevision, command.owner_user_id, command.entity_local_id]
          );
        }

        if ((command?.command_type === "createWorkTask"
          || command?.command_type === "updateWorkTask"
          || command?.command_type === "startPlannedWork"
          || command?.command_type === "joinWorkTask"
          || command?.command_type === "replaceWorkTaskParticipant") && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE work_tasks
              SET sync_status = 'synced',
                  revision = COALESCE(?, revision)
              WHERE owner_user_id = ? AND task_id = ?
            `,
            [response.serverRevision, command.owner_user_id, command.entity_local_id]
          );
        }

        if (command?.command_type === "createShiftRemark" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE shift_remarks
              SET status = ?,
                  server_remark_id = COALESCE(?, server_remark_id),
                  sync_status = 'synced'
              WHERE owner_user_id = ? AND remark_id = ?
            `,
            [response.status, response.serverEntityId, command.owner_user_id, command.entity_local_id]
          );
        }

        if (command?.command_type === "attachShiftRemarkMedia" && command.entity_local_id) {
          await tx.runAsync(
            `
              UPDATE shift_remarks
              SET status = ?,
                  sync_status = 'synced'
              WHERE owner_user_id = ? AND remark_id = ?
            `,
            [response.status, command.owner_user_id, command.entity_local_id]
          );
        }
      }

      if (response.status === "conflict" || response.status === "rejected") {
          const command = await tx.getFirstAsync<{
            owner_user_id: string;
            command_type: string;
            entity_type: string;
            entity_local_id: string | null;
            payload_json: string;
        }>(
          `
            SELECT owner_user_id, command_type, entity_type, entity_local_id, payload_json
            FROM outbox_commands
            WHERE owner_user_id = ? AND client_operation_id = ?
          `,
          [ownerUserId, response.clientOperationId]
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
                WHERE owner_user_id = ? AND remark_id = ?
              `,
              [response.status, response.status, command.owner_user_id, command.entity_local_id]
            );
          }

          if (command.entity_type === "workTask" && command.entity_local_id) {
            await tx.runAsync(
              `
                UPDATE work_tasks
                SET sync_status = ?
                WHERE owner_user_id = ? AND task_id = ?
              `,
              [response.status, command.owner_user_id, command.entity_local_id]
            );
          }

          const isCancelledByServer = response.reasonCode === "assignmentCancelled";
          // A validation rejection is repairable locally: keep the point
          // results and let the employee edit them before creating a new
          // completion command. Conflicts and dispatcher cancellations stay
          // blocked and require an explicit resolution.
          const isRepairableCompletionRejection =
            response.status === "rejected"
            && command.command_type === "completePatrolAssignment"
            && response.reasonCode !== "assignmentCancelled";
          const assignmentId = command.entity_type === "patrolAssignment" || command.command_type === "acceptPatrolRequest"
            ? command.entity_local_id
            : isCancelledByServer ? extractAssignmentId(command.payload_json) : null;
          if (assignmentId) {
            const nextStatus = isCancelledByServer
              ? "cancelledServer"
              : response.status === "conflict"
                ? "needsDispatcherDecision"
                : isRepairableCompletionRejection ? "inProgress" : "syncError";
            await tx.runAsync(
              `
                UPDATE patrol_assignments
                SET status = ?,
                    completed_at_local = CASE WHEN ? = 'inProgress' THEN NULL ELSE completed_at_local END
                WHERE owner_user_id = ? AND assignment_id = ?
              `,
              [nextStatus, nextStatus, command.owner_user_id, assignmentId]
            );
            await tx.runAsync(
              `
                UPDATE patrol_request_board
                SET status = ?
                WHERE owner_user_id = ? AND request_id = (
                  SELECT request_id
                  FROM patrol_assignments
                  WHERE owner_user_id = ? AND assignment_id = ?
                  LIMIT 1
                )
              `,
              [nextStatus === "cancelledServer" ? "cancelledServer" : nextStatus, command.owner_user_id, command.owner_user_id, assignmentId]
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
      message: response.status === "conflict" ? "РљРѕРјР°РЅРґР° С‚СЂРµР±СѓРµС‚ РїСЂРѕРІРµСЂРєРё РѕРїРµСЂР°С‚РѕСЂР°." : "РљРѕРјР°РЅРґР° РѕС‚РєР»РѕРЅРµРЅР° СЃРµСЂРІРµСЂРѕРј.",
      payload: response
    }).catch(() => undefined);
  }
}
