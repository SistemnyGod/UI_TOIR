import * as Crypto from "expo-crypto";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
import { setPatrolDeviceContextInTransaction } from "@/db/repositories/patrolContextRepository";

export type SwitchCandidate = { assignmentId: string; routeName: string; employeeName: string | null; employeeId: string | null; sourceEmployeeId: string | null; status: string };

export async function listSwitchCandidates(sourceId: string) {
  const db = await getDatabase();
  const owner = await getStoredOwnerUserId();
  if (!owner) return [];
  return db.getAllAsync<SwitchCandidate>(`SELECT a.assignment_id AS assignmentId, r.route_name AS routeName,
    r.assigned_full_name AS employeeName, a.employee_id AS employeeId,
    (SELECT employee_id FROM patrol_assignments WHERE assignment_id = ? AND owner_user_id = ? AND contour_id = ?) AS sourceEmployeeId,
    a.status FROM patrol_assignments a
    JOIN patrol_request_board r ON r.request_id = a.request_id AND r.owner_user_id = a.owner_user_id
    WHERE a.owner_user_id = ? AND a.contour_id = ? AND a.assignment_id <> ?
      AND a.status IN ('accepted', 'paused') AND r.route_switch_available = 1 AND a.employee_id IS NOT NULL
    ORDER BY r.planned_start_at, a.assignment_id`, [sourceId, owner, currentContourId, owner, currentContourId, sourceId]);
}

export async function switchPatrolLocally(sourceId: string, targetId: string, validateContext?: () => Promise<void>) {
  const owner = await getStoredOwnerUserId();
  if (!owner || sourceId === targetId) throw new Error("Выберите другой принятый обход.");
  const db = await getDatabase();
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
    await validateContext?.();
    const rows = await tx.getAllAsync<{ id: string; requestId: string; status: string; revision: number; employeeId: string | null; enabled: number }>(
      `SELECT a.assignment_id AS id, a.request_id AS requestId, a.status, a.revision, a.employee_id AS employeeId,
        r.route_switch_available AS enabled FROM patrol_assignments a
        JOIN patrol_request_board r ON r.request_id = a.request_id AND r.owner_user_id = a.owner_user_id
        WHERE a.owner_user_id = ? AND a.contour_id = ? AND a.assignment_id IN (?, ?)`, [owner, currentContourId, sourceId, targetId]);
    const source = rows.find((row) => row.id === sourceId);
    const target = rows.find((row) => row.id === targetId);
    if (!source || !target || !source.enabled || !target.enabled || !source.employeeId || !target.employeeId)
      throw new Error("Обновите данные: сервер должен поддерживать переключение маршрутов.");
    if (!["inProgress", "paused"].includes(source.status) || !["accepted", "paused"].includes(target.status))
      throw new Error("Состояние обходов изменилось. Обновите список.");

    if (source.employeeId !== target.employeeId) throw new Error('Выберите заявку сотрудника в общем списке.');
    const competing = await tx.getFirstAsync<{ id: string }>(`SELECT assignment_id AS id FROM patrol_assignments
      WHERE owner_user_id = ? AND contour_id = ? AND employee_id = ? AND status = 'inProgress'
        AND assignment_id NOT IN (?, ?)`, [owner, currentContourId, target.employeeId, sourceId, targetId]);
    if (competing) throw new Error("Сотрудник уже выполняет другой обход.");
    const preceding = await tx.getAllAsync<{ id: string }>(`SELECT client_operation_id AS id FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ?
        AND command_type <> 'createPatrolAppeal' AND status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal')
        AND (aggregate_key IN (?, ?) OR json_extract(payload_json, '$.sourceAssignmentId') IN (?, ?))`,
      [owner, currentContourId, `patrolAssignment:${sourceId}`, `patrolAssignment:${targetId}`, sourceId, targetId]);
    const now = new Date().toISOString();
    await tx.runAsync("UPDATE patrol_assignments SET status = 'paused' WHERE assignment_id = ? AND owner_user_id = ? AND contour_id = ?", [sourceId, owner, currentContourId]);
    await tx.runAsync("UPDATE patrol_assignments SET status = 'inProgress', started_at_local = COALESCE(started_at_local, ?) WHERE assignment_id = ? AND owner_user_id = ? AND contour_id = ?", [now, targetId, owner, currentContourId]);
    await tx.runAsync("UPDATE patrol_request_board SET status = 'paused' WHERE request_id = ? AND owner_user_id = ?", [source.requestId, owner]);
    await tx.runAsync("UPDATE patrol_request_board SET status = 'inProgress' WHERE request_id = ? AND owner_user_id = ?", [target.requestId, owner]);
    await insertOutboxCommandInTransaction(tx, {
      clientOperationId: Crypto.randomUUID(), ownerUserId: owner, commandType: "switchPatrolAssignment",
      entityType: "patrolAssignment", entityLocalId: targetId, entityServerId: targetId,
      payload: { assignmentId: targetId, sourceAssignmentId: sourceId, sourceRevision: source.revision,
        targetRevision: target.revision, targetStatusBefore: target.status, switchedAtLocal: now,
        dependencies: preceding.map((row) => row.id) },
      createdAtLocal: now, attemptCount: 0, status: "pending"
    });
    await setPatrolDeviceContextInTransaction(tx, owner, {
      assignmentId: targetId,
      employeeId: target.employeeId
    });
    await validateContext?.();
  }));
  requestSyncAfterMutation();
}

/**
 * Starts the target of a failed switch only after the employee explicitly
 * chooses to continue. The failed switch remains an audit record, while this
 * independent lifecycle command avoids a dependency cycle on that conflict.
 */
export async function continuePatrolAfterSwitchConflict(ownerUserId: string, clientOperationId: string) {
  const db = await getDatabase();
  let continuationOperationId: string | null = null;
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
    const command = await tx.getFirstAsync<{ status: string; commandType: string; payloadJson: string }>(
      `SELECT status, command_type AS commandType, payload_json AS payloadJson
       FROM outbox_commands
       WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
      [ownerUserId, currentContourId, clientOperationId]
    );
    if (!command || command.commandType !== "switchPatrolAssignment") {
      throw new Error("Операция переключения маршрута не найдена.");
    }

    let payload: { assignmentId?: unknown; sourceAssignmentId?: unknown; targetStatusBefore?: unknown };
    try {
      payload = JSON.parse(command.payloadJson) as typeof payload;
    } catch {
      throw new Error("Не удалось прочитать данные переключения маршрута.");
    }
    const targetId = typeof payload.assignmentId === "string" ? payload.assignmentId : null;
    const sourceId = typeof payload.sourceAssignmentId === "string" ? payload.sourceAssignmentId : null;
    if (!targetId || !sourceId) throw new Error("В операции переключения отсутствуют оба назначения.");

    // Continuation is idempotent. Check the durable link before validating the
    // original switch status because the first tap archives that switch.
    const existing = await tx.getFirstAsync<{ id: string }>(
      `SELECT client_operation_id AS id
         FROM outbox_commands
        WHERE owner_user_id = ? AND contour_id = ?
          AND command_type IN ('startPatrolAssignment', 'resumePatrolAssignment')
          AND json_extract(payload_json, '$.continuedAfterSwitchOperationId') = ?
        ORDER BY created_at_local ASC
        LIMIT 1`,
      [ownerUserId, currentContourId, clientOperationId]
    );
    if (existing) {
      continuationOperationId = existing.id;
      return;
    }
    if (!["conflict", "rejected"].includes(command.status)) {
      throw new Error("Продолжить можно только после подтверждённого отказа переключения.");
    }

    const target = await tx.getFirstAsync<{ requestId: string; status: string; employeeId: string | null }>(
      `SELECT request_id AS requestId, status, employee_id AS employeeId
       FROM patrol_assignments
       WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [ownerUserId, currentContourId, targetId]
    );
    if (!target || !target.employeeId) throw new Error("Целевой обход больше недоступен на телефоне.");
    if (["cancelled", "cancelledServer", "completed", "completedServer"].includes(target.status)) {
      throw new Error("Целевой обход уже закрыт и не может быть продолжен.");
    }

    const competing = await tx.getFirstAsync<{ id: string }>(
      `SELECT assignment_id AS id
       FROM patrol_assignments
       WHERE owner_user_id = ? AND contour_id = ? AND employee_id = ?
         AND status = 'inProgress' AND assignment_id <> ?
       LIMIT 1`,
      [ownerUserId, currentContourId, target.employeeId, targetId]
    );
    if (competing) throw new Error("У сотрудника уже есть другой выполняемый обход.");

    const now = new Date().toISOString();
    const commandType = payload.targetStatusBefore === "paused"
      ? "resumePatrolAssignment"
      : "startPatrolAssignment";
    await tx.runAsync(
      `UPDATE patrol_assignments
       SET status = 'inProgress', started_at_local = COALESCE(started_at_local, ?)
       WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
      [now, ownerUserId, currentContourId, targetId]
    );
    await tx.runAsync("UPDATE patrol_request_board SET status = 'inProgress' WHERE owner_user_id = ? AND request_id = ?", [ownerUserId, target.requestId]);
    const attempted = await tx.getFirstAsync<{ id: string }>(
      `SELECT client_operation_id AS id FROM outbox_commands
       WHERE owner_user_id = ? AND contour_id = ? AND aggregate_key = ?
         AND (status = 'sending' OR attempt_count > 0)
         AND status NOT IN ('accepted', 'duplicate', 'rejected', 'conflict')
       LIMIT 1`,
      [ownerUserId, currentContourId, `patrolAssignment:${targetId}`]
    );
    if (attempted) {
      throw new Error("Ожидаем подтверждение уже начатой операции целевого обхода.");
    }
    const pending = await tx.getAllAsync<{ id: string; sequenceNo: number; payloadJson: string }>(
      `SELECT client_operation_id AS id, sequence_no AS sequenceNo, payload_json AS payloadJson
         FROM outbox_commands
        WHERE owner_user_id = ? AND contour_id = ? AND aggregate_key = ?
          AND status IN ('pending', 'retryLater', 'waiting_network', 'waiting_auth', 'blocked')
        ORDER BY sequence_no ASC, created_at_local ASC`,
      [ownerUserId, currentContourId, `patrolAssignment:${targetId}`]
    );
    const firstSequence = pending[0]?.sequenceNo ?? 1;
    if (pending.length) {
      await tx.runAsync(
        `UPDATE outbox_commands SET sequence_no = sequence_no + 1
          WHERE owner_user_id = ? AND contour_id = ? AND aggregate_key = ?
            AND status IN ('pending', 'retryLater', 'waiting_network', 'waiting_auth', 'blocked')`,
        [ownerUserId, currentContourId, `patrolAssignment:${targetId}`]
      );
    }
    const newOperationId = Crypto.randomUUID();
    await insertOutboxCommandInTransaction(tx, {
      clientOperationId: newOperationId, ownerUserId, commandType,
      entityType: "patrolAssignment", entityLocalId: targetId, entityServerId: targetId,
      bypassSwitchBarrier: true,
      sequenceNo: firstSequence,
      payload: {
        assignmentId: targetId,
        requestId: target.requestId,
        startedAtLocal: now,
        continuedAfterSwitchOperationId: clientOperationId,
        dependencies: []
      },
      createdAtLocal: now, attemptCount: 0, status: "pending"
    });
    for (const queued of pending) {
      try {
        const queuedPayload = JSON.parse(queued.payloadJson) as Record<string, unknown>;
        const dependencies = Array.isArray(queuedPayload.dependencies)
          ? queuedPayload.dependencies.filter((item): item is string => typeof item === "string" && item !== newOperationId)
          : [];
        if (!dependencies.includes(newOperationId)) dependencies.push(newOperationId);
        queuedPayload.dependencies = dependencies;
        await tx.runAsync(
          `UPDATE outbox_commands SET payload_json = ?
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
          [JSON.stringify(queuedPayload), ownerUserId, currentContourId, queued.id]
        );
      } catch {
        throw new Error("Не удалось безопасно восстановить порядок команд целевого обхода.");
      }
    }
    await tx.runAsync(
      `UPDATE sync_conflicts
       SET status = 'resolved', resolution_status = 'retryRequested', resolved_at = ?, resolution_reason = ?
       WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND status NOT IN ('resolved', 'dismissed')`,
      [now, "Сотрудник подтвердил продолжение целевого обхода после конфликта переключения.", ownerUserId, currentContourId, clientOperationId]
    );
    await tx.runAsync(
      `UPDATE outbox_commands SET status = 'superseded', updated_at_local = ?, last_error = ?
       WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
      [now, "Переключение отклонено; создана отдельная команда продолжения целевого обхода.", ownerUserId, currentContourId, clientOperationId]
    );
    await setPatrolDeviceContextInTransaction(tx, ownerUserId, { assignmentId: targetId, employeeId: target.employeeId });
    continuationOperationId = newOperationId;
  }));
  if (continuationOperationId) requestSyncAfterMutation();
  return continuationOperationId;
}
