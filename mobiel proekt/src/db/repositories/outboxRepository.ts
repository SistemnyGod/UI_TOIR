import * as Crypto from "expo-crypto";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { insertOutboxCommandInTransaction, updatePendingCompleteReportBaseRevisionInTransaction, updatePendingWorkTaskRevisionInTransaction, type SqlExecutor } from "@/db/repositories/outboxSql";
import { finalizeCancelledAssignmentInTransaction } from "@/db/repositories/patrolCancellationRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandStatus, OutboxCommandType, OutboxResponse } from "@/domain/sync/syncTypes";
import type { ReportDeliveryState, ReportDeliveryStateSnapshot } from "@/domain/reporting/reportDeliveryState";
import { extractAssignmentId, extractCompletionFileIds, isCancelledCompletionResponse, isPatrolAssignmentCommand, isProblemResponse, parsePatrolPointConflictIdentity, resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";
import { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";
import { resolveRetryDelaySeconds } from "@/sync/outboxRetryPolicy";
import { parseOutboxPayloadRows } from "@/sync/outboxPayloadParser";
import { applyRejectedCancellationTransition, applyServerWinsTransition, ConflictServerSnapshot } from "@/domain/sync/conflictResolutionPolicy";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
import { getReleaseResponseResolution } from "@/domain/patrol/releaseResolutionPolicy";
import { getPointResultSyncUpdate } from "@/domain/patrol/pointResultSyncPolicy";
import { validatePatrolCompletionPayload } from "@/domain/patrol/completionPayloadPolicy";
import { resolveRemappedAssignmentStatus } from "@/domain/patrol/assignmentIdentityPolicy";

export type { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";

type OutboxDatabaseRow = {
  client_operation_id: string;
  owner_user_id: string;
  contour_id: string;
  command_type: string;
  entity_type: string;
  entity_local_id: string | null;
  entity_server_id: string | null;
  payload_json: string;
  created_at_local: string;
  updated_at_local: string | null;
  next_attempt_at: string | null;
  retry_reason: string | null;
  attempt_count: number;
  status: string;
  aggregate_key: string | null;
  sequence_no: number | null;
};

export async function insertOutboxCommand(command: OutboxCommand) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await insertOutboxCommandInTransaction(tx, command);
    })
  );
}
export async function listPendingOutboxCommands(ownerUserId: string, limit = 25, aggregateKey?: string) {
  const db = await getDatabase();
  const nowIso = new Date().toISOString();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const aggregateFilter = aggregateKey ? "AND candidate.aggregate_key = ?" : "";
  const rows = await db.getAllAsync<OutboxDatabaseRow>(
    `
      SELECT candidate.*
      FROM outbox_commands candidate
      WHERE candidate.owner_user_id = ?
        AND candidate.contour_id = ?
        AND (
          candidate.status = 'pending'
          OR (
            candidate.status = 'retryLater'
            AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at <= ?)
          )
        )
        ${aggregateFilter}
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_commands previous
          WHERE previous.owner_user_id = candidate.owner_user_id
            AND previous.contour_id = candidate.contour_id
            AND previous.aggregate_key = candidate.aggregate_key
            AND previous.sequence_no < candidate.sequence_no
            AND previous.status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled')
        )
      ORDER BY candidate.sequence_no ASC,
               candidate.created_at_local ASC,
               candidate.client_operation_id ASC
      LIMIT ?
    `,
    [ownerUserId, currentContourId, nowIso, ...(aggregateKey ? [aggregateKey] : []), boundedLimit]
  );

  const commands = await parseOutboxPayloadRows(
    rows,
    (row) => ({
      clientOperationId: row.client_operation_id,
      ownerUserId: row.owner_user_id,
      contourId: row.contour_id,
      commandType: row.command_type as OutboxCommandType,
      entityType: row.entity_type as MobileEntityType,
      entityLocalId: row.entity_local_id,
      entityServerId: row.entity_server_id,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAtLocal: row.created_at_local,
      attemptCount: row.attempt_count,
      status: row.status as OutboxCommandStatus,
      nextAttemptAt: row.next_attempt_at,
      aggregateKey: row.aggregate_key,
      sequenceNo: row.sequence_no
    }),
    async (row, reason) => {
      await withSqliteBusyRetry(() => db.runAsync(
        "UPDATE outbox_commands SET status = 'invalidPayload', last_error = ?, updated_at_local = ? WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
        [`Некорректный JSON payload: ${reason}`, new Date().toISOString(), ownerUserId, currentContourId, row.client_operation_id]
      ));
    }
  );

  return commands.map(({ nextAttemptAt: _nextAttemptAt, ...command }) => command);
}
export type OutboxRetryReason = "network" | "timeout" | "server" | "rateLimit" | "authentication" | "unknown";

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
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_commands previous
          WHERE previous.owner_user_id = candidate.owner_user_id
            AND previous.contour_id = candidate.contour_id
            AND previous.aggregate_key = candidate.aggregate_key
            AND previous.sequence_no < candidate.sequence_no
            AND previous.status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled')
        )
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

function isRecoverableLifecycleRejection(commandType: string, lastError: string | null) {
  const error = (lastError ?? "").toLowerCase();
  if (commandType === "startPatrolAssignment") {
    return error.includes("only an accepted patrol assignment can be started");
  }
  if (["scanPatrolPointNfc", "scanPatrolPointQr", "markPatrolPointOk", "markPatrolPointIssue"].includes(commandType)) {
    return error.includes("patrol point actions are allowed only while patrol is in progress");
  }
  if (commandType === "completePatrolAssignment") {
    return error.includes("patrol assignment must be in progress before report submit");
  }
  return false;
}

function recoverableLifecycleMessage(commandType: string) {
  if (commandType === "startPatrolAssignment") {
    return "Запуск обхода сохранён. Восстанавливаем принятие заявки в фоне.";
  }
  if (commandType === "completePatrolAssignment") {
    return "Отчёт сохранён. Восстанавливаем последовательность отправки.";
  }
  return "Действие обхода сохранено. Восстанавливаем отправку в фоне.";
}
export async function getReportDeliveryState(
  ownerUserId: string,
  assignmentId: string
): Promise<ReportDeliveryStateSnapshot> {
  const db = await getDatabase();
  const aggregateKey = `patrolAssignment:${assignmentId}`;
  const rows = await db.getAllAsync<{
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
        AND aggregate_key = ?
      ORDER BY sequence_no ASC, created_at_local ASC, client_operation_id ASC
    `,
    [ownerUserId, currentContourId, aggregateKey]
  );
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
export async function quarantineInvalidPatrolCompletionCommands(ownerUserId: string, assignmentId?: string) {
  const db = await getDatabase();
  const assignmentFilter = assignmentId ? " AND entity_local_id = ?" : "";
  const params = assignmentId
    ? [ownerUserId, currentContourId, assignmentId]
    : [ownerUserId, currentContourId];
  let quarantined = 0;
  const assignmentIds = new Set<string>();

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const rows = await tx.getAllAsync<{
        clientOperationId: string;
        assignmentId: string | null;
        payloadJson: string;
      }>(
        `
          SELECT
            client_operation_id AS clientOperationId,
            entity_local_id AS assignmentId,
            payload_json AS payloadJson
          FROM outbox_commands
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND command_type = 'completePatrolAssignment'
            AND status IN ('pending', 'sending', 'retryLater', 'waiting_network', 'waiting_auth', 'wrong_contour')
            ${assignmentFilter}
        `,
        params
      );

      for (const row of rows) {
        let failure: string | null = null;
        try {
          const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
          const validation = validatePatrolCompletionPayload(payload);
          failure = validation.valid ? null : validation.message;
        } catch {
          failure = "Не удалось прочитать сохранённый отчёт.";
        }
        if (!failure) {
          continue;
        }

        const message = `Отчёт не отправлен: ${failure} Проверьте точки и сформируйте отчёт заново.`;
        const updatedAtLocal = new Date().toISOString();
        const commandUpdate = await tx.runAsync(
          `
            UPDATE outbox_commands
            SET status = 'invalidPayload',
                last_error = ?,
                next_attempt_at = NULL,
                retry_reason = NULL,
                updated_at_local = ?
            WHERE owner_user_id = ?
              AND contour_id = ?
              AND client_operation_id = ?
              AND status IN ('pending', 'sending', 'retryLater', 'waiting_network', 'waiting_auth', 'wrong_contour')
          `,
          [message, updatedAtLocal, ownerUserId, currentContourId, row.clientOperationId]
        );
        if (commandUpdate.changes !== 1) {
          continue;
        }
        quarantined += 1;

        if (row.assignmentId) {
          assignmentIds.add(row.assignmentId);
          const assignmentUpdate = await tx.runAsync(
            `
              UPDATE patrol_assignments
              SET status = 'inProgress',
                  completed_at_local = NULL
              WHERE owner_user_id = ?
                AND contour_id = ?
                AND assignment_id = ?
                AND status IN ('completedLocal', 'syncing', 'syncError')
            `,
            [ownerUserId, currentContourId, row.assignmentId]
          );
          if (assignmentUpdate.changes !== 1) {
            continue;
          }
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = 'inProgress'
              WHERE owner_user_id = ?
                AND request_id = (
                  SELECT request_id
                  FROM patrol_assignments
                  WHERE owner_user_id = ?
                    AND contour_id = ?
                    AND assignment_id = ?
                  LIMIT 1
                )
            `,
            [ownerUserId, ownerUserId, currentContourId, row.assignmentId]
          );
        }
      }
    })
  );

  return { quarantined, assignmentIds: Array.from(assignmentIds) };
}
export async function hasPendingOutboxCommands(ownerUserId: string) {
  return (await countPendingOutboxCommands(ownerUserId)) > 0;
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
    assignmentRouteName: row.assignment_route_name
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
export async function listUnconfirmedCompleteReportCommands(
  ownerUserId: string,
  assignmentId?: string,
  limit = 24
) {
  const db = await getDatabase();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const assignmentFilter = assignmentId ? "AND entity_local_id = ?" : "";
  const params = assignmentId ? [ownerUserId, currentContourId, assignmentId] : [ownerUserId, currentContourId];
  const rows = await db.getAllAsync<{
    client_operation_id: string;
    owner_user_id: string;
     contour_id: string;
    command_type: string;
    entity_type: string;
    entity_local_id: string | null;
    entity_server_id: string | null;
    payload_json: string;
    created_at_local: string;
    updated_at_local: string | null;
    next_attempt_at: string | null;
    attempt_count: number;
    status: string;
  }>(
    `
      SELECT *
      FROM outbox_commands
      WHERE owner_user_id = ?
                AND contour_id = ?
                AND command_type = 'completePatrolAssignment'
        AND status IN ('pending', 'sending', 'retryLater')
        ${assignmentFilter}
      ORDER BY updated_at_local ASC, created_at_local ASC
      LIMIT ?
    `,
    [...params, boundedLimit]
  );

  const commands: OutboxCommand[] = [];
  for (const row of rows) {
    try {
      commands.push({
        clientOperationId: row.client_operation_id,
        ownerUserId: row.owner_user_id,
        contourId: row.contour_id,
        commandType: row.command_type as OutboxCommandType,
        entityType: row.entity_type as MobileEntityType,
        entityLocalId: row.entity_local_id,
        entityServerId: row.entity_server_id,
        payload: JSON.parse(row.payload_json) as Record<string, unknown>,
        createdAtLocal: row.created_at_local,
        attemptCount: row.attempt_count,
        status: row.status as OutboxCommandStatus
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Некорректный JSON payload.";
      await withSqliteBusyRetry(() => db.runAsync(
        "UPDATE outbox_commands SET status = 'invalidPayload', last_error = ?, updated_at_local = ? WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
        [`Некорректный JSON payload: ${reason}`, new Date().toISOString(), ownerUserId, currentContourId, row.client_operation_id]
      )).catch(() => undefined);
    }
  }

  return commands;
}

export async function markOutboxCommandsSending(ownerUserId: string, clientOperationIds: string[]) {
  if (clientOperationIds.length === 0) {
    return;
  }

  const db = await getDatabase();
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'sending',
          attempt_count = attempt_count + 1,
          last_error = NULL,
          next_attempt_at = NULL,
          last_attempt_at = ?,
          updated_at_local = ?
      WHERE owner_user_id = ?
                AND contour_id = ?
        AND client_operation_id IN (${placeholders})
        AND status IN ('pending', 'retryLater')
    `,
    [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId, ...clientOperationIds]
  ));
}

export async function markOutboxCommandsRetryLater(
  ownerUserId: string,
  clientOperationIds: string[],
  lastError?: string,
  retryAfterSeconds?: number | null,
  retryReason: OutboxRetryReason = "unknown"
) {
  if (clientOperationIds.length === 0) {
    return;
  }

  const db = await getDatabase();
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
    const rows = await tx.getAllAsync<{ client_operation_id: string; attempt_count: number }>(
      `
        SELECT client_operation_id, attempt_count
        FROM outbox_commands
        WHERE owner_user_id = ?
                AND contour_id = ?
          AND client_operation_id IN (${placeholders})
          AND status = 'sending'
      `,
      [ownerUserId, currentContourId, ...clientOperationIds]
    );
    const updatedAtLocal = new Date().toISOString();
    const nowMs = Date.now();

    for (const row of rows) {
      const delaySeconds = resolveRetryDelaySeconds(retryAfterSeconds, row.attempt_count);
      const nextAttemptAt = new Date(nowMs + delaySeconds * 1000).toISOString();
      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = 'retryLater',
              last_error = COALESCE(?, last_error),
              retry_reason = ?,
              next_attempt_at = ?,
              updated_at_local = ?
          WHERE owner_user_id = ?
                AND contour_id = ?
            AND client_operation_id = ?
            AND status = 'sending'
        `,
        [lastError ?? null, retryReason, nextAttemptAt, updatedAtLocal, ownerUserId, currentContourId, row.client_operation_id]
      );
    }
    })
  );
}


export async function markOutboxCommandsRejected(ownerUserId: string, clientOperationIds: string[], lastError: string) {
  if (clientOperationIds.length === 0) {
    return;
  }

  const db = await getDatabase();
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'rejected',
          last_error = ?,
          retry_reason = NULL,
          next_attempt_at = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND client_operation_id IN (${placeholders})
        AND status = 'sending'
    `,
    [lastError, updatedAtLocal, ownerUserId, currentContourId, ...clientOperationIds]
  ));
}
export async function markPendingOutboxCommandsRetryLater(
  ownerUserId: string,
  lastError: string,
  retryReason: OutboxRetryReason = "server",
  aggregateKey?: string
) {
  const db = await getDatabase();
  const aggregateFilter = aggregateKey ? " AND aggregate_key = ?" : "";
  const aggregateParams = aggregateKey ? [aggregateKey] : [];

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const rows = await tx.getAllAsync<{
        client_operation_id: string;
        attempt_count: number;
        next_attempt_at: string | null;
      }>(
        "SELECT client_operation_id, attempt_count, next_attempt_at " +
        "FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? " +
        "AND (status IN ('pending', 'sending') OR (status = 'retryLater' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)))" + aggregateFilter,
        [ownerUserId, currentContourId, nowIso, ...aggregateParams]
      );
      const updatedAtLocal = new Date(nowMs).toISOString();

      for (const row of rows) {
        const computedNextAttemptMs = nowMs + resolveRetryDelaySeconds(null, row.attempt_count) * 1000;
        const existingNextAttemptMs = row.next_attempt_at ? Date.parse(row.next_attempt_at) : Number.NaN;
        const nextAttemptAt = new Date(
          Math.max(
            computedNextAttemptMs,
            Number.isFinite(existingNextAttemptMs) ? existingNextAttemptMs : computedNextAttemptMs
          )
        ).toISOString();

        await tx.runAsync(
          "UPDATE outbox_commands SET status = 'retryLater', last_error = ?, retry_reason = ?, next_attempt_at = ?, updated_at_local = ? " +
          "WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
          [lastError, retryReason, nextAttemptAt, updatedAtLocal, ownerUserId, currentContourId, row.client_operation_id]
        );
      }
    })
  );
}

export async function markPendingOutboxCommandsWaitingNetwork(
  ownerUserId: string,
  lastError: string,
  aggregateKey?: string
) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const aggregateFilter = aggregateKey ? " AND aggregate_key = ?" : "";
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'waiting_network',
          last_error = ?,
          retry_reason = 'network',
          next_attempt_at = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND (
          status IN ('pending', 'sending', 'waiting_network')
          OR (status = 'retryLater' AND retry_reason IN ('network', 'timeout'))
        )
        ${aggregateFilter}
    `,
    [lastError, updatedAtLocal, ownerUserId, currentContourId, ...(aggregateKey ? [aggregateKey] : [])]
  ));
}
export async function activateWaitingNetworkOutboxCommands(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'pending', next_attempt_at = NULL, retry_reason = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status = 'waiting_network'",
    [updatedAtLocal, ownerUserId, currentContourId]
  ));
}

export async function activateNetworkRecoveredOutboxCommands(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'pending',
          next_attempt_at = NULL,
          retry_reason = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND (
          status = 'waiting_network'
          OR (status = 'retryLater' AND retry_reason IN ('network', 'timeout'))
        )
    `,
    [updatedAtLocal, ownerUserId, currentContourId]
  ));
}

export async function activateRetryableReportCommands(ownerUserId: string, assignmentId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const aggregateKey = `patrolAssignment:${assignmentId}`;
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = CASE
            WHEN status IN ('waiting_network', 'retryLater') THEN 'pending'
            ELSE status
          END,
          next_attempt_at = NULL,
          retry_reason = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND (
          status = 'waiting_network'
          OR (status = 'retryLater' AND COALESCE(retry_reason, 'unknown') <> 'rateLimit')
        )
        AND (aggregate_key = ? OR (aggregate_key IS NULL AND entity_local_id = ?))
    `,
    [updatedAtLocal, ownerUserId, currentContourId, aggregateKey, assignmentId]
  ));
}

export async function activateRetryableOutboxCommandsForImmediateRetry(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = CASE WHEN status = 'waiting_network' THEN 'pending' ELSE status END,
          next_attempt_at = NULL,
          retry_reason = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND (
          status = 'waiting_network'
          OR (status = 'retryLater' AND retry_reason IN ('network', 'timeout'))
        )
    `,
    [updatedAtLocal, ownerUserId, currentContourId]
  ));
}
export async function markPendingOutboxCommandsAuthRequired(
  ownerUserId: string,
  lastError: string,
  aggregateKey?: string
) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const aggregateFilter = aggregateKey ? " AND aggregate_key = ?" : "";

  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'waiting_auth',
          last_error = ?,
          retry_reason = 'authentication',
          next_attempt_at = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status IN ('pending', 'sending', 'retryLater', 'waiting_auth')
        ${aggregateFilter}
    `,
    [lastError, updatedAtLocal, ownerUserId, currentContourId, ...(aggregateKey ? [aggregateKey] : [])]
  ));
}

export async function activateWaitingAuthOutboxCommands(ownerUserId: string, aggregateKey?: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const scope = getAggregateActivationScope(aggregateKey);
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'pending', next_attempt_at = NULL, retry_reason = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status = 'waiting_auth'" + scope.filter,
    [updatedAtLocal, ownerUserId, currentContourId, ...scope.params]
  ));
}

export async function activateWrongContourOutboxCommands(ownerUserId: string, aggregateKey?: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const scope = getAggregateActivationScope(aggregateKey);
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'pending', last_error = NULL, next_attempt_at = NULL, retry_reason = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status = 'wrong_contour'" + scope.filter,
    [updatedAtLocal, ownerUserId, currentContourId, ...scope.params]
  ));
}

function getAggregateActivationScope(aggregateKey?: string) {
  if (!aggregateKey) {
    return { filter: "", params: [] as (string | null)[] };
  }

  const assignmentId = aggregateKey.startsWith("patrolAssignment:")
    ? aggregateKey.slice("patrolAssignment:".length)
    : null;
  return {
    filter: " AND (aggregate_key = ? OR (aggregate_key IS NULL AND entity_local_id = ?))",
    params: [aggregateKey, assignmentId]
  };
}
export async function markOutboxCommandsWrongContour(ownerUserId: string, clientOperationIds: string[], lastError: string) {
  if (clientOperationIds.length === 0) {
    return;
  }
  const db = await getDatabase();
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'wrong_contour', last_error = ?, retry_reason = NULL, next_attempt_at = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id IN (" + placeholders + ")",
    [lastError, updatedAtLocal, ownerUserId, currentContourId, ...clientOperationIds]
  ));
}
export async function markPendingOutboxCommandsWrongContour(
  ownerUserId: string,
  lastError: string,
  aggregateKey?: string
) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const aggregateFilter = aggregateKey ? " AND aggregate_key = ?" : "";
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'wrong_contour', last_error = ?, retry_reason = NULL, next_attempt_at = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? " +
    "AND status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'blocked')" + aggregateFilter,
    [lastError, updatedAtLocal, ownerUserId, currentContourId, ...(aggregateKey ? [aggregateKey] : [])]
  ));
}
export async function resetStaleSendingOutboxCommands(
  ownerUserId: string,
  staleBeforeIso: string,
  aggregateKey?: string
) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          next_attempt_at = ?,
          retry_reason = 'unknown',
          last_error = COALESCE(last_error, 'Отправка прервана и будет повторена автоматически.'),
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status = 'sending'
        AND (updated_at_local IS NULL OR updated_at_local < ?)
        AND (? IS NULL OR aggregate_key = ?)
    `,
    [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId, staleBeforeIso, aggregateKey ?? null, aggregateKey ?? null]
  ));
}

export async function resetSendingOutboxCommandsForManualRetry(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          next_attempt_at = ?,
          last_error = 'Пользователь запустил повторную отправку.',
          updated_at_local = ?
      WHERE owner_user_id = ?
                AND contour_id = ?
        AND status = 'sending'
    `,
    [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId]
  ));
}
export async function reactivateRecoverableRejectedStartCommands(ownerUserId: string, assignmentId?: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const assignmentFilter = assignmentId ? "AND command.entity_local_id = ?" : "";
  const queryParams = assignmentId
    ? [ownerUserId, currentContourId, assignmentId]
    : [ownerUserId, currentContourId];

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const rejectedStarts = await tx.getAllAsync<{
        clientOperationId: string;
        assignmentId: string;
        sequenceNo: number | null;
        aggregateKey: string | null;
      }>(
        `
          SELECT
            command.client_operation_id AS clientOperationId,
            command.entity_local_id AS assignmentId,
            command.sequence_no AS sequenceNo,
            command.aggregate_key AS aggregateKey
          FROM outbox_commands command
          INNER JOIN patrol_assignments assignment
            ON assignment.owner_user_id = command.owner_user_id
            AND assignment.contour_id = command.contour_id
            AND assignment.assignment_id = command.entity_local_id
          WHERE command.owner_user_id = ?
            AND command.contour_id = ?
            AND command.command_type = 'startPatrolAssignment'
            AND command.status = 'rejected'
            AND lower(COALESCE(command.last_error, '')) LIKE '%only an accepted patrol assignment can be started%'
            AND assignment.status IN ('retryLater', 'syncError', 'completedLocal', 'inProgress')
            ${assignmentFilter}
        `,
        queryParams
      );

      for (const rejectedStart of rejectedStarts) {
        // Sequence numbers are immutable during a normal retry. Legacy misordered rows are repaired once during database bootstrap.

        await tx.runAsync(
          `UPDATE outbox_commands
              SET status = 'retryLater',
                  next_attempt_at = ?,
                  retry_reason = 'server',
                  last_error = '\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u043c \u043f\u0440\u0438\u043d\u044f\u0442\u0438\u0435 \u0438 \u0437\u0430\u043f\u0443\u0441\u043a \u043e\u0431\u0445\u043e\u0434\u0430.',
                  updated_at_local = ?
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
          [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId, rejectedStart.clientOperationId]
        );
        await tx.runAsync(
          `UPDATE patrol_assignments
              SET status = CASE WHEN status = 'completedLocal' THEN status ELSE 'inProgress' END
            WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
          [ownerUserId, currentContourId, rejectedStart.assignmentId]
        );
        await tx.runAsync(
          `UPDATE patrol_request_board
              SET status = CASE WHEN status = 'completedLocal' THEN status ELSE 'inProgress' END
            WHERE owner_user_id = ? AND request_id = (
              SELECT request_id FROM patrol_assignments
              WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?
              LIMIT 1
            )`,
          [ownerUserId, ownerUserId, currentContourId, rejectedStart.assignmentId]
        );
        await resolveRecoverableOutboxConflict(tx, ownerUserId, rejectedStart.clientOperationId, updatedAtLocal);
      }
    })
  );
}
export async function reactivateRecoverableRejectedPointCommands(ownerUserId: string, assignmentId?: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const commandFilter = assignmentId ? "AND instr(command.payload_json, ?) > 0" : "";
  const commandParams = assignmentId ? [ownerUserId, currentContourId, assignmentId] : [ownerUserId, currentContourId];

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const rows = await tx.getAllAsync<{
        clientOperationId: string;
        payloadJson: string;
      }>(
        `SELECT command.client_operation_id AS clientOperationId,
                command.payload_json AS payloadJson
           FROM outbox_commands command
          WHERE command.owner_user_id = ?
            AND command.contour_id = ?
            AND command.command_type IN ('scanPatrolPointNfc', 'scanPatrolPointQr', 'markPatrolPointOk', 'markPatrolPointIssue', 'completePatrolAssignment')
            AND command.status = 'rejected'
            AND (
              lower(COALESCE(command.last_error, '')) LIKE '%patrol point actions are allowed only while patrol is in progress%'
              OR lower(COALESCE(command.last_error, '')) LIKE '%patrol assignment must be in progress before report submit%'
            )
            ${commandFilter}`,
        commandParams
      );

      for (const row of rows) {
        let payload: Record<string, unknown> | null = null;
        try {
          payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
        } catch {
          continue;
        }
        const targetAssignmentId = typeof payload.assignmentId === 'string' ? payload.assignmentId : null;
        if (!targetAssignmentId) continue;
        const assignment = await tx.getFirstAsync<{ status: string }>(
          `SELECT status FROM patrol_assignments
             WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?
             LIMIT 1`,
          [ownerUserId, currentContourId, targetAssignmentId]
        );
        if (!assignment || !['retryLater', 'syncError', 'completedLocal', 'inProgress'].includes(assignment.status)) continue;

        await tx.runAsync(
          `UPDATE outbox_commands
              SET status = 'retryLater',
                  next_attempt_at = ?,
                  retry_reason = 'server',
                  last_error = 'Восстанавливаем команды обхода после запуска.',
                  updated_at_local = ?
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
          [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId, row.clientOperationId]
        );
        await tx.runAsync(
          `UPDATE patrol_assignments
              SET status = CASE WHEN status = 'completedLocal' THEN status ELSE 'inProgress' END
            WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
          [ownerUserId, currentContourId, targetAssignmentId]
        );
        await resolveRecoverableOutboxConflict(tx, ownerUserId, row.clientOperationId, updatedAtLocal);
      }
    })
  );
}
async function resolveRecoverableOutboxConflict(tx: SqlExecutor, ownerUserId: string, clientOperationId: string, resolvedAt: string) {
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
  await tx.runAsync("UPDATE files SET assignment_id = ? WHERE owner_user_id = ? AND assignment_id = ?", [serverAssignmentId, ownerUserId, localAssignmentId]);

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
        AND (aggregate_key = ? OR entity_local_id = ? OR instr(payload_json, ?) > 0)`,
    [ownerUserId, currentContourId, `patrolAssignment:${localAssignmentId}`, localAssignmentId, localAssignmentId]
  );

  for (const command of commands) {
    let payloadJson = command.payloadJson;
    try {
      const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
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
}
export async function finalizeAcceptedCompleteReportCommands(ownerUserId: string, assignmentId?: string) {
  const db = await getDatabase();
  let finalized = 0;

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
    await tx.runAsync(
      "UPDATE outbox_commands SET next_attempt_at = NULL, last_attempt_at = NULL " +
      "WHERE owner_user_id = ? AND contour_id = ? AND status IN ('accepted', 'duplicate')",
      [ownerUserId, currentContourId]
    );
    const assignmentFilter = assignmentId ? "AND command.entity_local_id = ?" : "";
    const params = assignmentId ? [ownerUserId, currentContourId, assignmentId] : [ownerUserId, currentContourId];
    const rows = await tx.getAllAsync<{ assignment_id: string }>(
      `
        SELECT command.entity_local_id AS assignment_id
        FROM outbox_commands command
        INNER JOIN patrol_assignments assignment
          ON assignment.assignment_id = command.entity_local_id
        WHERE command.owner_user_id = ?
          AND command.contour_id = ?
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
    })
  );

  return { finalized };
}

export async function applyOutboxResponses(ownerUserId: string, responses: OutboxResponse[]) {
  const db = await getDatabase();

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
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
      const nextAttemptAt = response.status === "retryLater"
        ? new Date(
            Date.now() + resolveRetryDelaySeconds(response.retryAfterSeconds, attemptRow?.attempt_count ?? 1) * 1000
          ).toISOString()
        : null;
      const isSuccessful = response.status === "accepted" || response.status === "duplicate";
      const retryReason: OutboxRetryReason | null = response.status === "retryLater"
        ? response.retryAfterSeconds !== null ? "rateLimit" : "server"
        : null;
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
        }>(
          `
            SELECT owner_user_id, command_type, entity_type, entity_local_id, payload_json
            FROM outbox_commands
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
          `,
          [ownerUserId, currentContourId, response.clientOperationId]
        );

        if (command) {
          const recoverableLifecycleRejection =
            response.status === "rejected"
            && isRecoverableLifecycleRejection(command.command_type, response.message);
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
              [nextStatus, command.owner_user_id, command.owner_user_id, assignmentId]
            );
          }
        }
      }
    }
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

export async function markOutboxConflictForDispatcher(
  ownerUserId: string,
  clientOperationId: string,
  reason = "Ожидается решение диспетчера."
) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const command = await tx.getFirstAsync<{ status: string }>(
        `SELECT status FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
        [ownerUserId, currentContourId, clientOperationId]
      );
      if (!command || command.status !== "conflict") {
        throw new Error("Конфликт уже разрешён или недоступен для передачи диспетчеру.");
      }

      await tx.runAsync(
        `
          UPDATE sync_conflicts
          SET resolution_status = 'dispatcher',
              resolution_reason = ?,
              resolved_at = NULL
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
            AND status NOT IN ('resolved', 'dismissed')
        `,
        [reason, ownerUserId, currentContourId, clientOperationId]
      );

    })
  );

  void logMobileAction({
    eventType: "sync.conflict.dispatcher_requested",
    entityType: "outboxCommand",
    entityId: clientOperationId,
    message: reason
  }).catch(() => undefined);
}

export async function resolveOutboxConflictAsServerWins(
  ownerUserId: string,
  clientOperationId: string,
  snapshot: ConflictServerSnapshot
) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const transition = applyServerWinsTransition(snapshot);

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const command = await tx.getFirstAsync<{
        status: string;
        entity_type: string;
        entity_local_id: string | null;
        command_type: string;
        payload_json: string;
      }>(
        `
          SELECT status, entity_type, entity_local_id, command_type, payload_json
          FROM outbox_commands
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
        `,
        [ownerUserId, currentContourId, clientOperationId]
      );
      if (!command || command.status !== "conflict") {
        throw new Error("Конфликт уже разрешён или недоступен для принятия состояния сервера.");
      }

      const patrolPointIdentity = command.entity_type === "patrolPoint"
        ? parsePatrolPointConflictIdentity(command.payload_json, command.entity_local_id)
        : null;
      const patrolAssignmentInput = {
        commandType: command.command_type,
        entityType: command.entity_type,
        entityLocalId: command.entity_local_id,
        payload: command.payload_json
      };
      const patrolAssignmentCommand = isPatrolAssignmentCommand(patrolAssignmentInput);
      if (!patrolAssignmentCommand) {
        throw new Error("\u0414\u043b\u044f \u044d\u0442\u043e\u0439 \u0441\u0443\u0449\u043d\u043e\u0441\u0442\u0438 \u043d\u0435\u043b\u044c\u0437\u044f \u043f\u0440\u0438\u043d\u044f\u0442\u044c \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0431\u0435\u0437 \u0441\u043f\u0435\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0439 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0434\u0430\u043d\u043d\u044b\u0445.");
      }
      const patrolAssignmentIdentity = resolvePatrolAssignmentIdentity(patrolAssignmentInput);
      if (patrolAssignmentCommand) {
        if (!patrolAssignmentIdentity) {
          throw new Error("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442\u043d\u043e\u0439 \u043a\u043e\u043c\u0430\u043d\u0434\u044b; \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u043c.");
        }
        if (!snapshot.assignmentId || snapshot.assignmentId !== patrolAssignmentIdentity) {
          throw new Error("\u0421\u043d\u0438\u043c\u043e\u043a \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043d\u0435 \u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u043c\u0443 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044e; \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u043c.");
        }
        if (!snapshot.assignmentStatus) {
          throw new Error("\u0421\u0435\u0440\u0432\u0435\u0440 \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b \u0441\u0442\u0430\u0442\u0443\u0441 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f; \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u043c.");
        }
      }

      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = ?,
              last_error = NULL,
              next_attempt_at = NULL,
              last_attempt_at = NULL,
              updated_at_local = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND status = 'conflict'
        `,
        [transition.commandStatus, now, ownerUserId, currentContourId, clientOperationId]
      );
      await tx.runAsync(
        `
          UPDATE sync_conflicts
          SET status = ?,
              resolution_status = ?,
              resolved_at = ?,
              resolution_reason = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
            AND status NOT IN ('resolved', 'dismissed')
        `,
        [transition.conflictStatus, transition.resolutionStatus, now, "Принято актуальное состояние сервера.", ownerUserId, currentContourId, clientOperationId]
      );

      if (patrolAssignmentIdentity && snapshot.assignmentStatus) {
        if (snapshot.assignmentStatus === "cancelledServer") {
          await finalizeCancelledAssignmentInTransaction(tx, ownerUserId, patrolAssignmentIdentity);
        } else {
          const assignmentUpdate = await tx.runAsync(
            `
              UPDATE patrol_assignments
              SET status = ?,
                  revision = COALESCE(?, revision),
                  started_at_local = ?,
                  completed_at_local = ?
              WHERE owner_user_id = ? AND assignment_id = ?
            `,
            [snapshot.assignmentStatus, snapshot.revision, snapshot.startedAtLocal, snapshot.completedAtLocal, ownerUserId, patrolAssignmentIdentity]
          );
          if (assignmentUpdate.changes !== 1) {
            throw new Error("\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e; \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u043c.");
          }
          if (snapshot.requestId && snapshot.requestStatus) {
            await tx.runAsync(
              `UPDATE patrol_request_board SET status = ? WHERE owner_user_id = ? AND request_id = ?`,
              [snapshot.requestStatus, ownerUserId, snapshot.requestId]
            );
          }
          if (["completedServer", "cancelledServer"].includes(snapshot.assignmentStatus)) {
            await tx.runAsync(
              `UPDATE point_results SET sync_status = 'synced' WHERE owner_user_id = ? AND assignment_id = ?`,
              [ownerUserId, patrolAssignmentIdentity]
            );
            await tx.runAsync(
              `UPDATE files SET status = 'linked', linked_at = ? WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND status IN ('uploaded', 'queued', 'localOnly')`,
              [now, ownerUserId, currentContourId, patrolAssignmentIdentity]
            );
          }
        }
      } else if (command.entity_type === "workTask" && command.entity_local_id) {
        await tx.runAsync(
          `UPDATE work_tasks SET sync_status = 'synced' WHERE owner_user_id = ? AND task_id = ?`,
          [ownerUserId, command.entity_local_id]
        );
      } else if (command.entity_type === "shiftRemark" && command.entity_local_id) {
        await tx.runAsync(
          `UPDATE shift_remarks SET sync_status = 'synced' WHERE owner_user_id = ? AND remark_id = ?`,
          [ownerUserId, command.entity_local_id]
        );
      } else if (command.entity_type === "patrolPoint" && patrolPointIdentity) {
        const updateResult = await tx.runAsync(
          "UPDATE point_results SET sync_status = 'synced' WHERE owner_user_id = ? AND assignment_id = ? AND point_id = ?",
          [ownerUserId, patrolPointIdentity.assignmentId, patrolPointIdentity.pointId]
        );
        if (updateResult.changes === 0) {
          throw new Error("\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0442\u043e\u0447\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d; \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u043c.");
        }
      }
    })
  );

  void logMobileAction({
    eventType: "sync.conflict.server_wins",
    entityType: "outboxCommand",
    entityId: clientOperationId,
    message: "Локальное состояние заменено актуальным состоянием сервера.",
    payload: snapshot
  }).catch(() => undefined);
}

export async function retryOutboxConflictWithRevision(
  ownerUserId: string,
  clientOperationId: string,
  revision: number
) {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Сервер не вернул корректную ревизию для повторной отправки.");
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const nextClientOperationId = Crypto.randomUUID();

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const command = await tx.getFirstAsync<{
        status: string;
        command_type: string;
        entity_type: string;
        entity_local_id: string | null;
        entity_server_id: string | null;
        payload_json: string;
      }>(
        `
          SELECT status, command_type, entity_type, entity_local_id, entity_server_id, payload_json
          FROM outbox_commands
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
        `,
        [ownerUserId, currentContourId, clientOperationId]
      );

      if (!command || command.status !== "conflict") {
        throw new Error("Конфликт уже разрешён или недоступен для повторной отправки.");
      }
      if (command.command_type !== "completePatrolAssignment" || command.entity_type !== "patrolAssignment") {
        throw new Error("Для этой команды безопасный повтор с новой ревизией не поддерживается.");
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(command.payload_json) as Record<string, unknown>;
      } catch {
        throw new Error("Не удалось прочитать данные конфликтной команды.");
      }
      if (typeof payload.assignmentId !== "string" || payload.assignmentId !== command.entity_local_id) {
        throw new Error("В конфликтной команде отсутствует корректное назначение.");
      }

      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = 'superseded', last_error = NULL, next_attempt_at = NULL,
              last_attempt_at = NULL, updated_at_local = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND status = 'conflict'
        `,
        [now, ownerUserId, currentContourId, clientOperationId]
      );
      await insertOutboxCommandInTransaction(tx, {
        clientOperationId: nextClientOperationId,
        ownerUserId,
        contourId: currentContourId,
        commandType: command.command_type as OutboxCommandType,
        entityType: command.entity_type as MobileEntityType,
        entityLocalId: command.entity_local_id,
        entityServerId: command.entity_server_id,
        payload: { ...payload, baseRevision: revision },
        createdAtLocal: now,
        attemptCount: 0,
        status: "pending"
      });
      await tx.runAsync(
        `
          UPDATE sync_conflicts
          SET status = 'resolved', resolution_status = 'retryRequested', resolved_at = ?,
              resolution_reason = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
            AND status NOT IN ('resolved', 'dismissed')
        `,
        [now, "Повторная отправка создана с актуальной ревизией сервера.", ownerUserId, currentContourId, clientOperationId]
      );
      await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET status = 'completedLocal'
          WHERE owner_user_id = ? AND assignment_id = ?
            AND status IN ('needsDispatcherDecision', 'syncError', 'inProgress')
        `,
        [ownerUserId, command.entity_local_id]
      );
    })
  );

  requestSyncAfterMutation();
  void logMobileAction({
    eventType: "sync.conflict.retry_requested",
    entityType: "outboxCommand",
    entityId: nextClientOperationId,
    message: "Конфликтная команда поставлена на повторную отправку с актуальной ревизией.",
    payload: { previousClientOperationId: clientOperationId, revision }
  }).catch(() => undefined);

  return nextClientOperationId;
}
export async function cancelRejectedOutboxCommand(ownerUserId: string, clientOperationId: string, reason: string) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const transition = applyRejectedCancellationTransition();

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const command = await tx.getFirstAsync<{
        status: string;
        command_type: string;
        entity_type: string;
        entity_local_id: string | null;
        payload_json: string;
      }>(
        `
          SELECT status, command_type, entity_type, entity_local_id, payload_json
          FROM outbox_commands
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
        `,
        [ownerUserId, currentContourId, clientOperationId]
      );
      if (!command || command.status !== "rejected") {
        throw new Error("Отменить можно только отклонённую локальную команду.");
      }

      const patrolAssignmentIdentity = resolvePatrolAssignmentIdentity({
        commandType: command.command_type,
        entityType: command.entity_type,
        entityLocalId: command.entity_local_id,
        payload: command.payload_json
      });
      const assignmentId = patrolAssignmentIdentity ?? extractAssignmentId(command.payload_json);

      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = ?, last_error = ?, next_attempt_at = NULL, last_attempt_at = NULL, updated_at_local = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND status = 'rejected'
        `,
        [transition.commandStatus, reason, now, ownerUserId, currentContourId, clientOperationId]
      );
      await tx.runAsync(
        `
          UPDATE sync_conflicts
          SET status = ?, resolution_status = ?, resolved_at = ?, resolution_reason = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
            AND status NOT IN ('resolved', 'dismissed')
        `,
        [transition.conflictStatus, transition.resolutionStatus, now, reason, ownerUserId, currentContourId, clientOperationId]
      );
      if (patrolAssignmentIdentity && (command.command_type === "acceptPatrolRequest" || command.command_type === "takePatrolRequest")) {
        await finalizeCancelledAssignmentInTransaction(tx, ownerUserId, patrolAssignmentIdentity);
        await tx.runAsync(
          `UPDATE outbox_commands SET status = ?, updated_at_local = ?, last_error = ? WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
          ["cancelledLocal", now, reason, ownerUserId, currentContourId, clientOperationId]
        );
        await tx.runAsync(
          `UPDATE sync_conflicts SET status = ?, resolution_status = ?, resolved_at = ?, resolution_reason = ? WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
          ["resolved", "cancelledLocal", now, reason, ownerUserId, currentContourId, clientOperationId]
        );
      } else if (patrolAssignmentIdentity) {
        const restoredStatus = command.command_type === "releasePatrolRequest" || command.command_type === "acceptPatrolRequest"
          ? "accepted"
          : "inProgress";
        const statusToRestore = command.command_type === "resumePatrolAssignment"
          ? "paused"
          : command.command_type === "startPatrolAssignment"
            ? "accepted"
            : restoredStatus;
        const assignmentUpdate = await tx.runAsync(
          `
            UPDATE patrol_assignments
            SET status = ?, completed_at_local = CASE WHEN ? = 'inProgress' THEN NULL ELSE completed_at_local END
            WHERE owner_user_id = ? AND assignment_id = ?
              AND status IN ('syncError', 'completedLocal', 'needsDispatcherDecision', 'accepted', 'inProgress', 'paused')
          `,
          [statusToRestore, statusToRestore, ownerUserId, patrolAssignmentIdentity]
        );
        if (assignmentUpdate.changes !== 1) {
          throw new Error("\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e; \u043e\u0442\u043c\u0435\u043d\u0430 \u043a\u043e\u043c\u0430\u043d\u0434\u044b \u043d\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0430.");
        }
        await tx.runAsync(
          `
            UPDATE patrol_request_board
            SET status = ?
            WHERE owner_user_id = ? AND request_id = (
              SELECT request_id FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ? LIMIT 1
            )
          `,
          [statusToRestore, ownerUserId, ownerUserId, patrolAssignmentIdentity]
        );
      } else if (command.entity_type === "workTask" && command.entity_local_id) {
        await tx.runAsync(
          `UPDATE work_tasks SET sync_status = 'cancelled' WHERE owner_user_id = ? AND task_id = ?`,
          [ownerUserId, command.entity_local_id]
        );
      } else if (command.entity_type === "shiftRemark" && command.entity_local_id) {
        await tx.runAsync(
          `UPDATE shift_remarks SET sync_status = 'cancelled' WHERE owner_user_id = ? AND remark_id = ?`,
          [ownerUserId, command.entity_local_id]
        );
      } else if (command.entity_type === "patrolPoint" && command.entity_local_id) {
        await tx.runAsync(
          `UPDATE point_results SET sync_status = 'cancelled' WHERE owner_user_id = ? AND (local_result_id = ? OR (assignment_id = ? AND point_id = ?))`,
          [ownerUserId, command.entity_local_id, assignmentId, command.entity_local_id]
        );
      }
    })
  );

  void logMobileAction({
    eventType: "sync.rejected.cancelled",
    entityType: "outboxCommand",
    entityId: clientOperationId,
    message: reason
  }).catch(() => undefined);
}
