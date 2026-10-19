import { isRecoverableLifecycleRejection } from './outboxReadRepository';

import { assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { updatePendingPatrolSwitchRevision, updatePendingCompleteReportBaseRevisionInTransaction, updatePendingWorkTaskRevisionInTransaction, type SqlExecutor } from "@/db/repositories/outboxSql";
import { finalizeCancelledAssignmentInTransaction } from "@/db/repositories/patrolCancellationRepository";
import { OutboxResponse } from "@/domain/sync/syncTypes";
import { extractAssignmentId, extractCompletionFileIds, isCancelledCompletionResponse, isProblemResponse, resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";
import { resolveRetryDelaySeconds } from "@/sync/outboxRetryPolicy";

import { getReleaseResponseResolution } from "@/domain/patrol/releaseResolutionPolicy";
import { getPointResultSyncUpdate } from "@/domain/patrol/pointResultSyncPolicy";

import { resolveRemappedAssignmentStatus } from "@/domain/patrol/assignmentIdentityPolicy";

import type { OutboxRetryReason } from './outboxTypes';
import { applyPatrolTransferResponseInTransaction } from "@/db/repositories/patrolTransferSync";

const maxRecoverableLifecycleAttempts = 6;
const exhaustedLifecycleMessage = "Сервер не принимает действие: обход уже закрыт или изменён на сервере. Нужно решение диспетчера, локальные данные сохранены.";

function recoverableLifecycleMessage(commandType: string) {
  if (commandType === "startPatrolAssignment") {
    return "Запуск обхода сохранён. Восстанавливаем принятие заявки в фоне.";
  }
  if (commandType === "completePatrolAssignment") {
    return "Отчёт сохранён. Восстанавливаем последовательность отправки.";
  }
  return "Действие обхода сохранено. Восстанавливаем отправку в фоне.";
}

export async function resolveRecoverableOutboxConflict(tx: SqlExecutor, ownerUserId: string, clientOperationId: string, resolvedAt: string) {
  await tx.runAsync(
    `UPDATE sync_conflicts
        SET status = 'resolved',
            resolution_status = 'retryRequested',
            resolved_at = ?,
            resolution_reason = '\u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438.'
      WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
        AND status NOT IN ('resolved', 'dismissed')`,
    [resolvedAt, ownerUserId, currentContourId, clientOperationId]
  );
}

async function remapAssignmentIdentityInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  localAssignmentId: string,
  serverAssignmentId: string
) {
  if (!localAssignmentId || !serverAssignmentId || localAssignmentId === serverAssignmentId) {
    return;
  }

  type AssignmentIdentityRow = {
    assignmentId: string;
    requestId: string;
    routeId: string;
    status: string;
    startedAtLocal: string | null;
    completedAtLocal: string | null;
    localReportPresent: number;
    localReportNeedsReview: number;
    revision: number;
    routeVersionNo: number;
    snapshotVersion: number;
    snapshotCreatedAt: string | null;
    snapshotSource: string | null;
    snapshotAllowFreeOrder: number | null;
    snapshotNfcEnabled: number | null;
    snapshotQrFallbackEnabled: number | null;
  };
  const assignmentRows = await tx.getAllAsync<AssignmentIdentityRow>(
    `SELECT
       assignment_id AS assignmentId,
       request_id AS requestId,
       route_id AS routeId,
       status,
       started_at_local AS startedAtLocal,
       completed_at_local AS completedAtLocal,
       local_report_present AS localReportPresent,
       local_report_needs_review AS localReportNeedsReview,
       revision,
       route_version_no AS routeVersionNo,
       snapshot_version AS snapshotVersion,
       snapshot_created_at AS snapshotCreatedAt,
       snapshot_source AS snapshotSource,
       snapshot_allow_free_order AS snapshotAllowFreeOrder,
       snapshot_nfc_enabled AS snapshotNfcEnabled,
       snapshot_qr_fallback_enabled AS snapshotQrFallbackEnabled
     FROM patrol_assignments
     WHERE owner_user_id = ? AND contour_id = ? AND assignment_id IN (?, ?)`,
    [ownerUserId, currentContourId, localAssignmentId, serverAssignmentId]
  );
  const localRow = assignmentRows.find((row) => row.assignmentId === localAssignmentId) ?? null;
  const serverRow = assignmentRows.find((row) => row.assignmentId === serverAssignmentId) ?? null;

  if (serverRow && localRow) {
    await tx.runAsync(
      `UPDATE patrol_assignments
          SET request_id = ?,
              route_id = ?,
              status = ?,
              started_at_local = ?,
              completed_at_local = ?,
              local_report_present = MAX(local_report_present, ?),
              local_report_needs_review = MAX(local_report_needs_review, ?),
              revision = ?,
              route_version_no = ?,
              snapshot_version = ?,
              snapshot_created_at = ?,
              snapshot_source = ?,
              snapshot_allow_free_order = ?,
              snapshot_nfc_enabled = ?,
              snapshot_qr_fallback_enabled = ?
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [
        localRow.requestId,
        localRow.routeId,
        resolveRemappedAssignmentStatus(localRow.status, serverRow.status),
        localRow.startedAtLocal ?? serverRow.startedAtLocal,
        localRow.completedAtLocal ?? serverRow.completedAtLocal,
        Math.max(localRow.localReportPresent ?? 0, serverRow.localReportPresent ?? 0),
        Math.max(localRow.localReportNeedsReview ?? 0, serverRow.localReportNeedsReview ?? 0),
        Math.max(localRow.revision, serverRow.revision),
        localRow.routeVersionNo || serverRow.routeVersionNo,
        localRow.snapshotVersion || serverRow.snapshotVersion,
        localRow.snapshotCreatedAt ?? serverRow.snapshotCreatedAt,
        localRow.snapshotSource ?? serverRow.snapshotSource,
        localRow.snapshotAllowFreeOrder ?? serverRow.snapshotAllowFreeOrder,
        localRow.snapshotNfcEnabled ?? serverRow.snapshotNfcEnabled,
        localRow.snapshotQrFallbackEnabled ?? serverRow.snapshotQrFallbackEnabled,
        ownerUserId,
        currentContourId,
        serverAssignmentId
      ]
    );
  }
  if (serverRow) {
    // A bootstrap may already contain the server aggregate. Merge local route
    // points into it without losing local results, then remove the duplicate key.
    await tx.runAsync(
      `INSERT OR REPLACE INTO assignment_route_points (
         assignment_id, point_id, route_id, name, description, instruction,
         order_index, nfc_uid_hash, qr_code_hash, required, requires_photo, revision
       )
       SELECT ?, point_id, route_id, name, description, instruction,
              order_index, nfc_uid_hash, qr_code_hash, required, requires_photo, revision
         FROM assignment_route_points
        WHERE assignment_id = ?`,
      [serverAssignmentId, localAssignmentId]
    );
    await tx.runAsync("DELETE FROM assignment_route_points WHERE assignment_id = ?", [localAssignmentId]);
  } else {
    await tx.runAsync("UPDATE assignment_route_points SET assignment_id = ? WHERE assignment_id = ?", [serverAssignmentId, localAssignmentId]);
  }
  await tx.runAsync("UPDATE point_results SET assignment_id = ? WHERE owner_user_id = ? AND assignment_id = ?", [serverAssignmentId, ownerUserId, localAssignmentId]);
  await tx.runAsync("UPDATE patrol_appeals SET assignment_id = ? WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?", [serverAssignmentId, ownerUserId, currentContourId, localAssignmentId]);
  await tx.runAsync("UPDATE files SET assignment_id = ? WHERE owner_user_id = ? AND assignment_id = ?", [serverAssignmentId, ownerUserId, localAssignmentId]);
  await tx.runAsync(
    `INSERT OR REPLACE INTO patrol_report_cache (
       owner_user_id, contour_id, assignment_id, route_name, employee_name,
       completed_at, cached_at
     )
     SELECT owner_user_id, contour_id, ?, route_name, employee_name,
            completed_at, cached_at
       FROM patrol_report_cache
      WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
    [serverAssignmentId, ownerUserId, currentContourId, localAssignmentId]
  );
  await tx.runAsync(
    `INSERT OR REPLACE INTO patrol_report_detail_cache (
       owner_user_id, contour_id, assignment_id, points_json, cached_at
     )
     SELECT owner_user_id, contour_id, ?, points_json, cached_at
       FROM patrol_report_detail_cache
      WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
    [serverAssignmentId, ownerUserId, currentContourId, localAssignmentId]
  );
  await tx.runAsync(
    `UPDATE patrol_device_context
        SET assignment_id = ?
      WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
    [serverAssignmentId, ownerUserId, currentContourId, localAssignmentId]
  );

  const commands = await tx.getAllAsync<{
    clientOperationId: string;
    entityLocalId: string | null;
    entityServerId: string | null;
    payloadJson: string;
  }>(
    `SELECT client_operation_id AS clientOperationId,
            entity_local_id AS entityLocalId,
            entity_server_id AS entityServerId,
            payload_json AS payloadJson
       FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ?
        AND (aggregate_key = ? OR entity_local_id = ? OR entity_server_id = ? OR
          (json_valid(payload_json) AND (json_extract(payload_json, '$.assignmentId') = ? OR json_extract(payload_json, '$.sourceAssignmentId') = ?)))`,
    [ownerUserId, currentContourId, `patrolAssignment:${localAssignmentId}`, localAssignmentId, localAssignmentId, localAssignmentId, localAssignmentId]
  );

  for (const command of commands) {
    let payloadJson = command.payloadJson;
    try {
      const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
      if (payload.sourceAssignmentId === localAssignmentId) {
        payload.sourceAssignmentId = serverAssignmentId;
        payloadJson = JSON.stringify(payload);
      }
      if (payload.assignmentId === localAssignmentId) {
        payload.assignmentId = serverAssignmentId;
        payloadJson = JSON.stringify(payload);
      }
    } catch {
      // Payload validation will report malformed legacy rows separately.
    }
    await tx.runAsync(
      `UPDATE outbox_commands
          SET entity_local_id = CASE WHEN entity_local_id = ? THEN ? ELSE entity_local_id END,
              entity_server_id = CASE WHEN entity_server_id = ? THEN ? ELSE entity_server_id END,
              aggregate_key = CASE WHEN aggregate_key = ? THEN ? ELSE aggregate_key END,
              payload_json = ?
        WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
      [
        localAssignmentId,
        serverAssignmentId,
        localAssignmentId,
        serverAssignmentId,
        `patrolAssignment:${localAssignmentId}`,
        `patrolAssignment:${serverAssignmentId}`,
        payloadJson,
        ownerUserId,
        currentContourId,
        command.clientOperationId
      ]
    );
  }

  const conflicts = await tx.getAllAsync<{
    conflictId: string;
    payloadSnapshotJson: string;
  }>(
    `SELECT conflict_id AS conflictId, payload_snapshot_json AS payloadSnapshotJson
       FROM sync_conflicts
      WHERE owner_user_id = ?
        AND (contour_id = ? OR contour_id IS NULL)
        AND json_valid(payload_snapshot_json)
        AND (json_extract(payload_snapshot_json, '$.assignmentId') = ? OR json_extract(payload_snapshot_json, '$.sourceAssignmentId') = ?)`,
    [ownerUserId, currentContourId, localAssignmentId, localAssignmentId]
  );
  for (const conflict of conflicts) {
    try {
      const payload = JSON.parse(conflict.payloadSnapshotJson) as Record<string, unknown>;
      let changed = false;
      if (payload.sourceAssignmentId === localAssignmentId) {
        payload.sourceAssignmentId = serverAssignmentId;
        changed = true;
      }
      if (payload.assignmentId === localAssignmentId) {
        payload.assignmentId = serverAssignmentId;
        changed = true;
      }
      if (changed) {
        await tx.runAsync(
          `UPDATE sync_conflicts SET payload_snapshot_json = ?
             WHERE owner_user_id = ? AND conflict_id = ?`,
          [JSON.stringify(payload), ownerUserId, conflict.conflictId]
        );
      }
    } catch {
      // Keep malformed legacy snapshots visible for manual resolution.
    }
  }

  if (serverRow) {
    await tx.runAsync(
      `DELETE FROM patrol_assignments
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [ownerUserId, currentContourId, localAssignmentId]
    );
  } else {
    await tx.runAsync(
      `UPDATE patrol_assignments
          SET assignment_id = ?
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [serverAssignmentId, ownerUserId, currentContourId, localAssignmentId]
    );
  }
  await tx.runAsync(
    "DELETE FROM patrol_report_cache WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
    [ownerUserId, currentContourId, localAssignmentId]
  );
  await tx.runAsync(
    "DELETE FROM patrol_report_detail_cache WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
    [ownerUserId, currentContourId, localAssignmentId]
  );
}

export async function applyOutboxResponses(ownerUserId: string, responses: OutboxResponse[], context?: DataOwnerContext) {
  if (context) {
    await assertDataOwnerContext(context);
    if (context.ownerUserId !== ownerUserId) throw new Error("Подтверждение относится к другому аккаунту.");
  }
  const db = await getDatabase();

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
    if (context) await assertDataOwnerContext(context);
    for (const response of responses) {
      const attemptRow = response.status === "retryLater"
        ? await tx.getFirstAsync<{ attempt_count: number }>(
            `
              SELECT attempt_count
              FROM outbox_commands
              WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
            `,
            [ownerUserId, currentContourId, response.clientOperationId]
          )
        : null;
      const retryReason: OutboxRetryReason | null = response.status === "retryLater"
        ? response.retryAfterSeconds !== null ? "rateLimit" : "server"
        : null;
      const nextAttemptAt = response.status === "retryLater"
        ? new Date(
            Date.now() + resolveRetryDelaySeconds(response.retryAfterSeconds, attemptRow?.attempt_count ?? 1, retryReason) * 1000
          ).toISOString()
        : null;
      const isSuccessful = response.status === "accepted" || response.status === "duplicate";
      const updatedAtLocal = new Date().toISOString();
      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = ?,
              entity_server_id = COALESCE(?, entity_server_id),
              next_attempt_at = ?,
              retry_reason = ?,
              last_attempt_at = ${isSuccessful ? "NULL" : "last_attempt_at"},
              last_error = ?,
              updated_at_local = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
        `,
        [
          response.status,
          response.serverEntityId,
          nextAttemptAt,
          retryReason,
          isProblemResponse(response.status) ? response.message : null,
          updatedAtLocal,
          ownerUserId,
          currentContourId,
          response.clientOperationId
        ]
      );

      await applyPatrolTransferResponseInTransaction(tx, ownerUserId, response);

      if (response.status === "accepted" || response.status === "duplicate") {
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
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
          `,
          [ownerUserId, currentContourId, response.clientOperationId]
        );

        if (command?.command_type === "createPatrolAppeal" && command.entity_local_id) {
          if (response.serverEntityId && response.serverEntityId !== command.entity_local_id) {
            await tx.runAsync("DELETE FROM patrol_appeals WHERE id = ? AND owner_user_id = ? AND contour_id = ?", [command.entity_local_id, ownerUserId, currentContourId]);
          } else {
            await tx.runAsync("UPDATE patrol_appeals SET status = CASE WHEN status = 'pending' THEN 'open' ELSE status END, version = MAX(version, ?) WHERE id = ? AND owner_user_id = ? AND contour_id = ?", [response.serverRevision ?? 1, command.entity_local_id, ownerUserId, currentContourId]);
          }
        }
        if (command?.entity_type === "workTask" && command.entity_local_id
          && (response.serverRevision !== null || response.serverEntityId)) {
          await updatePendingWorkTaskRevisionInTransaction(
            tx,
            command.owner_user_id,
            command.entity_local_id,
            response.serverRevision,
            response.serverEntityId
          );
        }



        const pointResultSyncUpdate = command && command.entity_type === "patrolPoint" && command.entity_local_id
          ? getPointResultSyncUpdate(
            command.command_type,
            response.status,
            response.serverRevision,
            response.clientOperationId,
            updatedAtLocal
          )
          : null;
        if (pointResultSyncUpdate && command && command.entity_local_id) {
          const assignmentId = extractAssignmentId(command.payload_json);
          if (assignmentId) {
            await tx.runAsync(
              `
                UPDATE point_results
                SET sync_status = ?,
                    server_revision = COALESCE(?, server_revision),
                    accepted_operation_id = ?,
                    last_synced_at = ?
                WHERE owner_user_id = ?
                  AND assignment_id = ?
                  AND point_id = ?
              `,
              [
                pointResultSyncUpdate.syncStatus,
                pointResultSyncUpdate.serverRevision,
                pointResultSyncUpdate.acceptedOperationId,
                pointResultSyncUpdate.lastSyncedAt,
                ownerUserId,
                assignmentId,
                command.entity_local_id
              ]
            );
          }
        }

        if (command?.command_type === "completePatrolAssignment" && command.entity_local_id) {
          for (const clientFileId of extractCompletionFileIds(command.payload_json)) {
            await tx.runAsync(
              "UPDATE files SET status = 'linked', linked_at = ? WHERE owner_user_id = ? AND contour_id = ? AND client_file_id = ? AND status = 'uploaded'",
              [updatedAtLocal, command.owner_user_id, currentContourId, clientFileId]
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
                AND contour_id = ?
                AND command_type = 'completePatrolAssignment'
                AND entity_local_id = ?
                AND client_operation_id <> ?
                AND status IN ('rejected', 'conflict')
            `,
            [new Date().toISOString(), command.owner_user_id, currentContourId, command.entity_local_id, response.clientOperationId]
          );

          await tx.runAsync(
            `
              UPDATE sync_conflicts
              SET status = 'resolved'
              WHERE owner_user_id = ?
                AND contour_id = ?
                AND status NOT IN ('resolved', 'dismissed')
                AND client_operation_id IN (
                  SELECT client_operation_id
                  FROM outbox_commands
                  WHERE owner_user_id = ?
                AND contour_id = ?
                AND command_type = 'completePatrolAssignment'
                    AND entity_local_id = ?
                    AND status IN ('accepted', 'duplicate', 'superseded')
                )
            `,
            [command.owner_user_id, currentContourId, command.owner_user_id, currentContourId, command.entity_local_id]
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
              WHERE owner_user_id = ?
                AND request_id = (
                  SELECT request_id
                  FROM patrol_assignments
                  WHERE owner_user_id = ? AND assignment_id = ?
                  LIMIT 1
                )
            `,
            [requestStatus, command.owner_user_id, command.owner_user_id, command.entity_local_id]
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
            "takePatrolRequest",
            "startPatrolAssignment",
            "switchPatrolAssignment",
            "pausePatrolAssignment",
            "resumePatrolAssignment",
            "handoffPatrolAssignment"
          ].includes(command.command_type)
        ) {
          let effectiveAssignmentId = command.entity_local_id;
          if (command.command_type === "acceptPatrolRequest"
            && response.serverEntityId
            && response.serverEntityId !== command.entity_local_id) {
            await remapAssignmentIdentityInTransaction(
              tx,
              command.owner_user_id,
              command.entity_local_id,
              response.serverEntityId
            );
            effectiveAssignmentId = response.serverEntityId;
          }

          // Local lifecycle mutations are applied atomically before enqueueing.
          // A delayed response for an older command must only advance the
          // server revision; it must never roll a newer local state backwards.
          await tx.runAsync(
            `
              UPDATE patrol_assignments
              SET revision = COALESCE(?, revision)
              WHERE owner_user_id = ? AND assignment_id = ?
            `,
            [response.serverRevision, command.owner_user_id, effectiveAssignmentId]
          );
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = COALESCE((
                SELECT status
                FROM patrol_assignments
                WHERE owner_user_id = ? AND assignment_id = ?
                LIMIT 1
              ), status)
              WHERE owner_user_id = ?
                AND request_id = (
                  SELECT request_id
                  FROM patrol_assignments
                  WHERE owner_user_id = ? AND assignment_id = ?
                  LIMIT 1
                )
            `,
            [
              command.owner_user_id,
              effectiveAssignmentId,
              command.owner_user_id,
              command.owner_user_id,
              effectiveAssignmentId
            ]
          );

          if (response.serverRevision !== null) {
            await updatePendingPatrolSwitchRevision(tx, command.owner_user_id, effectiveAssignmentId, response.serverRevision);
            if (command.command_type === "switchPatrolAssignment") {
              const payload = JSON.parse(command.payload_json) as { sourceAssignmentId: string; sourceRevision: number };
              const sourceRevision = payload.sourceRevision + 1;
              await tx.runAsync("UPDATE patrol_assignments SET revision = ? WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?", [sourceRevision, command.owner_user_id, currentContourId, payload.sourceAssignmentId]);
              await updatePendingPatrolSwitchRevision(tx, command.owner_user_id, payload.sourceAssignmentId, sourceRevision);
              await updatePendingCompleteReportBaseRevisionInTransaction(tx, command.owner_user_id, payload.sourceAssignmentId, sourceRevision);
            }
            await updatePendingCompleteReportBaseRevisionInTransaction(
              tx,
              command.owner_user_id,
              effectiveAssignmentId,
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

        if (command?.command_type === "startPlannedWork" && command.entity_local_id) {
          await tx.runAsync(
            `
              DELETE FROM work_tasks
              WHERE owner_user_id = ?
                AND item_kind = 'planTask'
                AND plan_task_id = (
                  SELECT plan_task_id
                  FROM work_tasks
                  WHERE owner_user_id = ?
                    AND task_id = ?
                  LIMIT 1
                )
            `,
            [command.owner_user_id, command.owner_user_id, command.entity_local_id]
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
            attempt_count: number | null;
        }>(
          `
            SELECT owner_user_id, command_type, entity_type, entity_local_id, payload_json, attempt_count
            FROM outbox_commands
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
          `,
          [ownerUserId, currentContourId, response.clientOperationId]
        );

        if (command) {
          const lifecycleRejection =
            response.status === "rejected"
            && isRecoverableLifecycleRejection(command.command_type, response.message);
          // An ordering race clears within a few passes. The same answer after
          // that means the server closed the patrol: stop retrying, ask for a decision.
          const recoverableLifecycleRejection = lifecycleRejection
            && Number(command.attempt_count ?? 0) < maxRecoverableLifecycleAttempts;
          if (lifecycleRejection && !recoverableLifecycleRejection) {
            await tx.runAsync(
              `UPDATE outbox_commands SET last_error = ?, updated_at_local = ?
                WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
              [exhaustedLifecycleMessage, updatedAtLocal, command.owner_user_id, currentContourId, response.clientOperationId]
            );
          }
          if (!recoverableLifecycleRejection) {
            const conflictId = response.conflictId ?? `${response.status}-${response.clientOperationId}`;
            await tx.runAsync(
              `
                INSERT OR REPLACE INTO sync_conflicts (
                  conflict_id,
                  owner_user_id,
                  contour_id,
                  client_operation_id,
                  entity_type,
                  reason,
                  payload_snapshot_json,
                  status,
                  resolution_status,
                  resolved_at,
                  resolution_reason
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'open', NULL, NULL)
              `,
              [
                conflictId,
                command.owner_user_id,
                currentContourId,
                response.clientOperationId,
                command.entity_type,
                response.message,
                command.payload_json
              ]
            );
          } else {
            const retryAt = new Date(Date.now() + 30_000).toISOString();
            await tx.runAsync(
              `UPDATE outbox_commands
                  SET status = 'retryLater',
                      next_attempt_at = ?,
                      retry_reason = 'server',
                      last_error = ?,
                      updated_at_local = ?
                WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
              [
                retryAt,
                recoverableLifecycleMessage(command.command_type),
                updatedAtLocal,
                command.owner_user_id,
                currentContourId,
                response.clientOperationId
              ]
            );
            await resolveRecoverableOutboxConflict(
              tx,
              command.owner_user_id,
              response.clientOperationId,
              updatedAtLocal
            );
          }

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
                SET status = CASE WHEN ? = 'conflict' THEN 'conflict' ELSE status END,
                    sync_status = ?
                WHERE owner_user_id = ? AND task_id = ?
              `,
              [response.status, response.status, command.owner_user_id, command.entity_local_id]
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
          const isPointDeliveryRejection =
            response.status === "rejected"
            && ["scanPatrolPointNfc", "scanPatrolPointQr", "markPatrolPointOk", "markPatrolPointIssue"].includes(command.command_type);
          const assignmentId = resolvePatrolAssignmentIdentity({
            commandType: command.command_type,
            entityType: command.entity_type,
            entityLocalId: command.entity_local_id,
            payload: command.payload_json
          }) ?? (isCancelledByServer ? extractAssignmentId(command.payload_json) : null);
          const releaseResolution = command.command_type === "releasePatrolRequest"
            ? getReleaseResponseResolution(response.status)
            : null;
          if (releaseResolution?.restoreAccepted && command.entity_local_id) {
            await tx.runAsync(
              `
                UPDATE patrol_assignments
                SET status = ?
                WHERE owner_user_id = ? AND assignment_id = ?
              `,
              [releaseResolution.assignmentStatus, command.owner_user_id, command.entity_local_id]
            );
            await tx.runAsync(
              `
                UPDATE patrol_request_board
                SET status = 'accepted'
                WHERE owner_user_id = ? AND request_id = (
                  SELECT request_id
                  FROM patrol_assignments
                  WHERE owner_user_id = ? AND assignment_id = ?
                  LIMIT 1
                )
              `,
              [command.owner_user_id, command.owner_user_id, command.entity_local_id]
            );
            continue;
          }
          // A refused handover was already given back to the previous
          // performer (applyPatrolTransferResponseInTransaction); the patrol
          // itself stays usable.
          if (command.command_type === "transferPatrolAssignment" && !isCancelledByServer) continue;
          if (assignmentId) {
            if (isCancelledByServer) {
              await finalizeCancelledAssignmentInTransaction(tx, command.owner_user_id, assignmentId);
              continue;
            }

            if (recoverableLifecycleRejection) {
              await tx.runAsync(
                `UPDATE patrol_assignments
                    SET status = CASE WHEN status = 'completedLocal' THEN status ELSE 'inProgress' END
                  WHERE owner_user_id = ? AND assignment_id = ?`,
                [command.owner_user_id, assignmentId]
              );
              await tx.runAsync(
                `UPDATE patrol_request_board
                    SET status = CASE WHEN status = 'completedLocal' THEN status ELSE 'inProgress' END
                  WHERE owner_user_id = ? AND request_id = (
                    SELECT request_id
                    FROM patrol_assignments
                    WHERE owner_user_id = ? AND assignment_id = ?
                    LIMIT 1
                  )`,
                [command.owner_user_id, command.owner_user_id, assignmentId]
              );
              continue;
            }

            const nextStatus = response.status === "conflict"
              ? "needsDispatcherDecision"
              // A malformed or temporarily rejected point is an outbox
              // problem, not a lifecycle transition. Keep the route editable
              // and surface the command error next to the affected point.
              : isRepairableCompletionRejection || isPointDeliveryRejection ? "inProgress" : "syncError";
            await tx.runAsync(
              `
                UPDATE patrol_assignments
                SET status = ?
                WHERE owner_user_id = ? AND assignment_id = ?
              `,
              [nextStatus, command.owner_user_id, assignmentId]
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
              [nextStatus, command.owner_user_id, command.owner_user_id, assignmentId]
            );
          }
        }
      }
    }
    if (context) await assertDataOwnerContext(context);
    })
  );

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
