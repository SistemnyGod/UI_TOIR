import * as SQLite from "expo-sqlite";
import { assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { BootstrapConflictResolutionDto, BootstrapDto } from "@/domain/patrol/patrolTypes";
import { finalizeCancelledAssignmentInTransaction } from "@/db/repositories/patrolCancellationRepository";
import { deletePatrolPhotoDirectory } from "@/services/fileStorageService";
import { resolveBootstrapAssignmentStatus } from "@/domain/sync/bootstrapResolutionPolicy";
import { getSnapshotRefreshPlan } from "@/domain/patrol/snapshotPolicy";
import { resolveAssignmentSnapshot } from "@/domain/patrol/assignmentSnapshot";
import { isPatrolAssignmentCommand, resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";

const bootstrapScope = `bootstrap:${currentContourId}`;

const contourGuardTableNames = ["files", "outbox_commands", "sync_cursors", "sync_conflicts"] as const;
type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;
type BootstrapAssignment = BootstrapDto["assignments"][number];

async function hasUnfinishedAssignmentCommandInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  assignmentId: string
) {
  const row = await tx.getFirstAsync<{ hasCommand: number }>(
    `
      SELECT 1 AS hasCommand
      FROM outbox_commands command
      WHERE command.owner_user_id = ?
        AND (command.contour_id = ? OR command.contour_id IS NULL)
        AND (
          command.entity_local_id = ?
          OR command.entity_server_id = ?
          OR (json_valid(command.payload_json) AND (
            json_extract(command.payload_json, '$.assignmentId') = ?
            OR json_extract(command.payload_json, '$.sourceAssignmentId') = ?
          ))
        )
        AND (
          command.status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'blocked', 'wrong_contour')
          OR (
            command.status = 'conflict'
            AND (
              NOT EXISTS (
                SELECT 1 FROM sync_conflicts conflict
                WHERE conflict.owner_user_id = command.owner_user_id
                  AND (conflict.contour_id = command.contour_id OR conflict.contour_id IS NULL)
                  AND conflict.client_operation_id = command.client_operation_id
              )
              OR EXISTS (
                SELECT 1 FROM sync_conflicts conflict
                WHERE conflict.owner_user_id = command.owner_user_id
                  AND (conflict.contour_id = command.contour_id OR conflict.contour_id IS NULL)
                  AND conflict.client_operation_id = command.client_operation_id
                  AND conflict.status NOT IN ('resolved', 'dismissed')
              )
            )
          )
        )
      LIMIT 1
    `,
    [ownerUserId, currentContourId, assignmentId, assignmentId, assignmentId, assignmentId]
  );
  return Boolean(row);
}

async function reconcileAssignmentIdentityInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  serverAssignment: BootstrapAssignment
) {
  const localAssignments = await tx.getAllAsync<{
    assignmentId: string;
    status: string;
    startedAtLocal: string | null;
    completedAtLocal: string | null;
    localReportPresent: number;
    localReportNeedsReview: number;
  }>(
    `
      SELECT
        assignment_id AS assignmentId,
        status,
        started_at_local AS startedAtLocal,
        completed_at_local AS completedAtLocal,
        local_report_present AS localReportPresent,
        local_report_needs_review AS localReportNeedsReview
      FROM patrol_assignments
      WHERE owner_user_id = ?
        AND request_id = ?
        AND assignment_id <> ?
        AND (contour_id = ? OR contour_id IS NULL)
    `,
    [ownerUserId, serverAssignment.requestId, serverAssignment.assignmentId, currentContourId]
  );

  for (const local of localAssignments) {
    const handoff = await tx.getFirstAsync<{ clientOperationId: string }>(
      `
        SELECT client_operation_id AS clientOperationId
        FROM outbox_commands
        WHERE owner_user_id = ?
          AND (contour_id = ? OR contour_id IS NULL)
          AND command_type = 'handoffPatrolAssignment'
          AND entity_local_id = ?
          AND status NOT IN ('superseded', 'rejected')
        LIMIT 1
      `,
      [ownerUserId, currentContourId, local.assignmentId]
    );

    const hasUnfinishedCommand = await hasUnfinishedAssignmentCommandInTransaction(tx, ownerUserId, local.assignmentId);
    const resolvedStatus = resolveBootstrapAssignmentStatus(local.status, serverAssignment.status, hasUnfinishedCommand);
    const preserveLocalStatus = resolvedStatus === local.status && local.status !== serverAssignment.status;

    await tx.runAsync(
      `
        INSERT OR REPLACE INTO assignment_route_points (
          assignment_id, point_id, route_id, name, description, instruction,
          order_index, nfc_uid_hash, qr_code_hash, required, requires_photo, revision
        )
        SELECT ?, point_id, route_id, name, description, instruction,
          order_index, nfc_uid_hash, qr_code_hash, required, requires_photo, revision
        FROM assignment_route_points
        WHERE assignment_id = ?
      `,
      [serverAssignment.assignmentId, local.assignmentId]
    );
    await tx.runAsync(
      "UPDATE point_results SET assignment_id = ? WHERE owner_user_id = ? AND assignment_id = ?",
      [serverAssignment.assignmentId, ownerUserId, local.assignmentId]
    );
    await tx.runAsync(
      "UPDATE files SET assignment_id = ?, contour_id = COALESCE(contour_id, ?) WHERE owner_user_id = ? AND assignment_id = ?",
      [serverAssignment.assignmentId, currentContourId, ownerUserId, local.assignmentId]
    );
    await tx.runAsync(
      "UPDATE patrol_appeals SET assignment_id = ? WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
      [serverAssignment.assignmentId, ownerUserId, currentContourId, local.assignmentId]
    );
    // The local/server identity merge must carry every reference to the
    // assignment, including both sides of a pending switch.  Keeping the
    // source id under the old key can leave cancellation and switch commands
    // pointing at a deleted local assignment after bootstrap.
    await tx.runAsync(
      `INSERT OR REPLACE INTO patrol_report_cache (
         owner_user_id, contour_id, assignment_id, route_name, employee_name,
         completed_at, cached_at
       )
       SELECT owner_user_id, contour_id, ?, route_name, employee_name,
              completed_at, cached_at
         FROM patrol_report_cache
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [serverAssignment.assignmentId, ownerUserId, currentContourId, local.assignmentId]
    );
    await tx.runAsync(
      `INSERT OR REPLACE INTO patrol_report_detail_cache (
         owner_user_id, contour_id, assignment_id, points_json, cached_at
       )
       SELECT owner_user_id, contour_id, ?, points_json, cached_at
         FROM patrol_report_detail_cache
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [serverAssignment.assignmentId, ownerUserId, currentContourId, local.assignmentId]
    );
    await tx.runAsync(
      `UPDATE patrol_device_context
          SET assignment_id = ?
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [serverAssignment.assignmentId, ownerUserId, currentContourId, local.assignmentId]
    );

    const commands = await tx.getAllAsync<{
      clientOperationId: string;
      entityLocalId: string | null;
      entityServerId: string | null;
      payloadJson: string;
      status: string;
      lastError: string | null;
    }>(
      `
        SELECT
          client_operation_id AS clientOperationId,
          entity_local_id AS entityLocalId,
          entity_server_id AS entityServerId,
          payload_json AS payloadJson,
          status,
          last_error AS lastError
        FROM outbox_commands
        WHERE owner_user_id = ?
          AND (contour_id = ? OR contour_id IS NULL)
          AND (aggregate_key = ? OR entity_local_id = ? OR entity_server_id = ? OR
            (json_valid(payload_json) AND (json_extract(payload_json, '$.assignmentId') = ? OR json_extract(payload_json, '$.sourceAssignmentId') = ?)))
      `,
      [ownerUserId, currentContourId, `patrolAssignment:${local.assignmentId}`, local.assignmentId, local.assignmentId, local.assignmentId, local.assignmentId]
    );

    for (const command of commands) {
      let payloadJson = command.payloadJson;
      try {
        const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
        let changed = false;
        if (payload.sourceAssignmentId === local.assignmentId) {
          payload.sourceAssignmentId = serverAssignment.assignmentId;
          changed = true;
        }
        if (payload.assignmentId === local.assignmentId) {
          payload.assignmentId = serverAssignment.assignmentId;
          changed = true;
        }
        if (changed) {
          payloadJson = JSON.stringify(payload);
        }
      } catch {
        payloadJson = command.payloadJson;
      }

      const staleMissingAssignmentConflict = !handoff
        && (command.status === "conflict" || command.status === "rejected")
        && command.lastError?.includes("Assignment is not available") === true;
      const nextStatus = staleMissingAssignmentConflict ? "superseded" : command.status;

      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET contour_id = COALESCE(contour_id, ?),
              entity_local_id = CASE WHEN entity_local_id = ? THEN ? ELSE entity_local_id END,
              entity_server_id = CASE WHEN entity_server_id = ? THEN ? ELSE entity_server_id END,
              aggregate_key = CASE WHEN aggregate_key = ? THEN ? ELSE aggregate_key END,
              payload_json = ?,
              status = ?,
              last_error = CASE WHEN ? = 'superseded' THEN NULL ELSE last_error END
          WHERE client_operation_id = ?
        `,
        [
          currentContourId,
          local.assignmentId,
          serverAssignment.assignmentId,
          local.assignmentId,
          serverAssignment.assignmentId,
          `patrolAssignment:${local.assignmentId}`,
          `patrolAssignment:${serverAssignment.assignmentId}`,
          payloadJson,
          nextStatus,
          nextStatus,
          command.clientOperationId
        ]
      );

      if (staleMissingAssignmentConflict) {
        await tx.runAsync(
          `
            UPDATE sync_conflicts
            SET status = 'resolved'
            WHERE owner_user_id = ?
              AND (contour_id = ? OR contour_id IS NULL)
              AND client_operation_id = ?
              AND status NOT IN ('resolved', 'dismissed')
          `,
          [ownerUserId, currentContourId, command.clientOperationId]
        );
      }
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
      [ownerUserId, currentContourId, local.assignmentId, local.assignmentId]
    );
    for (const conflict of conflicts) {
      try {
        const payload = JSON.parse(conflict.payloadSnapshotJson) as Record<string, unknown>;
        let changed = false;
        if (payload.sourceAssignmentId === local.assignmentId) {
          payload.sourceAssignmentId = serverAssignment.assignmentId;
          changed = true;
        }
        if (payload.assignmentId === local.assignmentId) {
          payload.assignmentId = serverAssignment.assignmentId;
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
        // Preserve malformed legacy snapshots; the conflict remains visible.
      }
    }

    if (preserveLocalStatus) {
      await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET status = ?,
              started_at_local = COALESCE(started_at_local, ?),
              completed_at_local = COALESCE(completed_at_local, ?),
              local_report_present = MAX(local_report_present, ?),
              local_report_needs_review = MAX(local_report_needs_review, ?)
          WHERE owner_user_id = ?
            AND assignment_id = ?
            AND contour_id = ?
        `,
        [
          local.status,
          local.startedAtLocal,
          local.completedAtLocal,
          local.localReportPresent,
          local.localReportNeedsReview,
          ownerUserId,
          serverAssignment.assignmentId,
          currentContourId
        ]
      );
    }

    // Report presence is independent from the server lifecycle status. Carry
    // it across the identity merge even when the server snapshot wins status.
    await tx.runAsync(
      `UPDATE patrol_assignments
          SET local_report_present = MAX(local_report_present, ?),
              local_report_needs_review = MAX(local_report_needs_review, ?)
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [local.localReportPresent, local.localReportNeedsReview, ownerUserId, currentContourId, serverAssignment.assignmentId]
    );

    await tx.runAsync("DELETE FROM assignment_route_points WHERE assignment_id = ?", [local.assignmentId]);
    await tx.runAsync(
      "DELETE FROM patrol_report_cache WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
      [ownerUserId, currentContourId, local.assignmentId]
    );
    await tx.runAsync(
      "DELETE FROM patrol_report_detail_cache WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
      [ownerUserId, currentContourId, local.assignmentId]
    );
    await tx.runAsync(
      "DELETE FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ?",
      [ownerUserId, local.assignmentId]
    );
  }
}

export async function clearLocalUserData() {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await clearLocalUserTablesInTransaction(tx);
    })
  );

  await deletePatrolPhotoDirectory();
}

export async function hasLocalUserData() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(`
    SELECT
      (
        (SELECT COUNT(*) FROM users) +
        (SELECT COUNT(*) FROM patrol_assignments) +
        (SELECT COUNT(*) FROM point_results) +
        (SELECT COUNT(*) FROM files) +
        (SELECT COUNT(*) FROM outbox_commands) +
        (SELECT COUNT(*) FROM work_tasks) +
        (SELECT COUNT(*) FROM mobile_notifications) +
        (SELECT COUNT(*) FROM shift_remarks) +
        (SELECT COUNT(*) FROM mobile_action_log)
      ) AS count
  `);

  return (row?.count ?? 0) > 0;
}
export async function hasUnscopedLocalData() {
  const db = await getDatabase();
  const countExpression = contourGuardTableNames
    .map((tableName) => "(SELECT COUNT(*) FROM " + tableName + " WHERE contour_id IS NULL)")
    .join(" + ");
  const row = await db.getFirstAsync<{ count: number }>("SELECT " + countExpression + " AS count");
  return (row?.count ?? 0) > 0;
}


export async function countBlockingLocalUserData() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(`
    SELECT
      (
        (SELECT COUNT(*) FROM patrol_assignments
          WHERE status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')) +
        (SELECT COUNT(*) FROM point_results
          WHERE sync_status NOT IN ('synced', 'cancelled')
            AND EXISTS (
              SELECT 1
              FROM patrol_assignments assignment
              WHERE assignment.assignment_id = point_results.assignment_id
                AND assignment.status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')
            )) +
        (SELECT COUNT(*) FROM files
          WHERE status NOT IN ('uploaded', 'linked')
            AND NOT EXISTS (
              SELECT 1
              FROM patrol_assignments assignment
              WHERE assignment.assignment_id = files.assignment_id
                AND assignment.owner_user_id = files.owner_user_id
                AND assignment.status IN ('cancelled', 'cancelledServer')
            )) +
        (SELECT COUNT(*) FROM outbox_commands
          WHERE status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked')) +
        (SELECT COUNT(*) FROM sync_conflicts
          WHERE status NOT IN ('resolved', 'dismissed')) +
        (SELECT COUNT(*) FROM work_tasks
          WHERE status IN ('inProgress', 'paused', 'completedLocal', 'syncError')
             OR sync_status NOT IN ('synced', 'cancelled')) +
        (SELECT COUNT(*) FROM shift_remarks
          WHERE sync_status NOT IN ('synced', 'cancelled')) +
        (SELECT COUNT(*) FROM mobile_diagnostic_reports
          WHERE status = 'pending')
      ) AS count
  `);

  return row?.count ?? 0;
}

export async function getLocalUserProfile(ownerUserId: string) {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    server_user_id: string;
    full_name: string;
  }>(
    `
      SELECT server_user_id, full_name
      FROM users
      WHERE server_user_id = ?
        AND contour_id = ?
      LIMIT 1
    `,
    [ownerUserId, currentContourId]
  );

  return row
    ? {
        serverUserId: row.server_user_id,
        fullName: row.full_name
      }
    : null;
}

export async function saveBootstrap(bootstrap: BootstrapDto, options?: { force?: boolean; context?: DataOwnerContext }) {
  const context = options?.context;
  if (context) {
    await assertDataOwnerContext(context);
    if (bootstrap.user.serverUserId !== context.ownerUserId) {
      throw new Error("Данные сервера принадлежат другому мобильному аккаунту.");
    }
  }
  if (await hasUnscopedLocalData()) {
    throw new Error("Локальные данные не привязаны к серверному контуру. Выполните вход после безопасной очистки или синхронизации очереди.");
  }

  const currentCursor = await getBootstrapSyncCursor();
  if (!options?.force && bootstrap.syncCursor && bootstrap.syncCursor === currentCursor) {
    return false;
  }

  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      if (context) await assertDataOwnerContext(context);
      await saveBootstrapInTransaction(tx, bootstrap);
      if (context) await assertDataOwnerContext(context);
    })
  );
  return true;
}

export async function getBootstrapSyncCursor() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cursor_value: string | null }>(
    "SELECT cursor_value FROM sync_cursors WHERE scope = ? AND contour_id = ? LIMIT 1",
    [bootstrapScope, currentContourId]
  );
  return row?.cursor_value ?? null;
}

export async function replaceLocalUserDataWithBootstrap(bootstrap: BootstrapDto) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await clearLocalUserTablesInTransaction(tx);
      await saveBootstrapInTransaction(tx, bootstrap);
      await tx.runAsync(
        `INSERT OR REPLACE INTO auth_transition (id, target_owner_user_id, contour_id, started_at)
         VALUES (1, ?, ?, ?)`,
        [bootstrap.user.serverUserId, currentContourId, new Date().toISOString()]
      );
    })
  );
}

export type PendingAuthTransition = {
  targetOwnerUserId: string;
  contourId: string;
  startedAt: string;
};

export async function getPendingAuthTransition(): Promise<PendingAuthTransition | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PendingAuthTransition>(
    `SELECT target_owner_user_id AS targetOwnerUserId,
            contour_id AS contourId,
            started_at AS startedAt
       FROM auth_transition WHERE id = 1`
  );
}

export async function completePendingAuthTransition(targetOwnerUserId: string) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const transition = await tx.getFirstAsync<{ targetOwnerUserId: string }>(
        "SELECT target_owner_user_id AS targetOwnerUserId FROM auth_transition WHERE id = 1"
      );
      if (transition && transition.targetOwnerUserId !== targetOwnerUserId) {
        throw new Error("Нельзя завершить переход для другого пользователя.");
      }
      await tx.runAsync("DELETE FROM auth_transition WHERE id = 1");
    })
  );
}

export async function cleanupPreviousUserPhotos() {
  await deletePatrolPhotoDirectory();
}

async function clearLocalUserTablesInTransaction(executor: SqlExecutor) {
  await executor.runAsync("DELETE FROM auth_transition");
  await executor.runAsync("DELETE FROM sync_conflicts");
  await executor.runAsync("DELETE FROM outbox_commands");
  await executor.runAsync("DELETE FROM files");
  await executor.runAsync("DELETE FROM point_results");
  await executor.runAsync("DELETE FROM assignment_route_points");
  await executor.runAsync("DELETE FROM patrol_assignments");
  await executor.runAsync("DELETE FROM patrol_request_board");
  await executor.runAsync("DELETE FROM route_points");
  await executor.runAsync("DELETE FROM routes");
  await executor.runAsync("DELETE FROM devices");
  await executor.runAsync("DELETE FROM users");
  await executor.runAsync("DELETE FROM sync_cursors");
  await executor.runAsync("DELETE FROM mobile_employees");
  await executor.runAsync("DELETE FROM emu_sections");
  await executor.runAsync("DELETE FROM work_tasks");
  await executor.runAsync("DELETE FROM mobile_notifications");
  await executor.runAsync("DELETE FROM shift_remarks");
    await executor.runAsync("DELETE FROM mobile_action_log");
    await executor.runAsync("DELETE FROM mobile_diagnostic_reports");
    await executor.runAsync("DELETE FROM mobile_diagnostic_state");
}

function conflictSnapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function conflictSnapshotString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function conflictSnapshotJson(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : null;
}

async function applyConflictEntitySnapshotInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  entityType: string,
  entityLocalId: string | null,
  resolution: BootstrapConflictResolutionDto
) {
  const snapshot = conflictSnapshotRecord(resolution.responseSnapshot);
  if (!snapshot || snapshot.entityType !== entityType) return false;
  const resolvedAt = resolution.resolvedAt;
  if (entityType === "patrolPoint") {
    const assignmentId = conflictSnapshotString(snapshot, "assignmentId");
    const pointId = conflictSnapshotString(snapshot, "pointId");
    const status = conflictSnapshotString(snapshot, "status");
    if (!assignmentId || !pointId || !status || (entityLocalId && entityLocalId !== pointId)) return false;
    const revision = typeof snapshot.serverRevision === "number" ? snapshot.serverRevision : null;
    const result = await tx.runAsync(
      `UPDATE point_results
         SET status = ?, comment = ?, issue_type_id = ?, severity = ?, sync_status = ?, server_revision = ?, accepted_operation_id = ?, last_synced_at = ?
       WHERE owner_user_id = ? AND assignment_id = ? AND point_id = ?`,
      [status, conflictSnapshotString(snapshot, "comment"), conflictSnapshotString(snapshot, "issueTypeId"), conflictSnapshotString(snapshot, "severity"), "synced", revision, resolution.clientOperationId, resolvedAt, ownerUserId, assignmentId, pointId]
    );
    return result.changes === 1;
  }
  if (entityType === "workTask") {
    const localTaskId = entityLocalId ?? conflictSnapshotString(snapshot, "taskId");
    const status = conflictSnapshotString(snapshot, "status");
    const revision = typeof snapshot.revision === "number" ? snapshot.revision : null;
    if (!localTaskId || !status || revision === null) return false;
    const result = await tx.runAsync(
      `UPDATE work_tasks
          SET title = COALESCE(?, title),
              status = ?,
              planned_at = ?,
              revision = ?,
              completed_at_local = COALESCE(?, completed_at_local),
              section_id = ?,
              section_name = ?,
              employee_id = ?,
              employee_name = ?,
              source = COALESCE(?, source),
              approval_status = COALESCE(?, approval_status),
              assigned_employees_json = COALESCE(?, assigned_employees_json),
              actual_participants_json = COALESCE(?, actual_participants_json),
              attachments_json = COALESCE(?, attachments_json),
              capabilities_json = COALESCE(?, capabilities_json),
              sync_status = ?
        WHERE owner_user_id = ? AND task_id = ?`,
      [
        conflictSnapshotString(snapshot, "title"),
        status,
        conflictSnapshotString(snapshot, "plannedAt"),
        revision,
        conflictSnapshotString(snapshot, "completedAtLocal"),
        conflictSnapshotString(snapshot, "sectionId"),
        conflictSnapshotString(snapshot, "sectionName"),
        conflictSnapshotString(snapshot, "employeeId"),
        conflictSnapshotString(snapshot, "employeeName"),
        conflictSnapshotString(snapshot, "source"),
        conflictSnapshotString(snapshot, "approvalStatus"),
        conflictSnapshotJson(snapshot, "assignedEmployees"),
        conflictSnapshotJson(snapshot, "actualParticipants"),
        conflictSnapshotJson(snapshot, "attachments"),
        conflictSnapshotJson(snapshot, "capabilities"),
        "synced",
        ownerUserId,
        localTaskId
      ]
    );
    return result.changes === 1;
  }
  if (entityType === "shiftRemark") {
    const remarkId = conflictSnapshotString(snapshot, "remarkId") ?? entityLocalId;
    const status = conflictSnapshotString(snapshot, "status");
    if (!remarkId || !status) return false;
    const result = await tx.runAsync(
      `UPDATE shift_remarks SET title = COALESCE(?, title), comment = COALESCE(?, comment), status = ?, server_remark_id = COALESCE(?, server_remark_id), sync_status = ? WHERE owner_user_id = ? AND remark_id = ?`,
      [conflictSnapshotString(snapshot, "title"), conflictSnapshotString(snapshot, "comment"), status, conflictSnapshotString(snapshot, "serverRemarkId"), "synced", ownerUserId, remarkId]
    );
    return result.changes === 1;
  }
  return false;
}

async function applyBootstrapConflictResolutionsInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  bootstrap: BootstrapDto
) {
  for (const resolution of bootstrap.conflictResolutions ?? []) {
    if (!['accepted', 'serverWins', 'resolvedServerWins'].includes(resolution.resolutionStatus)) {
      continue;
    }

    const command = await tx.getFirstAsync<{
      entityLocalId: string | null;
      entityServerId: string | null;
      commandType: string;
      entityType: string;
      payloadJson: string;
    }>(
      `
        SELECT
          entity_local_id AS entityLocalId,
          entity_server_id AS entityServerId,
          command_type AS commandType,
          entity_type AS entityType,
          payload_json AS payloadJson
        FROM outbox_commands
        WHERE owner_user_id = ?
          AND contour_id = ?
          AND client_operation_id = ?
        LIMIT 1
      `,
      [ownerUserId, currentContourId, resolution.clientOperationId]
    );
    if (!command) {
      continue;
    }

    const assignmentInput = {
      commandType: command.commandType,
      entityType: command.entityType,
      entityLocalId: resolution.entityLocalId ?? command.entityLocalId,
      payload: command.payloadJson
    };
    const assignmentCommand = isPatrolAssignmentCommand(assignmentInput);
    const assignmentId = resolvePatrolAssignmentIdentity(assignmentInput);
    const assignment = assignmentId
      ? bootstrap.assignments.find((item) => item.assignmentId === assignmentId)
      : null;
    const assignmentWasCancelled = assignmentCommand
      && Boolean(assignmentId && bootstrap.cancelledAssignmentIds?.includes(assignmentId));
    if (assignmentCommand && (!assignmentId || (!assignment && !assignmentWasCancelled))) {
      continue;
    }

    if (!assignmentCommand) {
      const entitySnapshotApplied = await applyConflictEntitySnapshotInTransaction(tx, ownerUserId, command.entityType, command.entityLocalId, resolution);
      if (!entitySnapshotApplied) {
        switch (command.entityType) {
          case "patrolPoint":
          case "workTask":
          case "shiftRemark":
            continue;
          default:
            continue;
        }
      }
    }
    if (assignmentWasCancelled && assignmentId) {
      await finalizeCancelledAssignmentInTransaction(tx, ownerUserId, assignmentId);
      continue;
    }

    if (assignment) {
      const request = bootstrap.requestBoard.find((item) => item.requestId === assignment.requestId);
      const assignmentUpdate = await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET status = ?,
              revision = ?,
              started_at_local = COALESCE(?, started_at_local),
              completed_at_local = COALESCE(?, completed_at_local)
          WHERE owner_user_id = ?
            AND assignment_id = ?
            AND (contour_id = ? OR contour_id IS NULL)
        `,
        [
          assignment.status,
          assignment.revision,
          assignment.startedAtLocal,
          assignment.completedAtLocal,
          ownerUserId,
          assignment.assignmentId,
          currentContourId
        ]
      );
      if (assignmentUpdate.changes !== 1) {
        continue;
      }
      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = ?, revision = ?
          WHERE owner_user_id = ? AND request_id = ?
        `,
        [
          request?.status ?? assignment.status,
          request?.revision ?? assignment.revision,
          ownerUserId,
          assignment.requestId
        ]
      );
    }

    await tx.runAsync(
      `
        UPDATE outbox_commands
        SET status = 'superseded',
            last_error = NULL,
            next_attempt_at = NULL,
            updated_at_local = ?
        WHERE owner_user_id = ?
          AND contour_id = ?
          AND client_operation_id = ?
          AND status IN ('conflict', 'rejected')
      `,
      [bootstrap.serverTime, ownerUserId, currentContourId, resolution.clientOperationId]
    );
    await tx.runAsync(
      `
        UPDATE sync_conflicts
        SET status = 'resolved',
            resolution_status = 'resolvedServerWins',
            resolved_at = ?,
            resolution_reason = ?
        WHERE owner_user_id = ?
          AND contour_id = ?
          AND client_operation_id = ?
          AND status NOT IN ('resolved', 'dismissed')
      `,
      [
        resolution.resolvedAt,
        'Решение web-оператора получено через bootstrap.',
        ownerUserId,
        currentContourId,
        resolution.clientOperationId
      ]
    );

  }
}
async function refreshAssignmentSnapshotInTransaction(
  tx: SqlExecutor,
  assignment: BootstrapAssignment,
  bootstrap: BootstrapDto
) {
  const local = await tx.getFirstAsync<{ status: string; snapshotVersion: number | null; pointCount: number; revision: number }>(
    `
      SELECT
        status,
        revision,
        snapshot_version AS snapshotVersion,
        (SELECT COUNT(*) FROM assignment_route_points point WHERE point.assignment_id = patrol_assignments.assignment_id) AS pointCount
      FROM patrol_assignments
      WHERE owner_user_id = ?
        AND assignment_id = ?
        AND (contour_id = ? OR contour_id IS NULL)
      LIMIT 1
    `,
    [bootstrap.user.serverUserId, assignment.assignmentId, currentContourId]
  );
  if (!local || local.revision > assignment.revision) {
    return;
  }

  const incoming = resolveAssignmentSnapshot(bootstrap, assignment);
  if (!incoming) return;
  const { route, points, manifest } = incoming;
  const snapshotAllowFreeOrder = route?.allowFreeOrder === false ? 0 : 1;
  const snapshotNfcEnabled = route?.nfcEnabled === true ? 1 : 0;
  const snapshotQrFallbackEnabled = route?.qrFallbackEnabled === false ? 0 : 1;
  const snapshotPlan = getSnapshotRefreshPlan({
    localStatus: local.status,
    localSnapshotVersion: local.snapshotVersion,
    localPointCount: local.pointCount,
    routeVersion: route.version,
    incomingPointIds: points.map((point) => point.pointId)
  });
  if (!snapshotPlan.shouldReplace) {
    return;
  }
  const manifestMatchesSnapshot = Boolean(
    manifest
    && manifest.isComplete
    && manifest.routeVersion === snapshotPlan.snapshotVersion
    && assignment.employeeId
    && bootstrap.boundEmployeesComplete
    && bootstrap.boundEmployees.some((employee) => employee.employeeId === assignment.employeeId)
    && samePointRevisionSet(
      manifest.points.map((point) => [point.pointId, point.revision] as const),
      snapshotPlan.pointIds.map((pointId) => {
        const point = points.find((item) => item.pointId === pointId);
        return [pointId, point?.revision ?? -1] as const;
      })
    )
  );

  await tx.runAsync("DELETE FROM assignment_route_points WHERE assignment_id = ?", [assignment.assignmentId]);
  for (const point of points) {
    if (point.routeId !== assignment.routeId) {
      continue;
    }
    await tx.runAsync(
      `
        INSERT INTO assignment_route_points (
          assignment_id,
          point_id,
          route_id,
          name,
          description,
          instruction,
          order_index,
          nfc_uid_hash,
          qr_code_hash,
          required,
          requires_photo,
          revision
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        assignment.assignmentId,
        point.pointId,
        point.routeId,
        point.name,
        point.description,
        point.instruction,
        point.orderIndex,
        point.nfcUidHash,
        point.qrCodeHash,
        point.required ? 1 : 0,
        point.requiresPhoto ? 1 : 0,
        point.revision
      ]
    );
  }

  if (manifestMatchesSnapshot && manifest) {
    await tx.runAsync(
      `INSERT INTO patrol_snapshot_manifests
        (owner_user_id, contour_id, assignment_id, route_id, route_version, employees_complete, point_revisions_json, saved_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(owner_user_id, contour_id, assignment_id) DO UPDATE SET
         route_id = excluded.route_id,
         route_version = excluded.route_version,
         employees_complete = excluded.employees_complete,
         point_revisions_json = excluded.point_revisions_json,
         saved_at = excluded.saved_at`,
      [bootstrap.user.serverUserId, currentContourId, assignment.assignmentId, manifest.routeId, manifest.routeVersion, JSON.stringify(manifest.points), bootstrap.serverTime]
    );
  } else {
    await tx.runAsync("DELETE FROM patrol_snapshot_manifests WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?", [bootstrap.user.serverUserId, currentContourId, assignment.assignmentId]);
  }

  await tx.runAsync(
    `
      UPDATE patrol_assignments
      SET route_version_no = ?,
          snapshot_version = ?,
          snapshot_created_at = ?,
          snapshot_source = 'bootstrap',
          snapshot_ready = ?,
          snapshot_allow_free_order = ?,
          snapshot_nfc_enabled = ?,
          snapshot_qr_fallback_enabled = ?
      WHERE owner_user_id = ?
        AND assignment_id = ?
        AND (contour_id = ? OR contour_id IS NULL)
    `,
    [snapshotPlan.snapshotVersion, snapshotPlan.snapshotVersion, bootstrap.serverTime, manifestMatchesSnapshot ? 1 : 0, snapshotAllowFreeOrder, snapshotNfcEnabled, snapshotQrFallbackEnabled, bootstrap.user.serverUserId, assignment.assignmentId, currentContourId]
  );
}

function samePointRevisionSet(left: readonly (readonly [string, number])[], right: readonly (readonly [string, number])[]) {
  if (left.length === 0 || left.length !== right.length) return false;
  const expected = new Map(left);
  return expected.size === left.length && right.every(([pointId, revision]) => expected.get(pointId) === revision);
}
async function saveBootstrapInTransaction(tx: SqlExecutor, bootstrap: BootstrapDto) {
  const ownerUserId = bootstrap.user.serverUserId;
  await tx.runAsync("INSERT INTO mobile_capabilities (owner_user_id, contour_id, patrol_appeals, patrol_appeals_paging, patrol_appeals_assignment_paging, work_items_paging, patrol_snapshot_manifest, patrol_point_result_status_extension) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, contour_id) DO UPDATE SET patrol_appeals = excluded.patrol_appeals, patrol_appeals_paging = excluded.patrol_appeals_paging, patrol_appeals_assignment_paging = excluded.patrol_appeals_assignment_paging, work_items_paging = excluded.work_items_paging, patrol_snapshot_manifest = excluded.patrol_snapshot_manifest, patrol_point_result_status_extension = excluded.patrol_point_result_status_extension", [ownerUserId, currentContourId, bootstrap.patrolAppealsAvailable ? 1 : 0, bootstrap.patrolAppealsPaging ? 1 : 0, bootstrap.patrolAppealsAssignmentPaging ? 1 : 0, bootstrap.workItemsPaging ? 1 : 0, bootstrap.patrolSnapshotManifest ? 1 : 0, bootstrap.patrolPointResultStatusExtension ? 1 : 0]);
  for (const appeal of bootstrap.patrolAppeals ?? []) {
    await tx.runAsync(`INSERT INTO patrol_appeals (id, owner_user_id, contour_id, assignment_id, kind, message, status, reply, created_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, owner_user_id, contour_id) DO UPDATE SET
      status = excluded.status, reply = excluded.reply, version = excluded.version
      WHERE excluded.version >= patrol_appeals.version`,
      [appeal.id, ownerUserId, currentContourId, appeal.assignmentId, appeal.kind, appeal.message, appeal.status, appeal.reply, appeal.createdAt, appeal.version]);
  }

  const cancelledAssignmentIds = bootstrap.cancelledAssignmentIds ?? [];
  const serverRouteIds = bootstrap.routes.map((route) => route.routeId);
  const serverPointIdsByRoute = new Map<string, string[]>();
  for (const point of bootstrap.points) {
    const existing = serverPointIdsByRoute.get(point.routeId) ?? [];
    existing.push(point.pointId);
    serverPointIdsByRoute.set(point.routeId, existing);
  }
    await tx.runAsync(
      `
        INSERT INTO users (
          server_user_id,
          contour_id,
          full_name,
          roles_json,
          permissions_json,
          updated_at_server
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_user_id) DO UPDATE SET
          contour_id = excluded.contour_id,
          full_name = excluded.full_name,
          roles_json = excluded.roles_json,
          permissions_json = excluded.permissions_json,
          updated_at_server = excluded.updated_at_server
      `,
      [
        ownerUserId,
        currentContourId,
        bootstrap.user.fullName,
        JSON.stringify(bootstrap.user.roles),
        JSON.stringify(bootstrap.user.permissions),
        bootstrap.user.updatedAtServer
      ]
    );

    await tx.runAsync(
      `
        INSERT INTO devices (
          device_id,
          owner_user_id,
          trusted,
          blocked_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          trusted = excluded.trusted,
          blocked_at = excluded.blocked_at
      `,
      [
        bootstrap.device.deviceId,
        ownerUserId,
        bootstrap.device.trusted ? 1 : 0,
        bootstrap.device.blockedAt
      ]
    );

    await tx.runAsync("DELETE FROM mobile_employees WHERE owner_user_id = ?", [ownerUserId]);
    for (const employee of bootstrap.boundEmployees ?? []) {
      await tx.runAsync(
        `
          INSERT INTO mobile_employees (
            employee_id,
            owner_user_id,
            full_name,
            position,
            department
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(employee_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            full_name = excluded.full_name,
            position = excluded.position,
            department = excluded.department
        `,
        [employee.employeeId, ownerUserId, employee.fullName, employee.position, employee.department]
      );
    }

    await tx.runAsync("DELETE FROM emu_sections");
    for (const section of bootstrap.emuSections ?? []) {
      await tx.runAsync(
        `
          INSERT INTO emu_sections (
            section_id,
            name,
            sort_order
          )
          VALUES (?, ?, ?)
          ON CONFLICT(section_id) DO UPDATE SET
            name = excluded.name,
            sort_order = excluded.sort_order
        `,
        [section.sectionId, section.name, section.sortOrder]
      );
    }

    const serverRequestIds = bootstrap.requestBoard.map((item) => item.requestId);
    if (serverRequestIds.length > 0) {
      const placeholders = serverRequestIds.map(() => "?").join(", ");
      await tx.runAsync(
        `
          DELETE FROM patrol_request_board
          WHERE owner_user_id = ?
            AND request_id NOT IN (${placeholders})
            AND NOT EXISTS (
              SELECT 1
              FROM patrol_assignments assignment
              WHERE assignment.request_id = patrol_request_board.request_id
                AND assignment.status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision', 'cancelledServer')
            )
        `,
        [ownerUserId, ...serverRequestIds]
      );
    } else {
      await tx.runAsync(
        `
          DELETE FROM patrol_request_board
          WHERE owner_user_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM patrol_assignments assignment
              WHERE assignment.request_id = patrol_request_board.request_id
                AND assignment.status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision', 'cancelledServer')
            )
        `,
        [ownerUserId]
      );
    }

    for (const item of bootstrap.requestBoard) {
      await tx.runAsync(
        `
          INSERT INTO patrol_request_board (
            request_id,
            display_number,
            owner_user_id,
            route_id,
            route_name,
            planned_start_at,
            assigned_full_name,
            status,
            revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(request_id) DO UPDATE SET
            display_number = excluded.display_number,
            owner_user_id = excluded.owner_user_id,
            route_id = excluded.route_id,
            route_name = excluded.route_name,
            planned_start_at = excluded.planned_start_at,
            assigned_full_name = excluded.assigned_full_name,
            status = CASE
              WHEN EXISTS (
                SELECT 1
                FROM patrol_assignments assignment
                WHERE assignment.owner_user_id = patrol_request_board.owner_user_id
                  AND assignment.request_id = patrol_request_board.request_id
                  AND assignment.status IN ('completed', 'completedServer', 'cancelled')
              ) THEN 'completed'
              WHEN excluded.status IN ('cancelled', 'cancelledServer')
                AND patrol_request_board.status NOT IN ('completedLocal', 'syncing') THEN 'cancelledServer'
              WHEN patrol_request_board.status IN ('completed', 'cancelled', 'cancelledServer') THEN patrol_request_board.status
              WHEN patrol_request_board.status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_request_board.status
              ELSE excluded.status
            END,
            revision = excluded.revision
        `,
        [
          item.requestId,
          item.displayNumber,
          ownerUserId,
          item.routeId,
          item.routeName,
          item.plannedStartAt,
          item.assignedFullName,
          item.status,
          item.revision
        ]
      );
    }

    for (const item of bootstrap.requestBoard) {
      await tx.runAsync("UPDATE patrol_request_board SET assigned_employee_id = ?, performer_selection_available = ?, route_switch_available = ? WHERE request_id = ? AND owner_user_id = ?",
        [item.assignedEmployeeId ?? null, item.performerSelectionAvailable ? 1 : 0, item.routeSwitchAvailable ? 1 : 0, item.requestId, ownerUserId]);
    }

    await tx.runAsync(
      `
        UPDATE patrol_request_board
        SET status = 'completed'
        WHERE owner_user_id = ?
          AND EXISTS (
            SELECT 1
            FROM patrol_assignments assignment
            WHERE assignment.owner_user_id = patrol_request_board.owner_user_id
              AND assignment.request_id = patrol_request_board.request_id
              AND assignment.status IN ('completed', 'completedServer', 'cancelled')
          )
      `,
      [ownerUserId]
    );

    await tx.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'cancelledServer'
        WHERE owner_user_id = ?
          AND status IN ('accepted', 'inProgress', 'paused')
          AND EXISTS (
            SELECT 1
            FROM patrol_request_board request
            WHERE request.owner_user_id = patrol_assignments.owner_user_id
              AND request.request_id = patrol_assignments.request_id
              AND request.status IN ('cancelled', 'cancelledServer')
          )
      `,
      [ownerUserId]
    );

    if (cancelledAssignmentIds.length > 0) {
      const placeholders = cancelledAssignmentIds.map(() => "?").join(", ");
      await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET status = 'cancelledServer'
          WHERE owner_user_id = ?
            AND assignment_id IN (${placeholders})
            AND status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer')
        `,
        [ownerUserId, ...cancelledAssignmentIds]
      );
    }

    await tx.runAsync(
      `
        UPDATE patrol_request_board
        SET status = 'cancelledServer'
        WHERE owner_user_id = ?
          AND EXISTS (
            SELECT 1
            FROM patrol_assignments assignment
            WHERE assignment.owner_user_id = patrol_request_board.owner_user_id
              AND assignment.request_id = patrol_request_board.request_id
              AND assignment.status = 'cancelledServer'
          )
      `,
      [ownerUserId]
    );

    for (const assignment of bootstrap.assignments) {
      const route = resolveAssignmentSnapshot(bootstrap, assignment)?.route;
      const snapshotVersion = assignment.routeVersionNo;
      const snapshotAllowFreeOrder = route?.allowFreeOrder === false ? 0 : 1;
      const snapshotNfcEnabled = route?.nfcEnabled === true ? 1 : 0;
      const snapshotQrFallbackEnabled = route?.qrFallbackEnabled === false ? 0 : 1;
      const snapshotCreatedAt = bootstrap.serverTime;
      const localAssignment = await tx.getFirstAsync<{ status: string; revision: number }>(
        `SELECT status, revision FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ? AND (contour_id = ? OR contour_id IS NULL)`,
        [ownerUserId, assignment.assignmentId, currentContourId]
      );
      if (localAssignment && localAssignment.revision > assignment.revision) continue;
      // A previous build could clear completed_at_local while retaining the
      // completion command. Recover the original timestamp before merging the
      // server snapshot; never invent a completion time from bootstrap time.
      let completedAtLocal = assignment.completedAtLocal;
      if (!completedAtLocal) {
        const completionCommand = await tx.getFirstAsync<{ payloadJson: string; createdAtLocal: string | null }>(
          `SELECT payload_json AS payloadJson, created_at_local AS createdAtLocal
             FROM outbox_commands
            WHERE owner_user_id = ?
              AND (contour_id = ? OR contour_id IS NULL)
              AND command_type = 'completePatrolAssignment'
              AND status NOT IN ('superseded', 'cancelledLocal')
              AND (entity_local_id = ? OR entity_server_id = ? OR instr(payload_json, ?) > 0)
            ORDER BY created_at_local DESC
            LIMIT 1`,
          [ownerUserId, currentContourId, assignment.assignmentId, assignment.assignmentId, assignment.assignmentId]
        );
        if (completionCommand) {
          try {
            const payload = JSON.parse(completionCommand.payloadJson) as { completedAtLocal?: unknown };
            completedAtLocal = typeof payload.completedAtLocal === "string" && payload.completedAtLocal.trim()
              ? payload.completedAtLocal
              : completionCommand.createdAtLocal;
          } catch {
            completedAtLocal = completionCommand.createdAtLocal;
          }
        }
      }
      const hasUnfinishedCommand = await hasUnfinishedAssignmentCommandInTransaction(tx, ownerUserId, assignment.assignmentId);
      // A lower server revision is an older snapshot.  It must not roll back
      // a newer local/server state, while an equal revision still preserves a
      // pending local intention until the queue obtains a receipt.
      const serverSnapshotIsStale = (localAssignment?.revision ?? -1) > assignment.revision;
      const resolvedBootstrapStatus = resolveBootstrapAssignmentStatus(
        localAssignment?.status ?? null,
        assignment.status,
        hasUnfinishedCommand
      );
      const preserveLocalStatus = serverSnapshotIsStale || (localAssignment?.status != null
        && resolvedBootstrapStatus === localAssignment.status
        && localAssignment.status !== assignment.status);
      const incomingLocalReportPresent = assignment.completedAtLocal || ["completed", "completedServer"].includes(assignment.status) ? 1 : 0;
      await tx.runAsync(
        `
          INSERT INTO patrol_assignments (
            assignment_id,
            owner_user_id,
            contour_id,
            request_id,
            route_id,
            status,
            started_at_local,
            completed_at_local,
            local_report_present,
            revision,
            route_version_no,
            snapshot_version,
            snapshot_created_at,
            snapshot_source,
            snapshot_ready,
            snapshot_allow_free_order,
            snapshot_nfc_enabled,
            snapshot_qr_fallback_enabled
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(assignment_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            contour_id = excluded.contour_id,
            request_id = excluded.request_id,
            route_id = excluded.route_id,
            status = CASE
              WHEN ? = 1 THEN patrol_assignments.status
              WHEN excluded.status IN ('cancelled', 'cancelledServer')
                AND patrol_assignments.status NOT IN ('completedLocal', 'syncing') THEN 'cancelledServer'
              WHEN ? = 1
                AND patrol_assignments.status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision', 'cancelledServer') THEN patrol_assignments.status
              ELSE excluded.status
            END,
            started_at_local = COALESCE(patrol_assignments.started_at_local, excluded.started_at_local),
            completed_at_local = CASE
              WHEN patrol_assignments.completed_at_local IS NOT NULL
                AND (patrol_assignments.local_report_present = 1
                  OR patrol_assignments.status IN ('completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision', 'cancelledServer'))
                THEN patrol_assignments.completed_at_local
              ELSE excluded.completed_at_local
            END,
            local_report_present = MAX(patrol_assignments.local_report_present, excluded.local_report_present),
            revision = MAX(patrol_assignments.revision, excluded.revision),
            route_version_no = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.route_version_no
              ELSE excluded.route_version_no
            END,
            snapshot_version = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.snapshot_version
              ELSE excluded.snapshot_version
            END,
            snapshot_created_at = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.snapshot_created_at
              ELSE excluded.snapshot_created_at
            END,
            snapshot_source = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.snapshot_source
              ELSE excluded.snapshot_source
            END,
            snapshot_ready = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.snapshot_ready
              ELSE excluded.snapshot_ready
            END,
            snapshot_allow_free_order = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.snapshot_allow_free_order
              ELSE excluded.snapshot_allow_free_order
            END,
            snapshot_nfc_enabled = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.snapshot_nfc_enabled
              ELSE excluded.snapshot_nfc_enabled
            END,
            snapshot_qr_fallback_enabled = CASE
              WHEN patrol_assignments.status IN ('releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_assignments.snapshot_qr_fallback_enabled
              ELSE excluded.snapshot_qr_fallback_enabled
            END
        `,
        [
          assignment.assignmentId,
          ownerUserId,
          currentContourId,
          assignment.requestId,
          assignment.routeId,
          assignment.status,
          assignment.startedAtLocal,
          completedAtLocal,
          incomingLocalReportPresent,
          assignment.revision,
          snapshotVersion,
          snapshotVersion,
          snapshotCreatedAt,
          "bootstrap",
          0,
          snapshotAllowFreeOrder,
          snapshotNfcEnabled,
          snapshotQrFallbackEnabled,
          serverSnapshotIsStale ? 1 : 0,
          preserveLocalStatus ? 1 : 0
        ]
      );
      await tx.runAsync("UPDATE patrol_assignments SET employee_id = COALESCE(?, employee_id) WHERE assignment_id = ? AND owner_user_id = ? AND contour_id = ?", [assignment.employeeId ?? null, assignment.assignmentId, ownerUserId, currentContourId]);
      await reconcileAssignmentIdentityInTransaction(tx, ownerUserId, assignment);
      if (!preserveLocalStatus && ["accepted", "inProgress", "paused", "completed", "completedServer", "cancelledServer"].includes(assignment.status)) {
        const requestStatus = assignment.status === "completedServer" ? "completed" : assignment.status;
        await tx.runAsync(
          `UPDATE patrol_request_board SET status = ? WHERE owner_user_id = ? AND request_id = ?`,
          [requestStatus, ownerUserId, assignment.requestId]
        );
      }
    }

    await applyBootstrapConflictResolutionsInTransaction(tx, ownerUserId, bootstrap);

    for (const assignmentId of cancelledAssignmentIds) {
      await finalizeCancelledAssignmentInTransaction(tx, ownerUserId, assignmentId);
    }

    const protectedRoutes = await tx.getAllAsync<{ route_id: string }>(
      `
        SELECT DISTINCT route_id
        FROM patrol_assignments
        WHERE owner_user_id = ?
          AND status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')
      `,
      [ownerUserId]
    );
    const protectedRouteIds = new Set(protectedRoutes.map((route) => route.route_id));

    for (const routeId of serverRouteIds) {
      if (protectedRouteIds.has(routeId)) {
        continue;
      }

      const pointIds = serverPointIdsByRoute.get(routeId) ?? [];
      if (pointIds.length > 0) {
        const placeholders = pointIds.map(() => "?").join(", ");
        await tx.runAsync(
          `
            DELETE FROM route_points
            WHERE route_id = ?
              AND point_id NOT IN (${placeholders})
          `,
          [routeId, ...pointIds]
        );
      } else {
        await tx.runAsync(
          `
            DELETE FROM route_points
            WHERE route_id = ?
          `,
          [routeId]
        );
      }
    }

    if (serverRouteIds.length > 0) {
      const placeholders = serverRouteIds.map(() => "?").join(", ");
      await tx.runAsync(
        `
          DELETE FROM route_points
          WHERE route_id NOT IN (${placeholders})
            AND route_id NOT IN (
              SELECT route_id
              FROM patrol_assignments
              WHERE owner_user_id = ?
                AND status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')
            )
        `,
        [...serverRouteIds, ownerUserId]
      );
      await tx.runAsync(
        `
          DELETE FROM routes
          WHERE route_id NOT IN (${placeholders})
            AND route_id NOT IN (
              SELECT route_id
              FROM patrol_assignments
              WHERE owner_user_id = ?
                AND status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')
            )
        `,
        [...serverRouteIds, ownerUserId]
      );
    } else {
      await tx.runAsync(
        `
          DELETE FROM route_points
          WHERE route_id NOT IN (
            SELECT route_id
            FROM patrol_assignments
            WHERE owner_user_id = ?
              AND status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')
          )
        `,
        [ownerUserId]
      );
      await tx.runAsync(
        `
          DELETE FROM routes
          WHERE route_id NOT IN (
            SELECT route_id
            FROM patrol_assignments
            WHERE owner_user_id = ?
              AND status IN ('accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')
          )
        `,
        [ownerUserId]
      );
    }

    for (const route of bootstrap.routes) {
      await tx.runAsync(
        `
          INSERT INTO routes (
            route_id,
            name,
            version,
            allow_free_order,
            nfc_enabled,
            qr_fallback_enabled
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(route_id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            allow_free_order = excluded.allow_free_order,
            nfc_enabled = excluded.nfc_enabled,
            qr_fallback_enabled = excluded.qr_fallback_enabled
        `,
        [
          route.routeId,
          route.name,
          route.version,
          route.allowFreeOrder ? 1 : 0,
          route.nfcEnabled ? 1 : 0,
          route.qrFallbackEnabled ? 1 : 0
        ]
      );
    }

    for (const point of bootstrap.points) {
      await tx.runAsync(
        `
          INSERT INTO route_points (
            point_id,
            route_id,
            name,
            description,
            instruction,
            order_index,
            nfc_uid_hash,
            qr_code_hash,
            required,
            requires_photo,
            revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(point_id) DO UPDATE SET
            route_id = excluded.route_id,
            name = excluded.name,
            description = excluded.description,
            instruction = excluded.instruction,
            order_index = excluded.order_index,
            nfc_uid_hash = excluded.nfc_uid_hash,
            qr_code_hash = excluded.qr_code_hash,
            required = excluded.required,
            requires_photo = excluded.requires_photo,
            revision = excluded.revision
        `,
        [
          point.pointId,
          point.routeId,
          point.name,
          point.description,
          point.instruction,
          point.orderIndex,
          point.nfcUidHash,
          point.qrCodeHash,
          point.required ? 1 : 0,
          point.requiresPhoto ? 1 : 0,
          point.revision
        ]
      );
    }

    for (const assignment of bootstrap.assignments) {
      await refreshAssignmentSnapshotInTransaction(tx, assignment, bootstrap);
    }
    for (const assignment of bootstrap.assignments) {
      if (!["completedServer", "cancelledServer"].includes(assignment.status)) {
        continue;
      }
      const dispatcherConflicts = await tx.getAllAsync<{ clientOperationId: string }>(
        `
          SELECT conflict.client_operation_id AS clientOperationId
          FROM sync_conflicts conflict
          INNER JOIN outbox_commands command
            ON command.client_operation_id = conflict.client_operation_id
          WHERE conflict.owner_user_id = ?
            AND conflict.contour_id = ?
            AND conflict.resolution_status = 'dispatcher'
            AND conflict.status NOT IN ('resolved', 'dismissed')
            AND command.entity_local_id = ?
            AND command.status = 'conflict'
        `,
        [ownerUserId, currentContourId, assignment.assignmentId]
      );
      if (dispatcherConflicts.length > 0) {
        await tx.runAsync(
          `UPDATE patrol_assignments SET status = ?, revision = ? WHERE owner_user_id = ? AND assignment_id = ?`,
          [assignment.status, assignment.revision, ownerUserId, assignment.assignmentId]
        );
        await tx.runAsync(
          `UPDATE patrol_request_board SET status = ? WHERE owner_user_id = ? AND request_id = ?`,
          [assignment.status, ownerUserId, assignment.requestId]
        );
      }
      for (const conflict of dispatcherConflicts) {
        await tx.runAsync(
          `
            UPDATE outbox_commands
            SET status = 'superseded', last_error = NULL, next_attempt_at = NULL, updated_at_local = ?
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND status = 'conflict'
          `,
          [bootstrap.serverTime, ownerUserId, currentContourId, conflict.clientOperationId]
        );
        await tx.runAsync(
          `
            UPDATE sync_conflicts
            SET status = 'resolved', resolution_status = 'resolvedServerWins', resolved_at = ?,
                resolution_reason = 'Решение диспетчера подтверждено серверным состоянием.'
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
          `,
          [bootstrap.serverTime, ownerUserId, currentContourId, conflict.clientOperationId]
        );
      }
    }
    await tx.runAsync(
      `
        INSERT INTO sync_cursors (
          scope,
          contour_id,
          cursor_value,
          last_sync_at,
          protocol_version
        )
        VALUES (?, ?, ?, ?, '1.0')
        ON CONFLICT(scope) DO UPDATE SET
          contour_id = excluded.contour_id,
          cursor_value = excluded.cursor_value,
          last_sync_at = excluded.last_sync_at,
          protocol_version = excluded.protocol_version
      `,
      [bootstrapScope, currentContourId, bootstrap.syncCursor, bootstrap.serverTime]
    );
}
