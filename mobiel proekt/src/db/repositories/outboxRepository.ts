import type { OutboxRetryReason } from './outboxTypes';
import { resolveRecoverableOutboxConflict } from './outboxResponseRepository';
import { countPendingOutboxCommands } from './outboxReadRepository';
import * as Crypto from "expo-crypto";

import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";
import { finalizeCancelledAssignmentInTransaction } from "@/db/repositories/patrolCancellationRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandStatus, OutboxCommandType } from "@/domain/sync/syncTypes";

import { extractAssignmentId, isPatrolAssignmentCommand, parsePatrolPointConflictIdentity, resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";
import { resolveRetryDelaySeconds, resolveServerUnreachableDelaySeconds } from "@/sync/outboxRetryPolicy";
import { parseOutboxPayloadRows } from "@/sync/outboxPayloadParser";
import { applyRejectedCancellationTransition, applyServerWinsTransition, ConflictServerSnapshot } from "@/domain/sync/conflictResolutionPolicy";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";

import { validatePatrolCompletionPayload } from "@/domain/patrol/completionPayloadPolicy";

import { outboxAcknowledgementBarriersSql } from "./outboxEligibilitySql";
export { applyOutboxResponses } from './outboxResponseRepository';
export { getOutboxCommandEntityLocalId, listSyncQueueCommands, getReportDeliveryStates, getReportDeliveryState, getCompleteReportDeliveryState, getOutboxCommandDeliveryState, countPendingOutboxCommands, countOutboxDeliveryProblems, countRetryableOutboxCommands, getNextOutboxRetryAt } from './outboxReadRepository';

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
        -- Redundant with the OR below; lets SQLite use ix_outbox_commands_dispatchable.
        AND candidate.status IN ('pending', 'retryLater')
        AND (
          candidate.status = 'pending'
          OR (
            candidate.status = 'retryLater'
            AND (candidate.next_attempt_at IS NULL OR candidate.next_attempt_at <= ?)
          )
        )
        ${aggregateFilter}
        ${outboxAcknowledgementBarriersSql}
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
export type { OutboxRetryReason } from "./outboxTypes";

export async function markReportDeliveryDiagnosticIfDue(
  ownerUserId: string,
  clientOperationId: string,
  now = new Date()
) {
  const db = await getDatabase();
  const nowIso = now.toISOString();
  const cooldownBoundary = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const result = await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET diagnostic_last_created_at = ?, updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND client_operation_id = ?
        AND command_type = 'completePatrolAssignment'
        AND attempt_count >= 3
        AND (
          diagnostic_last_created_at IS NULL
          OR diagnostic_last_created_at <= ?
        )
    `,
    [nowIso, nowIso, ownerUserId, currentContourId, clientOperationId, cooldownBoundary]
  ));

  return result.changes === 1;
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
              SET status = 'inProgress'
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

export async function markOutboxCommandsSending(ownerUserId: string, clientOperationIds: string[], expectedPayload?: Record<string, unknown>) {
  if (clientOperationIds.length === 0) {
    return 0;
  }

  const db = await getDatabase();
  if (expectedPayload && clientOperationIds.length !== 1) {
    throw new Error("Проверка содержимого требует одну команду.");
  }
  let persistedPayload: string | null = null;
  if (expectedPayload) {
    const row = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload_json AS payload FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
      [ownerUserId, currentContourId, clientOperationIds[0]]
    );
    try {
      if (!row || JSON.stringify(JSON.parse(row.payload)) !== JSON.stringify(expectedPayload)) return 0;
      persistedPayload = row.payload;
    } catch {
      return 0;
    }
  }
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  const updatedAtLocal = new Date().toISOString();
  const result = await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands AS candidate
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
        ${expectedPayload ? "AND payload_json = ?" : ""}
        ${outboxAcknowledgementBarriersSql}
    `,
    [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId, ...clientOperationIds,
      ...(expectedPayload ? [persistedPayload] : [])]
  ));
  return result.changes;
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
      const delaySeconds = resolveRetryDelaySeconds(retryAfterSeconds, row.attempt_count, retryReason);
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
        // No command was sent, so attempt_count does not grow. A failed health
        // check waits for the connection monitor instead of a tight loop.
        const delaySeconds = retryReason === "server"
          ? resolveServerUnreachableDelaySeconds()
          : resolveRetryDelaySeconds(null, row.attempt_count, retryReason);
        const computedNextAttemptMs = nowMs + delaySeconds * 1000;
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
/** Called once the server answered a health check: offline-parked commands can go now. */
export async function activateWaitingNetworkOutboxCommands(ownerUserId: string, aggregateKey?: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  const scope = getAggregateActivationScope(aggregateKey);
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'pending', next_attempt_at = NULL, retry_reason = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status = 'waiting_network'" + scope.filter,
    [updatedAtLocal, ownerUserId, currentContourId, ...scope.params]
  ));
}

/**
 * A new network route or a server that answers again is a fresh chance to
 * deliver: commands parked because the server was unreachable, slow, or failed
 * for a reason the client could not classify run now. Only a server-directed
 * Retry-After (rateLimit) keeps its delay; terminal rejections never reach here.
 */
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
          OR (status = 'retryLater' AND COALESCE(retry_reason, 'unknown') <> 'rateLimit')
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
          OR (status = 'retryLater' AND COALESCE(retry_reason, 'unknown') <> 'rateLimit')
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

export async function resetSendingOutboxCommandsForProcessRestart(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'retryLater', next_attempt_at = ?, retry_reason = 'unknown', " +
    "last_error = COALESCE(last_error, 'Sending resumed after application restart.'), last_attempt_at = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status = 'sending'",
    [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId]
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
                  completed_at_local = COALESCE(?, completed_at_local)
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
      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = 'completedLocal'
          WHERE owner_user_id = ?
            AND request_id = (
              SELECT request_id
              FROM patrol_assignments
              WHERE owner_user_id = ? AND assignment_id = ?
              LIMIT 1
            )
            AND status IN ('needsDispatcherDecision', 'syncError', 'inProgress')
        `,
        [ownerUserId, ownerUserId, command.entity_local_id]
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
            SET status = ?
            WHERE owner_user_id = ? AND assignment_id = ?
              AND status IN ('syncError', 'completedLocal', 'needsDispatcherDecision', 'accepted', 'inProgress', 'paused')
          `,
          [statusToRestore, ownerUserId, patrolAssignmentIdentity]
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

export async function listUnconfirmedCompleteReportCommands(
  ownerUserId: string,
  assignmentId?: string,
  limit = 24
) {
  const db = await getDatabase();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const assignmentFilter = assignmentId ? "AND entity_local_id = ?" : "";
  const nowIso = new Date().toISOString();
  const params = assignmentId ? [ownerUserId, currentContourId, nowIso, assignmentId] : [ownerUserId, currentContourId, nowIso];
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
        -- Only a report that reached the network can have a server receipt,
        -- and a scheduled retry is not checked again before its time.
        AND attempt_count > 0
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
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
