import * as Crypto from "expo-crypto";
import type * as SQLite from "expo-sqlite";
import { currentContourId } from "@/core/environments";
import type { BootstrapDto, TransferredPointResultDto } from "@/domain/patrol/patrolTypes";
import type { OutboxResponse } from "@/domain/sync/syncTypes";

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

const terminalStatuses = new Set(["ok", "issue", "skipped"]);
const confirmationTypes = new Set(["nfc", "qr", "manual"]);

/** Server-confirmed point copied from a handover; never sent as a local edit. */
export const transferredPointSyncStatus = "transferred";

/**
 * Applies the handover part of a bootstrap: whether the server accepts
 * transferPatrolAssignment, and the points an earlier performer filled on
 * another phone before the patrol reached this account.
 */
export async function applyPatrolTransferBootstrapInTransaction(tx: SqlExecutor, ownerUserId: string, bootstrap: BootstrapDto) {
  await tx.runAsync(
    `INSERT INTO patrol_transfer_state (owner_user_id, contour_id, available) VALUES (?, ?, ?)
     ON CONFLICT(owner_user_id, contour_id) DO UPDATE SET available = excluded.available`,
    [ownerUserId, currentContourId, bootstrap.patrolTransfer === true ? 1 : 0]
  );
  for (const assignment of bootstrap.assignments) {
    for (const point of readTransferredPoints(assignment.transferredPointResults)) {
      const known = await tx.getFirstAsync<{ id: string }>(
        `SELECT point_id AS id FROM assignment_route_points WHERE assignment_id = ? AND point_id = ?`,
        [assignment.assignmentId, point.pointId]
      );
      if (!known) continue;
      const existing = await tx.getFirstAsync<{ status: string }>(
        `SELECT status FROM point_results
          WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND point_id = ? LIMIT 1`,
        [ownerUserId, currentContourId, assignment.assignmentId, point.pointId]
      );
      // A result this phone already holds for the point stays as it is.
      if (existing && terminalStatuses.has(existing.status)) continue;
      await tx.runAsync(
        `DELETE FROM point_results WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND point_id = ?`,
        [ownerUserId, currentContourId, assignment.assignmentId, point.pointId]
      );
      await tx.runAsync(
        `INSERT INTO point_results (
           local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, comment,
           issue_type_id, severity, deferred_reason, completed_at_local, sync_status,
           confirmation_type, nfc_uid_hash, scanned_at_local, photo_client_file_ids_json, manual_reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL, '[]', ?)`,
        [
          Crypto.randomUUID(), ownerUserId, currentContourId, assignment.assignmentId, point.pointId, point.status,
          point.comment, point.issueTypeId, point.completedAtLocal, transferredPointSyncStatus,
          point.confirmationType && confirmationTypes.has(point.confirmationType) ? point.confirmationType : null,
          point.manualReason
        ]
      );
    }
  }
}

export function readTransferredPoints(value: unknown): TransferredPointResultDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const text = (key: string) => typeof record[key] === "string" && (record[key] as string).trim() ? record[key] as string : null;
    const pointId = text("pointId");
    const status = text("status");
    if (!pointId || !status || !terminalStatuses.has(status)) return [];
    return [{
      pointId,
      status,
      comment: text("comment"),
      issueTypeId: text("issueTypeId"),
      confirmationType: text("confirmationType"),
      manualReason: text("manualReason"),
      completedAtLocal: text("completedAtLocal"),
      performerEmployeeId: text("performerEmployeeId") ?? "",
      performerName: text("performerName") ?? "",
      photoCount: typeof record.photoCount === "number" ? record.photoCount : 0
    }];
  });
}

export type TransferCommandPayload = {
  assignmentId: string;
  requestId: string;
  fromEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeId: string;
  toEmployeeName: string;
  mode: "sameDevice" | "otherDevice";
  statusBefore: string;
  reason: string;
  transferredAtLocal: string;
  pointResults: unknown[];
  dependencies: string[];
};

export function parseTransferPayload(payloadJson: string): TransferCommandPayload | null {
  try {
    const payload = JSON.parse(payloadJson) as Partial<TransferCommandPayload>;
    if (typeof payload.assignmentId !== "string" || typeof payload.fromEmployeeId !== "string"
      || typeof payload.toEmployeeId !== "string" || (payload.mode !== "sameDevice" && payload.mode !== "otherDevice")) return null;
    return payload as TransferCommandPayload;
  } catch {
    return null;
  }
}

/**
 * Called for every outbox receipt. On acceptance a patrol that went to
 * another phone leaves this phone; on refusal the local handover is undone so
 * the previous performer can continue.
 */
export async function applyPatrolTransferResponseInTransaction(tx: SqlExecutor, ownerUserId: string, response: OutboxResponse) {
  if (response.status === "retryLater") return;
  const command = await tx.getFirstAsync<{ payloadJson: string }>(
    `SELECT payload_json AS payloadJson FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND command_type = 'transferPatrolAssignment'`,
    [ownerUserId, currentContourId, response.clientOperationId]
  );
  if (!command) return;
  const payload = parseTransferPayload(command.payloadJson);
  if (!payload) return;
  const { assignmentId } = payload;

  if (response.status === "accepted" || response.status === "duplicate") {
    if (payload.mode === "sameDevice") {
      if (response.serverRevision !== null) {
        await tx.runAsync(
          `UPDATE patrol_assignments SET revision = MAX(revision, ?) WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
          [response.serverRevision, ownerUserId, currentContourId, assignmentId]
        );
      }
      return;
    }
    // The patrol now belongs to another account. Photos referenced by this
    // command were uploaded before it was sent; the files stay for retention.
    await tx.runAsync(`DELETE FROM point_results WHERE owner_user_id = ? AND assignment_id = ?`, [ownerUserId, assignmentId]);
    await tx.runAsync(`DELETE FROM assignment_route_points WHERE assignment_id = ?`, [assignmentId]);
    await tx.runAsync(`DELETE FROM report_auto_submit WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`, [ownerUserId, currentContourId, assignmentId]);
    await tx.runAsync(`UPDATE patrol_device_context SET assignment_id = NULL WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`, [ownerUserId, currentContourId, assignmentId]);
    await tx.runAsync(`DELETE FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ?`, [ownerUserId, assignmentId]);
    await tx.runAsync(`DELETE FROM patrol_request_board WHERE owner_user_id = ? AND request_id = ?`, [ownerUserId, payload.requestId]);
    return;
  }

  // conflict / rejected: give the patrol back to the previous performer.
  const current = await tx.getFirstAsync<{ employeeId: string | null; status: string }>(
    `SELECT employee_id AS employeeId, status FROM patrol_assignments WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
    [ownerUserId, currentContourId, assignmentId]
  );
  if (!current || current.employeeId !== payload.toEmployeeId) return;
  const restoreStatus = payload.mode === "otherDevice" && current.status === "paused" && payload.statusBefore ? payload.statusBefore : current.status;
  await tx.runAsync(
    `UPDATE patrol_assignments SET employee_id = ?, status = ? WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
    [payload.fromEmployeeId, restoreStatus, ownerUserId, currentContourId, assignmentId]
  );
  await tx.runAsync(
    `UPDATE patrol_request_board SET assigned_employee_id = ?, assigned_full_name = ?, status = CASE WHEN status = 'paused' THEN ? ELSE status END
      WHERE owner_user_id = ? AND request_id = ?`,
    [payload.fromEmployeeId, payload.fromEmployeeName, restoreStatus, ownerUserId, payload.requestId]
  );
}
