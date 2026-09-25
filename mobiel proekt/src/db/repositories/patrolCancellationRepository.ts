import type * as SQLite from "expo-sqlite";

import { currentContourId } from "@/core/environments";
import { getAssignmentCommandIds } from "@/db/repositories/patrolCancellationPolicy";

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;

export async function finalizeCancelledAssignmentInTransaction(
  executor: SqlExecutor,
  ownerUserId: string,
  assignmentId: string
) {
  await executor.runAsync(
    `
      UPDATE patrol_assignments
      SET status = 'cancelledServer'
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND assignment_id = ?
        AND status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer')
    `,
    [ownerUserId, currentContourId, assignmentId]
  );

  await executor.runAsync(
    `
      UPDATE patrol_request_board
      SET status = 'cancelledServer'
      WHERE owner_user_id = ?
        AND request_id = (
          SELECT request_id
          FROM patrol_assignments
          WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?
          LIMIT 1
        )
    `,
    [ownerUserId, ownerUserId, currentContourId, assignmentId]
  );

  const commands = await executor.getAllAsync<{
    clientOperationId: string;
    commandType: string;
    status: string;
    entityLocalId: string | null;
    entityServerId: string | null;
    payloadJson: string;
  }>(
    `
      SELECT
        client_operation_id AS clientOperationId,
        command_type AS commandType,
        status,
        entity_local_id AS entityLocalId,
        entity_server_id AS entityServerId,
        payload_json AS payloadJson
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status NOT IN ('accepted', 'duplicate', 'superseded')
    `,
    [ownerUserId, currentContourId]
  );
  const commandIds = getAssignmentCommandIds(commands, assignmentId);
  if (commandIds.length === 0) {
    return;
  }

  // The server may have received a switch just before its source assignment
  // was cancelled. Do not turn that unknown operation into a resolved barrier:
  // retry it with the same id and let the server return accepted/duplicate or
  // a concrete rejection. Otherwise commands of the target can run early.
  // A switch that was rejected is still a barrier: its target must not start
  // until the employee explicitly confirms "Продолжить B". Treating a
  // conflict/rejection as superseded would make its dependent results ready.
  const barrierSwitchIds = commands
    .filter((command) => commandIds.includes(command.clientOperationId)
      && command.commandType === "switchPatrolAssignment"
      && !["accepted", "duplicate", "superseded", "cancelled", "cancelledLocal"].includes(command.status))
    .map((command) => command.clientOperationId);
  const uncertainSwitchIds = commands
    .filter((command) => barrierSwitchIds.includes(command.clientOperationId)
      && ["pending", "sending", "retryLater", "waiting_network", "waiting_auth", "blocked"].includes(command.status))
    .map((command) => command.clientOperationId);
  const supersededIds = commandIds.filter((id) => !barrierSwitchIds.includes(id));
  const now = new Date().toISOString();
  if (uncertainSwitchIds.length) {
    const placeholders = uncertainSwitchIds.map(() => "?").join(", ");
    await executor.runAsync(
      `UPDATE outbox_commands
          SET status = 'retryLater', retry_reason = 'server',
              next_attempt_at = NULL, updated_at_local = ?,
              last_error = 'Проверяем результат переключения после отмены маршрута.'
        WHERE owner_user_id = ? AND contour_id = ?
          AND client_operation_id IN (${placeholders})`,
      [now, ownerUserId, currentContourId, ...uncertainSwitchIds]
    );
  }
  if (supersededIds.length) {
    const placeholders = supersededIds.map(() => "?").join(", ");
    await executor.runAsync(
      `UPDATE outbox_commands
          SET status = 'superseded', last_error = NULL,
              next_attempt_at = NULL, updated_at_local = ?
        WHERE owner_user_id = ? AND contour_id = ?
          AND client_operation_id IN (${placeholders})
          AND status NOT IN ('accepted', 'duplicate', 'superseded')`,
      [now, ownerUserId, currentContourId, ...supersededIds]
    );
  }

  await executor.runAsync(
    `
      UPDATE sync_conflicts
      SET status = 'resolved',
          resolution_status = 'resolvedServerWins',
          resolved_at = ?,
          resolution_reason = 'Сервер отменил назначение.'
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status NOT IN ('resolved', 'dismissed')
        AND client_operation_id IN (${supersededIds.length ? supersededIds.map(() => "?").join(", ") : "NULL"})
    `,
    [new Date().toISOString(), ownerUserId, currentContourId, ...supersededIds]
  );
}
