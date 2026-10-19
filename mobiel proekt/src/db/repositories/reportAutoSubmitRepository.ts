import { currentContourId } from "@/core/environments";
import { getDatabase } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { digestText, type AutoSubmitTimer } from "@/domain/reporting/autoSubmitPolicy";

export type StoredAutoSubmitTimer = AutoSubmitTimer & {
  status: "armed" | "submitted";
  clientOperationId: string | null;
};

export type AutoSubmittedReport = {
  assignmentId: string;
  clientOperationId: string;
  commandStatus: string | null;
  routeName: string | null;
};

type TimerRow = {
  assignmentId: string;
  status: string;
  fingerprint: string;
  delayMs: number;
  elapsedMs: number;
  checkpointWallMs: number;
  clientOperationId: string | null;
};

/** Patrols that may need a timer: in progress now, or already holding one. */
export async function listAutoSubmitCandidateAssignmentIds(ownerUserId: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ assignmentId: string }>(
    `
      SELECT assignment_id AS assignmentId
      FROM patrol_assignments
      WHERE owner_user_id = ? AND contour_id = ? AND status = 'inProgress'
      UNION
      SELECT assignment_id AS assignmentId
      FROM report_auto_submit
      WHERE owner_user_id = ? AND contour_id = ? AND status = 'armed'
    `,
    [ownerUserId, currentContourId, ownerUserId, currentContourId]
  );
  return rows.map((row) => row.assignmentId);
}

/**
 * Digest of what the employee entered for every point: results, comments,
 * defects and attachment references. Sync bookkeeping columns are excluded so
 * a background upload never restarts the countdown.
 */
export async function computeAssignmentReportFingerprint(ownerUserId: string, assignmentId: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, string | number | null>>(
    `
      SELECT point_id, status, comment, issue_type_id, severity, deferred_reason, manual_reason,
             confirmation_type, completed_at_local, photo_client_file_ids_json
      FROM point_results
      WHERE owner_user_id = ? AND assignment_id = ?
      ORDER BY point_id ASC, local_result_id ASC
    `,
    [ownerUserId, assignmentId]
  );
  return digestText(JSON.stringify(rows.map((row) => [
    row.point_id, row.status, row.comment, row.issue_type_id, row.severity, row.deferred_reason,
    row.manual_reason, row.confirmation_type, row.completed_at_local, row.photo_client_file_ids_json
  ])));
}

/**
 * True once any report for the patrol exists that was not withdrawn: queued,
 * delivered, or rejected and waiting for the employee. A rejected report must
 * be fixed by a person, never re-sent by the timer.
 */
export async function hasCompletionReport(ownerUserId: string, assignmentId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ?
        AND command_type = 'completePatrolAssignment'
        AND entity_local_id = ?
        AND status NOT IN ('superseded', 'cancelled', 'cancelledLocal')
    `,
    [ownerUserId, currentContourId, assignmentId]
  );
  return Number(row?.count ?? 0) > 0;
}

export async function getAutoSubmitTimer(ownerUserId: string, assignmentId: string): Promise<StoredAutoSubmitTimer | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TimerRow>(
    `
      SELECT assignment_id AS assignmentId, status, fingerprint, delay_ms AS delayMs, elapsed_ms AS elapsedMs,
             checkpoint_wall_ms AS checkpointWallMs, client_operation_id AS clientOperationId
      FROM report_auto_submit
      WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?
    `,
    [ownerUserId, currentContourId, assignmentId]
  );
  if (!row) return null;
  return {
    assignmentId: row.assignmentId,
    status: row.status === "submitted" ? "submitted" : "armed",
    fingerprint: row.fingerprint,
    delayMs: Number(row.delayMs),
    elapsedMs: Number(row.elapsedMs),
    checkpointWallMs: Number(row.checkpointWallMs),
    clientOperationId: row.clientOperationId
  };
}

export async function saveAutoSubmitTimer(ownerUserId: string, timer: AutoSubmitTimer, armed: boolean) {
  const db = await getDatabase();
  const nowIso = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    `
      INSERT INTO report_auto_submit (
        owner_user_id, contour_id, assignment_id, status, fingerprint, delay_ms, elapsed_ms,
        checkpoint_wall_ms, armed_at, client_operation_id, submitted_at, delivery_notified
      )
      VALUES (?, ?, ?, 'armed', ?, ?, ?, ?, ?, NULL, NULL, 0)
      ON CONFLICT (owner_user_id, contour_id, assignment_id) DO UPDATE SET
        status = 'armed',
        fingerprint = excluded.fingerprint,
        delay_ms = excluded.delay_ms,
        elapsed_ms = excluded.elapsed_ms,
        checkpoint_wall_ms = excluded.checkpoint_wall_ms,
        armed_at = CASE WHEN ? THEN excluded.armed_at ELSE report_auto_submit.armed_at END,
        client_operation_id = NULL,
        submitted_at = NULL,
        delivery_notified = 0
    `,
    [
      ownerUserId, currentContourId, timer.assignmentId, timer.fingerprint, Math.round(timer.delayMs),
      Math.round(timer.elapsedMs), Math.round(timer.checkpointWallMs), nowIso, armed ? 1 : 0
    ]
  ));
}

export async function deleteAutoSubmitTimer(ownerUserId: string, assignmentId: string) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() => db.runAsync(
    "DELETE FROM report_auto_submit WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND status = 'armed'",
    [ownerUserId, currentContourId, assignmentId]
  ));
}

/** Keeps the row so the employee is told once the server accepted the report. */
export async function markReportAutoSubmitted(ownerUserId: string, assignmentId: string, clientOperationId: string) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE report_auto_submit
      SET status = 'submitted', client_operation_id = ?, submitted_at = ?, delivery_notified = 0
      WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?
    `,
    [clientOperationId, new Date().toISOString(), ownerUserId, currentContourId, assignmentId]
  ));
}

export async function listAutoSubmittedReports(ownerUserId: string): Promise<AutoSubmittedReport[]> {
  const db = await getDatabase();
  return db.getAllAsync<AutoSubmittedReport>(
    `
      SELECT auto.assignment_id AS assignmentId,
             auto.client_operation_id AS clientOperationId,
             command.status AS commandStatus,
             COALESCE(route.name, request.route_name) AS routeName
      FROM report_auto_submit auto
      LEFT JOIN outbox_commands command
        ON command.owner_user_id = auto.owner_user_id
       AND command.contour_id = auto.contour_id
       AND command.client_operation_id = auto.client_operation_id
      LEFT JOIN patrol_assignments assignment
        ON assignment.owner_user_id = auto.owner_user_id AND assignment.assignment_id = auto.assignment_id
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request
        ON request.request_id = assignment.request_id AND request.owner_user_id = auto.owner_user_id
      WHERE auto.owner_user_id = ? AND auto.contour_id = ?
        AND auto.status = 'submitted' AND auto.delivery_notified = 0
        AND auto.client_operation_id IS NOT NULL
    `,
    [ownerUserId, currentContourId]
  );
}

export async function finishAutoSubmittedReport(ownerUserId: string, assignmentId: string) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() => db.runAsync(
    "DELETE FROM report_auto_submit WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND status = 'submitted'",
    [ownerUserId, currentContourId, assignmentId]
  ));
}

/** Completion reports still on the phone, newest first per patrol. */
export async function listUndeliveredReports(ownerUserId: string): Promise<{ assignmentId: string; clientOperationId: string; routeName: string | null }[]> {
  const db = await getDatabase();
  return db.getAllAsync(
    `
      SELECT command.entity_local_id AS assignmentId,
             command.client_operation_id AS clientOperationId,
             COALESCE(route.name, request.route_name) AS routeName
      FROM outbox_commands command
      LEFT JOIN patrol_assignments assignment
        ON assignment.owner_user_id = command.owner_user_id AND assignment.assignment_id = command.entity_local_id
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request
        ON request.request_id = assignment.request_id AND request.owner_user_id = command.owner_user_id
      WHERE command.owner_user_id = ? AND command.contour_id = ?
        AND command.command_type = 'completePatrolAssignment'
        AND command.entity_local_id IS NOT NULL
        AND command.status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal')
      ORDER BY command.created_at_local DESC
      LIMIT 50
    `,
    [ownerUserId, currentContourId]
  );
}
