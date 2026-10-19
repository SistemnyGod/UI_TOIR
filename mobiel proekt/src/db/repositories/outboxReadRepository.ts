import { currentContourId } from "@/core/environments";
import { getDatabase } from "@/db/database";

import { MobileEntityType, OutboxCommandStatus, OutboxCommandType } from "@/domain/sync/syncTypes";
import type { ReportDeliveryState, ReportDeliveryStateSnapshot } from "@/domain/reporting/reportDeliveryState";

import { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";

import { outboxAcknowledgementBarriersSql } from "./outboxEligibilitySql";

export async function getNextOutboxRetryAt(ownerUserId: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ nextRetryAt: string | null }>(
    `
      SELECT MIN(candidate.next_attempt_at) AS nextRetryAt
      FROM outbox_commands candidate
      WHERE candidate.owner_user_id = ?
        AND candidate.contour_id = ?
        AND candidate.status = 'retryLater'
        AND candidate.next_attempt_at IS NOT NULL
        ${outboxAcknowledgementBarriersSql}
    `,
    [ownerUserId, currentContourId]
  );

  return row?.nextRetryAt ?? null;
}

export async function countRetryableOutboxCommands(ownerUserId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status = 'retryLater'
        AND next_attempt_at IS NOT NULL
    `,
    [ownerUserId, currentContourId]
  );

  return row?.count ?? 0;
}

export async function countOutboxDeliveryProblems(ownerUserId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status IN ('retryLater', 'conflict', 'rejected', 'wrong_contour', 'invalidPayload', 'blocked')
    `,
    [ownerUserId, currentContourId]
  );

  return row?.count ?? 0;
}

export async function countPendingOutboxCommands(ownerUserId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM outbox_commands
      WHERE owner_user_id = ?
                AND contour_id = ?
        AND status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked')
    `,
    [ownerUserId, currentContourId]
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
      WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
    `,
    [ownerUserId, currentContourId, clientOperationId]
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
                AND contour_id = ?
                AND command_type = 'completePatrolAssignment'
        AND entity_local_id = ?
        AND status <> 'superseded'
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, currentContourId, assignmentId]
  );
}

export function isRecoverableLifecycleRejection(commandType: string, lastError: string | null) {
  const error = (lastError ?? "").toLowerCase();
  if (commandType === "startPatrolAssignment") {
    return error.includes("only an accepted patrol assignment can be started");
  }
  if (["scanPatrolPointNfc", "scanPatrolPointQr", "markPatrolPointOk", "markPatrolPointIssue"].includes(commandType)) {
    return error.includes("patrol point actions are allowed only while patrol is in progress")
      || error.includes("сначала завершите обязательные точки по порядку маршрута");
  }
  if (commandType === "completePatrolAssignment") {
    return error.includes("patrol assignment must be in progress before report submit");
  }
  return false;
}

export async function getReportDeliveryState(
  ownerUserId: string,
  assignmentId: string
): Promise<ReportDeliveryStateSnapshot> {
  return (await getReportDeliveryStates(ownerUserId, [assignmentId])).get(assignmentId)!;
}

export async function getReportDeliveryStates(
  ownerUserId: string,
  assignmentIds: string[]
): Promise<Map<string, ReportDeliveryStateSnapshot>> {
  if (!assignmentIds.length) return new Map();
  // Bound SQLite parameters on older devices, even after many "load more" pages.
  if (assignmentIds.length > 250) {
    const result = new Map<string, ReportDeliveryStateSnapshot>();
    for (let offset = 0; offset < assignmentIds.length; offset += 250) {
      for (const [id, delivery] of await getReportDeliveryStates(ownerUserId, assignmentIds.slice(offset, offset + 250))) result.set(id, delivery);
    }
    return result;
  }
  const db = await getDatabase();
  const aggregateKeys = assignmentIds.map((id) => `patrolAssignment:${id}`);
  const rows = await db.getAllAsync<{
    aggregateKey: string;
    clientOperationId: string;
    commandType: string;
    status: OutboxCommandStatus;
    lastError: string | null;
    nextAttemptAt: string | null;
    updatedAtLocal: string | null;
    attemptCount: number;
  }>(
    `
      SELECT
        aggregate_key AS aggregateKey,
        client_operation_id AS clientOperationId,
        command_type AS commandType,
        status,
        last_error AS lastError,
        next_attempt_at AS nextAttemptAt,
        updated_at_local AS updatedAtLocal,
        attempt_count AS attemptCount
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND aggregate_key IN (${aggregateKeys.map(() => '?').join(',')})
      ORDER BY sequence_no ASC, created_at_local ASC, client_operation_id ASC
    `,
    [ownerUserId, currentContourId, ...aggregateKeys]
  );
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = grouped.get(row.aggregateKey) ?? [];
    group.push(row);
    grouped.set(row.aggregateKey, group);
  }
  return new Map(assignmentIds.map((id) => [id, resolveReportDeliveryRows(grouped.get(`patrolAssignment:${id}`) ?? [])]));
}

function resolveReportDeliveryRows(rows: {
  clientOperationId: string; commandType: string; status: OutboxCommandStatus;
  lastError: string | null; nextAttemptAt: string | null; updatedAtLocal: string | null; attemptCount: number;
}[]): ReportDeliveryStateSnapshot {
  const empty = (): ReportDeliveryStateSnapshot => ({ status: "notQueued", updatedAtLocal: null, attemptCount: 0 });
  const snapshot = (state: ReportDeliveryState, row: typeof rows[number]): ReportDeliveryStateSnapshot => ({
    ...state,
    updatedAtLocal: row.updatedAtLocal,
    attemptCount: row.attemptCount
  }) as ReportDeliveryStateSnapshot;
  const first = (...statuses: OutboxCommandStatus[]) => rows.find((row) => statuses.includes(row.status));

  const wrongContour = first("wrong_contour");
  if (wrongContour) return snapshot({ status: "wrongContour", blockingOperationId: wrongContour.clientOperationId, lastError: wrongContour.lastError }, wrongContour);
  const conflict = first("conflict");
  if (conflict) return snapshot({ status: "conflict", blockingOperationId: conflict.clientOperationId, blockingCommandType: conflict.commandType, lastError: conflict.lastError }, conflict);
  const recoverableLifecycle = rows.find((row) => row.status === "rejected" && isRecoverableLifecycleRejection(row.commandType, row.lastError));
  if (recoverableLifecycle) {
    return snapshot({
      status: "retryScheduled",
      clientOperationId: recoverableLifecycle.clientOperationId,
      nextAttemptAt: recoverableLifecycle.nextAttemptAt,
      lastError: "\u041e\u0442\u0447\u0451\u0442 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d, \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u043c \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0443."
    }, recoverableLifecycle);
  }
  const repair = first("invalidPayload", "rejected");
  if (repair) return snapshot({ status: "repairRequired", blockingOperationId: repair.clientOperationId, blockingCommandType: repair.commandType, lastError: repair.lastError }, repair);
  const blocked = first("blocked");
  if (blocked) return snapshot({ status: "blockedByDependency", blockingOperationId: blocked.clientOperationId, blockingCommandType: blocked.commandType, blockingStatus: blocked.status, lastError: blocked.lastError }, blocked);
  const waitingAuth = first("waiting_auth");
  if (waitingAuth) return snapshot({ status: "waitingAuth", clientOperationId: waitingAuth.clientOperationId, lastError: waitingAuth.lastError }, waitingAuth);
  const sending = first("sending");
  if (sending) return snapshot({ status: "sending", clientOperationId: sending.clientOperationId }, sending);
  const waitingNetwork = first("waiting_network");
  if (waitingNetwork) return snapshot({ status: "waitingNetwork", clientOperationId: waitingNetwork.clientOperationId, lastError: waitingNetwork.lastError }, waitingNetwork);
  const retryScheduled = first("retryLater");
  if (retryScheduled) return snapshot({ status: "retryScheduled", clientOperationId: retryScheduled.clientOperationId, nextAttemptAt: retryScheduled.nextAttemptAt, lastError: retryScheduled.lastError }, retryScheduled);
  const queued = first("pending");
  if (queued) return snapshot({ status: "queued", clientOperationId: queued.clientOperationId }, queued);
  const delivered = rows.find((row) => row.commandType === "completePatrolAssignment" && (row.status === "accepted" || row.status === "duplicate"));
  if (delivered) return snapshot({ status: "delivered", clientOperationId: delivered.clientOperationId, deliveredAt: delivered.updatedAtLocal }, delivered);
  return empty();
}

export async function listSyncQueueCommands(ownerUserId: string, limit = 100) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    client_operation_id: string;
    contour_id: string;
    command_type: string;
    entity_type: string;
    entity_local_id: string | null;
    entity_server_id: string | null;
    status: string;
    created_at_local: string;
    updated_at_local: string | null;
    next_attempt_at: string | null;
    last_attempt_at: string | null;
    attempt_count: number;
    last_error: string | null;
    assignment_route_name: string | null;
    source_assignment_id: string | null;
    resolution_status: string | null;
  }>(
    `
      SELECT
        command.client_operation_id,
        command.contour_id,
        command.command_type,
        command.entity_type,
        command.entity_local_id,
        command.entity_server_id,
        command.status,
        command.created_at_local,
        command.updated_at_local,
        command.next_attempt_at,
        command.last_attempt_at,
        command.attempt_count,
        command.last_error,
        COALESCE(route.name, request.route_name, '') AS assignment_route_name,
        json_extract(command.payload_json, '$.sourceAssignmentId') AS source_assignment_id,
        (SELECT resolution_status FROM sync_conflicts conflict WHERE conflict.owner_user_id = command.owner_user_id AND conflict.contour_id = command.contour_id AND conflict.client_operation_id = command.client_operation_id ORDER BY conflict.rowid DESC LIMIT 1) AS resolution_status
      FROM outbox_commands command
      LEFT JOIN patrol_assignments assignment
        ON assignment.assignment_id = command.entity_local_id
      LEFT JOIN routes route
        ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request
        ON request.request_id = assignment.request_id
       AND request.owner_user_id = command.owner_user_id
      WHERE command.owner_user_id = ?
        AND command.contour_id = ?
        AND command.status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked', 'rejected', 'conflict', 'invalidPayload')
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
    [ownerUserId, currentContourId, limit]
  );

  return rows.map<SyncQueueCommandItem>((row) => ({
    clientOperationId: row.client_operation_id,
    contourId: row.contour_id,
    commandType: row.command_type as OutboxCommandType,
    entityType: row.entity_type as MobileEntityType,
    entityLocalId: row.entity_local_id,
    entityServerId: row.entity_server_id,
    status: row.status as OutboxCommandStatus,
    createdAtLocal: row.created_at_local,
    updatedAtLocal: row.updated_at_local,
    nextAttemptAt: row.next_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    resolutionStatus: row.resolution_status as SyncQueueCommandItem["resolutionStatus"],
    assignmentRouteName: row.assignment_route_name,
    sourceAssignmentId: row.source_assignment_id
  }));
}

export async function getOutboxCommandEntityLocalId(ownerUserId: string, clientOperationId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ entityLocalId: string | null }>(
    `
      SELECT entity_local_id AS entityLocalId
      FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
      LIMIT 1
    `,
    [ownerUserId, currentContourId, clientOperationId]
  );
  return row?.entityLocalId ?? null;
}
