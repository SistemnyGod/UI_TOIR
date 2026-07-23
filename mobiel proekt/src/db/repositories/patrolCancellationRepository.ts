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
        AND assignment_id = ?
        AND status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer')
    `,
    [ownerUserId, assignmentId]
  );

  await executor.runAsync(
    `
      UPDATE patrol_request_board
      SET status = 'cancelledServer'
      WHERE owner_user_id = ?
        AND request_id = (
          SELECT request_id
          FROM patrol_assignments
          WHERE owner_user_id = ? AND assignment_id = ?
          LIMIT 1
        )
    `,
    [ownerUserId, ownerUserId, assignmentId]
  );

  const commands = await executor.getAllAsync<{
    clientOperationId: string;
    entityLocalId: string | null;
    entityServerId: string | null;
    payloadJson: string;
  }>(
    `
      SELECT
        client_operation_id AS clientOperationId,
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

  const placeholders = commandIds.map(() => "?").join(", ");
  const now = new Date().toISOString();
  await executor.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'superseded',
          last_error = NULL,
          next_attempt_at = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND client_operation_id IN (${placeholders})
        AND status NOT IN ('accepted', 'duplicate', 'superseded')
    `,
    [now, ownerUserId, currentContourId, ...commandIds]
  );

  await executor.runAsync(
    `
      UPDATE sync_conflicts
      SET status = 'resolved'
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status NOT IN ('resolved', 'dismissed')
        AND client_operation_id IN (${placeholders})
    `,
    [ownerUserId, currentContourId, ...commandIds]
  );
}