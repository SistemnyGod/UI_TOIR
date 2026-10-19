import * as Crypto from "expo-crypto";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";
import { parseStringArray } from "@/db/repositories/patrolPersistence";
import { parseTransferPayload, type TransferCommandPayload } from "@/db/repositories/patrolTransferSync";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { transferableStatuses, type TransferCandidate, type TransferMode } from "@/domain/patrol/patrolTransferPolicy";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";

export type PatrolTransferContext = {
  assignmentId: string;
  requestId: string;
  routeName: string;
  status: string;
  performerId: string | null;
  performerName: string | null;
  filledPointCount: number;
  totalPointCount: number;
  serverSupportsTransfer: boolean;
  pending: { toEmployeeName: string; mode: TransferMode; status: string; lastError: string | null } | null;
};

const unfinishedStatuses = ["pending", "sending", "retryLater", "waiting_auth", "waiting_network", "blocked", "wrong_contour"];
const terminalPointStatuses = ["ok", "issue", "skipped"];

async function requireOwner() {
  const owner = await getStoredOwnerUserId();
  if (!owner) throw new Error("Войдите в приложение, чтобы передать обход.");
  return owner;
}

export async function getPatrolTransferContext(assignmentId: string): Promise<PatrolTransferContext | null> {
  const owner = await requireOwner();
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    requestId: string; status: string; performerId: string | null; performerName: string | null; routeName: string | null;
  }>(
    `SELECT a.request_id AS requestId, a.status, a.employee_id AS performerId,
            COALESCE(e.full_name, r.assigned_full_name) AS performerName, r.route_name AS routeName
       FROM patrol_assignments a
       LEFT JOIN patrol_request_board r ON r.request_id = a.request_id AND r.owner_user_id = a.owner_user_id
       LEFT JOIN mobile_employees e ON e.employee_id = a.employee_id AND e.owner_user_id = a.owner_user_id
      WHERE a.owner_user_id = ? AND a.contour_id = ? AND a.assignment_id = ?`,
    [owner, currentContourId, assignmentId]
  );
  if (!row) return null;
  const points = await db.getFirstAsync<{ total: number; filled: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN r.status IN ('ok', 'issue', 'skipped') THEN 1 ELSE 0 END) AS filled
       FROM assignment_route_points p
       LEFT JOIN point_results r ON r.assignment_id = p.assignment_id AND r.point_id = p.point_id
        AND r.owner_user_id = ? AND r.contour_id = ?
      WHERE p.assignment_id = ?`,
    [owner, currentContourId, assignmentId]
  );
  const capability = await db.getFirstAsync<{ available: number }>(
    "SELECT available FROM patrol_transfer_state WHERE owner_user_id = ? AND contour_id = ?",
    [owner, currentContourId]
  );
  const pendingCommand = await db.getFirstAsync<{ payloadJson: string; status: string; lastError: string | null }>(
    `SELECT payload_json AS payloadJson, status, last_error AS lastError FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ? AND command_type = 'transferPatrolAssignment'
        AND entity_local_id = ? AND status IN (${unfinishedStatuses.map(() => "?").join(", ")})
      ORDER BY created_at_local DESC LIMIT 1`,
    [owner, currentContourId, assignmentId, ...unfinishedStatuses]
  );
  const pendingPayload = pendingCommand ? parseTransferPayload(pendingCommand.payloadJson) : null;
  return {
    assignmentId,
    requestId: row.requestId,
    routeName: row.routeName ?? "Маршрут",
    status: row.status,
    performerId: row.performerId,
    performerName: row.performerName,
    filledPointCount: points?.filled ?? 0,
    totalPointCount: points?.total ?? 0,
    serverSupportsTransfer: capability?.available === 1,
    pending: pendingCommand && pendingPayload ? {
      toEmployeeName: pendingPayload.toEmployeeName,
      mode: pendingPayload.mode,
      status: pendingCommand.status,
      lastError: pendingCommand.lastError
    } : null
  };
}

/** Employees bound to this phone; they can take the patrol over offline. */
export async function listLocalTransferCandidates(): Promise<TransferCandidate[]> {
  const owner = await requireOwner();
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ employeeId: string; fullName: string; position: string | null; busy: number }>(
    `SELECT e.employee_id AS employeeId, e.full_name AS fullName, e.position,
            EXISTS (SELECT 1 FROM patrol_assignments a WHERE a.owner_user_id = e.owner_user_id AND a.contour_id = ?
              AND a.employee_id = e.employee_id AND a.status = 'inProgress') AS busy
       FROM mobile_employees e WHERE e.owner_user_id = ? ORDER BY e.full_name`,
    [currentContourId, owner]
  );
  return rows.map((row) => ({
    employeeId: row.employeeId,
    fullName: row.fullName,
    position: row.position,
    sameAccount: true,
    hasPatrolInProgress: row.busy === 1
  }));
}

export type TransferInput = {
  assignmentId: string;
  toEmployeeId: string;
  toEmployeeName: string;
  sameAccount: boolean;
  reason: string;
};

/**
 * Hands the patrol over locally and queues transferPatrolAssignment. On the
 * same phone the colleague continues at once, also offline. A patrol for
 * another phone is paused here and leaves the phone once the server accepts.
 */
export async function transferAssignmentLocally(input: TransferInput) {
  const owner = await requireOwner();
  const db = await getDatabase();
  const operationId = Crypto.randomUUID();
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
    const assignment = await tx.getFirstAsync<{ requestId: string; status: string; employeeId: string | null; performerName: string | null }>(
      `SELECT a.request_id AS requestId, a.status, a.employee_id AS employeeId,
              COALESCE(e.full_name, r.assigned_full_name) AS performerName
         FROM patrol_assignments a
         LEFT JOIN patrol_request_board r ON r.request_id = a.request_id AND r.owner_user_id = a.owner_user_id
         LEFT JOIN mobile_employees e ON e.employee_id = a.employee_id AND e.owner_user_id = a.owner_user_id
        WHERE a.owner_user_id = ? AND a.contour_id = ? AND a.assignment_id = ?`,
      [owner, currentContourId, input.assignmentId]
    );
    if (!assignment) throw new Error("Обход не найден на телефоне.");
    if (!transferableStatuses.has(assignment.status)) throw new Error("Передать можно только начатый или приостановленный обход.");
    if (!assignment.employeeId) throw new Error("У обхода не указан исполнитель. Обновите данные.");
    if (assignment.employeeId === input.toEmployeeId) throw new Error("Выберите другого сотрудника.");
    const queued = await tx.getFirstAsync<{ id: string }>(
      `SELECT client_operation_id AS id FROM outbox_commands
        WHERE owner_user_id = ? AND contour_id = ? AND command_type = 'transferPatrolAssignment' AND entity_local_id = ?
          AND status IN (${unfinishedStatuses.map(() => "?").join(", ")}) LIMIT 1`,
      [owner, currentContourId, input.assignmentId, ...unfinishedStatuses]
    );
    if (queued) throw new Error("Передача этого обхода уже ожидает отправки.");

    if (input.sameAccount) {
      const bound = await tx.getFirstAsync<{ id: string }>(
        "SELECT employee_id AS id FROM mobile_employees WHERE owner_user_id = ? AND employee_id = ?",
        [owner, input.toEmployeeId]
      );
      if (!bound) throw new Error("Сотрудник не привязан к этому телефону. Обновите данные.");
      if (assignment.status === "inProgress") {
        const busy = await tx.getFirstAsync<{ id: string }>(
          `SELECT assignment_id AS id FROM patrol_assignments WHERE owner_user_id = ? AND contour_id = ?
             AND employee_id = ? AND status = 'inProgress' AND assignment_id <> ? LIMIT 1`,
          [owner, currentContourId, input.toEmployeeId, input.assignmentId]
        );
        if (busy) throw new Error("У сотрудника уже есть начатый обход.");
      }
    }

    const filled = await tx.getAllAsync<{
      pointId: string; status: string; comment: string | null; issueTypeId: string | null; confirmationType: string | null;
      manualReason: string | null; nfcUidHash: string | null; completedAtLocal: string | null; photos: string | null;
    }>(
      `SELECT point_id AS pointId, status, comment, issue_type_id AS issueTypeId, confirmation_type AS confirmationType,
              manual_reason AS manualReason, nfc_uid_hash AS nfcUidHash, completed_at_local AS completedAtLocal,
              photo_client_file_ids_json AS photos
         FROM point_results
        WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND status IN ('ok', 'issue', 'skipped')
        ORDER BY completed_at_local, point_id`,
      [owner, currentContourId, input.assignmentId]
    );
    const now = new Date().toISOString();
    const mode: TransferMode = input.sameAccount ? "sameDevice" : "otherDevice";
    const nextStatus = input.sameAccount ? assignment.status : "paused";
    await tx.runAsync(
      "UPDATE patrol_assignments SET employee_id = ?, status = ? WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
      [input.toEmployeeId, nextStatus, owner, currentContourId, input.assignmentId]
    );
    await tx.runAsync(
      `UPDATE patrol_request_board SET assigned_employee_id = ?, assigned_full_name = ?, status = ?
        WHERE owner_user_id = ? AND request_id = ?`,
      [input.toEmployeeId, input.toEmployeeName, nextStatus, owner, assignment.requestId]
    );
    const payload: TransferCommandPayload = {
      assignmentId: input.assignmentId,
      requestId: assignment.requestId,
      fromEmployeeId: assignment.employeeId,
      fromEmployeeName: assignment.performerName ?? "",
      toEmployeeId: input.toEmployeeId,
      toEmployeeName: input.toEmployeeName,
      mode,
      statusBefore: assignment.status,
      reason: input.reason.trim().slice(0, 500),
      transferredAtLocal: now,
      pointResults: filled.filter((point) => terminalPointStatuses.includes(point.status)).map((point) => ({
        pointId: point.pointId,
        status: point.status,
        comment: point.comment,
        issueTypeId: point.issueTypeId,
        confirmationType: point.confirmationType,
        manualReason: point.manualReason,
        nfcUidHash: point.nfcUidHash,
        completedAtLocal: point.completedAtLocal,
        photoClientFileIds: parseStringArray(point.photos)
      })),
      dependencies: []
    };
    await insertOutboxCommandInTransaction(tx, {
      clientOperationId: operationId,
      ownerUserId: owner,
      commandType: "transferPatrolAssignment",
      entityType: "patrolAssignment",
      entityLocalId: input.assignmentId,
      entityServerId: input.assignmentId,
      payload: payload as unknown as Record<string, unknown>,
      createdAtLocal: now,
      attemptCount: 0,
      status: "pending"
    });
  }));
  requestSyncAfterMutation();
  return operationId;
}

/** Status of a queued handover, for the screen that waits for the receipt. */
export async function readTransferCommand(operationId: string) {
  const owner = await requireOwner();
  const db = await getDatabase();
  return db.getFirstAsync<{ status: string; lastError: string | null }>(
    `SELECT status, last_error AS lastError FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
    [owner, currentContourId, operationId]
  );
}
