import * as Crypto from "expo-crypto";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { updatePendingCompleteReportBaseRevisionInTransaction, updatePendingWorkTaskRevisionInTransaction } from "@/db/repositories/outboxSql";
import { finalizeCancelledAssignmentInTransaction } from "@/db/repositories/patrolCancellationRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandStatus, OutboxCommandType, OutboxResponse } from "@/domain/sync/syncTypes";
import { extractAssignmentId, extractCompletionFileIds, isCancelledCompletionResponse, isPatrolAssignmentCommand, isProblemResponse, parsePatrolPointConflictIdentity, resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";
import { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";
import { isOutboxCommandReady, resolveRetryDelaySeconds } from "@/sync/outboxRetryPolicy";
import { parseOutboxPayloadRows } from "@/sync/outboxPayloadParser";
import { applyRejectedCancellationTransition, applyServerWinsTransition, ConflictServerSnapshot } from "@/domain/sync/conflictResolutionPolicy";
import { getCommandAggregateKey } from "@/sync/outboxOrderingPolicy";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
import { getReleaseResponseResolution } from "@/domain/patrol/releaseResolutionPolicy";
import { getPointResultSyncUpdate } from "@/domain/patrol/pointResultSyncPolicy";

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
  attempt_count: number;
  status: string;
};

export async function insertOutboxCommand(command: OutboxCommand) {
  const db = await getDatabase();

  await withSqliteBusyRetry(() => db.runAsync(
    `
      INSERT INTO outbox_commands (
        client_operation_id,
        owner_user_id,
        contour_id,
        command_type,
        entity_type,
        entity_local_id,
        entity_server_id,
        payload_json,
        created_at_local,
        updated_at_local,
        attempt_count,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      command.clientOperationId,
      command.ownerUserId,
      command.contourId ?? currentContourId,
      command.commandType,
      command.entityType,
      command.entityLocalId ?? null,
      command.entityServerId ?? null,
      JSON.stringify(command.payload),
      command.createdAtLocal,
      command.createdAtLocal,
      command.attemptCount,
      command.status
    ]
  ));
}

export async function listPendingOutboxCommands(ownerUserId: string, limit = 25) {
  const db = await getDatabase();
  const nowIso = new Date().toISOString();
  const readyRows = await db.getAllAsync<OutboxDatabaseRow>(
    `
      SELECT *
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND (
          status = 'pending'
          OR (
            status = 'retryLater'
            AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
          )
        )
      ORDER BY created_at_local ASC
      LIMIT ?
    `,
    [ownerUserId, currentContourId, nowIso, Math.max(limit * 4, 100)]
  );

  // Non-ready commands still need to be visible to the aggregate FIFO check.
  // They are loaded separately so old conflicts cannot hide ready independent commands.
  const blockerRows = await db.getAllAsync<OutboxDatabaseRow>(
    `
      SELECT *
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND (
          status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'pending', 'retryLater')
          OR (
            status = 'retryLater'
            AND (next_attempt_at IS NULL OR next_attempt_at > ?)
          )
        )
      ORDER BY created_at_local ASC
    `,
    [ownerUserId, currentContourId, nowIso]
  );

  const rowsByOperationId = new Map<string, OutboxDatabaseRow>();
  [...readyRows, ...blockerRows].forEach((row) => rowsByOperationId.set(row.client_operation_id, row));
  const rows = [...rowsByOperationId.values()].sort((left, right) => left.created_at_local.localeCompare(right.created_at_local));

  const invalidPayloadOperationIds = new Set<string>();
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
      nextAttemptAt: row.next_attempt_at
    }),
    async (row, reason) => {
      invalidPayloadOperationIds.add(row.client_operation_id);
      await withSqliteBusyRetry(() => db.runAsync(
        "UPDATE outbox_commands SET status = 'invalidPayload', last_error = ?, updated_at_local = ? WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
        [`Некорректный JSON payload: ${reason}`, new Date().toISOString(), ownerUserId, currentContourId, row.client_operation_id]
      ));
    }
  );
  const commandsForOrdering: OutboxCommand[] = [
    ...commands,
    ...rows
      .filter((row) => invalidPayloadOperationIds.has(row.client_operation_id))
      .map((row) => ({
        clientOperationId: row.client_operation_id,
        ownerUserId: row.owner_user_id,
        contourId: row.contour_id,
        commandType: row.command_type as OutboxCommandType,
        entityType: row.entity_type as MobileEntityType,
        entityLocalId: row.entity_local_id,
        entityServerId: row.entity_server_id,
        payload: {},
        createdAtLocal: row.created_at_local,
        attemptCount: row.attempt_count,
        status: "invalidPayload" as const
      }))
  ];
  const terminalStatuses = new Set<OutboxCommandStatus>(["accepted", "duplicate", "superseded", "cancelled"]);
  const readyCandidates = commands.filter((command) => isOutboxCommandReady(command, new Date().toISOString()));

  return readyCandidates
    .filter((candidate) => {
      const aggregateId = getCommandAggregateKey(candidate);
      if (!aggregateId) {
        return true;
      }
      return !commandsForOrdering.some((previous) =>
        previous.createdAtLocal < candidate.createdAtLocal
        && getCommandAggregateKey(previous) === aggregateId
        && !terminalStatuses.has(previous.status)
      );
    })
    .slice(0, limit)
    .map(({ nextAttemptAt: _nextAttemptAt, ...command }) => command);
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
        assignment.route_name AS assignment_route_name,
        (SELECT resolution_status FROM sync_conflicts conflict WHERE conflict.owner_user_id = command.owner_user_id AND conflict.contour_id = command.contour_id AND conflict.client_operation_id = command.client_operation_id ORDER BY conflict.rowid DESC LIMIT 1) AS resolution_status
      FROM outbox_commands command
      LEFT JOIN patrol_assignments assignment
        ON assignment.assignment_id = command.entity_local_id
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
  retryAfterSeconds?: number | null
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
              next_attempt_at = ?,
              updated_at_local = ?
          WHERE owner_user_id = ?
                AND contour_id = ?
            AND client_operation_id = ?
            AND status = 'sending'
        `,
        [lastError ?? null, nextAttemptAt, updatedAtLocal, ownerUserId, currentContourId, row.client_operation_id]
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
export async function markPendingOutboxCommandsRetryLater(ownerUserId: string, lastError: string) {
  const db = await getDatabase();

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const rows = await tx.getAllAsync<{
        client_operation_id: string;
        attempt_count: number;
        next_attempt_at: string | null;
      }>(
        "SELECT client_operation_id, attempt_count, next_attempt_at " +
        "FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? " +
        "AND status IN ('pending', 'sending', 'retryLater')",
        [ownerUserId, currentContourId]
      );
      const nowMs = Date.now();
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
          "UPDATE outbox_commands SET status = 'retryLater', last_error = ?, next_attempt_at = ?, updated_at_local = ? " +
          "WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
          [lastError, nextAttemptAt, updatedAtLocal, ownerUserId, currentContourId, row.client_operation_id]
        );
      }
    })
  );
}
export async function markPendingOutboxCommandsWaitingNetwork(ownerUserId: string, lastError: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'waiting_network', last_error = ?, next_attempt_at = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status IN ('pending', 'sending', 'retryLater', 'waiting_network')",
    [lastError, updatedAtLocal, ownerUserId, currentContourId]
  ));
}

export async function activateWaitingNetworkOutboxCommands(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'pending', next_attempt_at = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status = 'waiting_network'",
    [updatedAtLocal, ownerUserId, currentContourId]
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
          updated_at_local = ?
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status IN ('retryLater', 'waiting_network')
    `,
    [updatedAtLocal, ownerUserId, currentContourId]
  ));
}

export async function markPendingOutboxCommandsAuthRequired(ownerUserId: string, lastError: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  // Authentication is a delivery condition, not a patrol lifecycle state.
  // Keep the local report and defer automatic retries until the session is restored.
  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'waiting_auth',
          last_error = ?,
          next_attempt_at = NULL,
          updated_at_local = ?
      WHERE owner_user_id = ?
                AND contour_id = ?
        AND status IN ('pending', 'sending', 'retryLater', 'waiting_auth')
    `,
    [lastError, updatedAtLocal, ownerUserId, currentContourId]
  ));
}
export async function activateWaitingAuthOutboxCommands(ownerUserId: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'pending', next_attempt_at = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND status = 'waiting_auth'",
    [updatedAtLocal, ownerUserId, currentContourId]
  ));
}

export async function markOutboxCommandsWrongContour(ownerUserId: string, clientOperationIds: string[], lastError: string) {
  if (clientOperationIds.length === 0) {
    return;
  }
  const db = await getDatabase();
  const placeholders = clientOperationIds.map(() => "?").join(", ");
  const updatedAtLocal = new Date().toISOString();
  await withSqliteBusyRetry(() => db.runAsync(
    "UPDATE outbox_commands SET status = 'wrong_contour', last_error = ?, next_attempt_at = NULL, updated_at_local = ? " +
    "WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id IN (" + placeholders + ")",
    [lastError, updatedAtLocal, ownerUserId, currentContourId, ...clientOperationIds]
  ));
}
export async function resetStaleSendingOutboxCommands(ownerUserId: string, staleBeforeIso: string) {
  const db = await getDatabase();
  const updatedAtLocal = new Date().toISOString();

  await withSqliteBusyRetry(() => db.runAsync(
    `
      UPDATE outbox_commands
      SET status = 'retryLater',
          next_attempt_at = ?,
          last_error = COALESCE(last_error, 'Отправка прервана и будет повторена автоматически.'),
          updated_at_local = ?
      WHERE owner_user_id = ?
                AND contour_id = ?
        AND status = 'sending'
        AND (updated_at_local IS NULL OR updated_at_local < ?)
    `,
    [updatedAtLocal, updatedAtLocal, ownerUserId, currentContourId, staleBeforeIso]
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
      const updatedAtLocal = new Date().toISOString();
      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = ?,
              entity_server_id = COALESCE(?, entity_server_id),
              next_attempt_at = ?,
              last_attempt_at = ${isSuccessful ? "NULL" : "last_attempt_at"},
              last_error = ?,
              updated_at_local = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
        `,
        [
          response.status,
          response.serverEntityId,
          nextAttemptAt,
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
              WHERE request_id = (
                SELECT request_id
                FROM patrol_assignments
                WHERE owner_user_id = ? AND assignment_id = ?
                LIMIT 1
                )
            `,
            [requestStatus, command.owner_user_id, command.entity_local_id]
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
          const nextStatus =
            command.command_type === "pausePatrolAssignment"
              ? "paused"
              : command.command_type === "handoffPatrolAssignment"
                ? "needsDispatcherDecision"
                : command.command_type === "acceptPatrolRequest"
                  ? "accepted"
                  : "inProgress";

          await tx.runAsync(
            `
              UPDATE patrol_assignments
              SET status = ?,
                  revision = COALESCE(?, revision)
              WHERE owner_user_id = ? AND assignment_id = ?
            `,
            [nextStatus, response.serverRevision, command.owner_user_id, command.entity_local_id]
          );
          await tx.runAsync(
            `
              UPDATE patrol_request_board
              SET status = ?
              WHERE request_id = (
                SELECT request_id
                FROM patrol_assignments
                WHERE owner_user_id = ? AND assignment_id = ?
                LIMIT 1
              )
            `,
            [nextStatus, command.owner_user_id, command.entity_local_id]
          );

          if (response.serverRevision !== null) {
            await updatePendingCompleteReportBaseRevisionInTransaction(
              tx,
              command.owner_user_id,
              command.entity_local_id,
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

      const nextPayload = JSON.stringify({ ...payload, baseRevision: revision });
      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET status = 'superseded', last_error = NULL, next_attempt_at = NULL,
              last_attempt_at = NULL, updated_at_local = ?
          WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND status = 'conflict'
        `,
        [now, ownerUserId, currentContourId, clientOperationId]
      );
      await tx.runAsync(
        `
          INSERT INTO outbox_commands (
            client_operation_id, owner_user_id, contour_id, command_type, entity_type,
            entity_local_id, entity_server_id, payload_json, created_at_local,
            updated_at_local, attempt_count, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')
        `,
        [
          nextClientOperationId,
          ownerUserId,
          currentContourId,
          command.command_type,
          command.entity_type,
          command.entity_local_id,
          command.entity_server_id,
          nextPayload,
          now,
          now
        ]
      );
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
