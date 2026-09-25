import * as SQLite from "expo-sqlite";

import { currentContourId } from "@/core/environments";
import { OutboxCommand } from "@/domain/sync/syncTypes";
import { applyWorkTaskServerRevision } from "@/domain/emu/workTaskRevisionPolicy";
import { getCommandAggregateKey } from "@/sync/outboxOrderingPolicy";

export type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

function readDependencies(payload: Record<string, unknown>) {
  return Array.isArray(payload.dependencies)
    ? payload.dependencies.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function mergeDependencies(payload: Record<string, unknown>, additions: string[], selfId: string) {
  const existing = readDependencies(payload);
  if (existing.includes(selfId) || additions.includes(selfId)) {
    throw new Error("Команда не может зависеть от самой себя.");
  }
  const merged = [...new Set([...existing, ...additions])];
  payload.dependencies = merged;
  return merged;
}

async function assertNoDependencyCycle(executor: SqlExecutor, ownerUserId: string, contourId: string, operationId: string, dependencies: string[]) {
  if (dependencies.includes(operationId)) throw new Error("Команда не может зависеть от самой себя.");
  // The common path has no dependency at all.  Do not scan a field device's
  // entire outbox just to prove that an empty graph has no cycle.
  if (dependencies.length === 0) return;

  const graph = new Map<string, string[]>();
  const pending = [...new Set(dependencies)];
  const seen = new Set<string>();
  // Fetch only the part of the graph reachable from the new operation. This
  // keeps a long, unrelated history out of the point-saving hot path.
  while (pending.length > 0) {
    const batch = pending.splice(0, 100).filter(id => !seen.has(id));
    if (batch.length === 0) continue;
    batch.forEach(id => seen.add(id));
    const placeholders = batch.map(() => "?").join(", ");
    const rows = await executor.getAllAsync<{ id: string; payloadJson: string }>(
      `SELECT client_operation_id AS id, payload_json AS payloadJson
         FROM outbox_commands
        WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id IN (${placeholders})`,
      [ownerUserId, contourId, ...batch]
    );
    for (const row of rows) {
      let rowDependencies: string[];
      try {
        const parsed = JSON.parse(row.payloadJson) as Record<string, unknown>;
        if (!Array.isArray(parsed.dependencies)) {
          rowDependencies = [];
        } else {
          if (parsed.dependencies.some((dependency) => typeof dependency !== "string" || dependency.trim().length === 0)) {
            throw new Error(`Не удалось проверить зависимости команды ${row.id}: повреждённые зависимости.`);
          }
          rowDependencies = parsed.dependencies;
        }
      } catch (error) {
        // A malformed dependency graph must be repaired explicitly. Treating
        // it as empty could release an operation out of order.
        if (error instanceof Error && error.message.includes("повреждённые зависимости")) {
          throw error;
        }
        throw new Error(`Не удалось проверить зависимости команды ${row.id}.`);
      }
      graph.set(row.id, rowDependencies);
      rowDependencies.filter(id => !seen.has(id)).forEach(id => pending.push(id));
    }
  }
  graph.set(operationId, dependencies);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) if (graph.has(dependency) && visit(dependency)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  if (visit(operationId)) throw new Error("Зависимости очереди образуют цикл.");
}

export async function insertOutboxCommandInTransaction(executor: SqlExecutor, command: OutboxCommand) {
  const contourId = command.contourId ?? currentContourId;
  const aggregateKey = command.aggregateKey ?? getCommandAggregateKey(command) ?? `operation:${command.clientOperationId}`;
  // A switch belongs to two patrols. Later commands must wait for its acknowledgement.
  const assignmentId = typeof command.payload.assignmentId === "string" ? command.payload.assignmentId : command.entityType === "patrolAssignment" ? command.entityLocalId : null;
  if (assignmentId && !command.bypassSwitchBarrier && command.commandType !== "switchPatrolAssignment" && command.commandType !== "createPatrolAppeal") {
    const barriers = await executor.getAllAsync<{ id: string }>(`SELECT client_operation_id AS id FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ? AND command_type = 'switchPatrolAssignment'
      AND status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal')
      AND (json_extract(payload_json, '$.assignmentId') = ? OR json_extract(payload_json, '$.sourceAssignmentId') = ?)`,
      [command.ownerUserId, contourId, assignmentId, assignmentId]);
    if (barriers.length) {
      const dependencies = mergeDependencies(command.payload, barriers.map((item) => item.id), command.clientOperationId);
      await assertNoDependencyCycle(executor, command.ownerUserId, contourId, command.clientOperationId, dependencies);
    } else {
      const dependencies = mergeDependencies(command.payload, [], command.clientOperationId);
      await assertNoDependencyCycle(executor, command.ownerUserId, contourId, command.clientOperationId, dependencies);
    }
  } else {
    const dependencies = mergeDependencies(command.payload, [], command.clientOperationId);
    await assertNoDependencyCycle(executor, command.ownerUserId, contourId, command.clientOperationId, dependencies);
  }
  const nextSequenceRow = await executor.getFirstAsync<{ nextSequence: number }>(
    "SELECT COALESCE(MAX(sequence_no), 0) + 1 AS nextSequence FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND aggregate_key IS ?",
    [command.ownerUserId, contourId, aggregateKey ?? null]
  );
  const sequenceNo = command.sequenceNo ?? nextSequenceRow?.nextSequence ?? 1;

  await executor.runAsync(
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
        aggregate_key,
        sequence_no,
        attempt_count,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      command.clientOperationId,
      command.ownerUserId,
      contourId,
      command.commandType,
      command.entityType,
      command.entityLocalId ?? null,
      command.entityServerId ?? null,
      JSON.stringify(command.payload),
      command.createdAtLocal,
      command.createdAtLocal,
      aggregateKey,
      sequenceNo,
      command.attemptCount,
      command.status
    ]
  );
}
export async function updatePendingCompleteReportBaseRevisionInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  baseRevision: number
) {
  const commands = await tx.getAllAsync<{
    client_operation_id: string;
    payload_json: string;
  }>(
    `
      SELECT client_operation_id, payload_json
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND command_type = 'completePatrolAssignment'
        AND entity_local_id = ?
        AND status IN ('pending', 'retryLater')
    `,
    [ownerUserId, currentContourId, assignmentId]
  );

  for (const command of commands) {
    try {
      const payload = JSON.parse(command.payload_json) as Record<string, unknown>;
      payload.baseRevision = baseRevision;
      await tx.runAsync(
        "UPDATE outbox_commands SET payload_json = ?, updated_at_local = ? WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?",
        [JSON.stringify(payload), new Date().toISOString(), ownerUserId, currentContourId, command.client_operation_id]
      );
    } catch {
      // The report command will be rejected by its normal payload validation;
      // never replace an unreadable payload with a partial one.
    }
  }
}

export async function updatePendingWorkTaskRevisionInTransaction(
  tx: SqlExecutor,
  ownerUserId: string,
  taskLocalId: string,
  serverRevision: number | null,
  serverEntityId: string | null
) {
  if (serverRevision === null && !serverEntityId) {
    return;
  }

  const rows = await tx.getAllAsync<{
    client_operation_id: string;
    command_type: OutboxCommand["commandType"];
    status: OutboxCommand["status"];
    entity_server_id: string | null;
    payload_json: string;
  }>(
    `
      SELECT client_operation_id, command_type, status, entity_server_id, payload_json
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND entity_type = 'workTask'
        AND entity_local_id = ?
        AND status IN ('pending', 'retryLater')
    `,
    [ownerUserId, currentContourId, taskLocalId]
  );

  const parsedCommands: {
    row: (typeof rows)[number];
    command: {
      commandType: OutboxCommand["commandType"];
      status: OutboxCommand["status"];
      entityServerId: string | null;
      payload: Record<string, unknown>;
    };
  }[] = [];
  for (const row of rows) {
    try {
      parsedCommands.push({
        row,
        command: {
          commandType: row.command_type,
          status: row.status,
          entityServerId: row.entity_server_id,
          payload: JSON.parse(row.payload_json) as Record<string, unknown>
        }
      });
    } catch {
      // Preserve malformed commands for their normal validation path.
    }
  }
  const updated = applyWorkTaskServerRevision(
    parsedCommands.map((item) => item.command),
    serverRevision,
    serverEntityId
  );
  const updatedAtLocal = new Date().toISOString();

  for (let index = 0; index < updated.length; index += 1) {
    const next = updated[index];
    const row = parsedCommands[index]?.row;
    if (!row || next === parsedCommands[index]?.command || next.payload === parsedCommands[index]?.command.payload) {
      continue;
    }
    await tx.runAsync(
      `
        UPDATE outbox_commands
        SET entity_server_id = COALESCE(?, entity_server_id),
            payload_json = ?,
            updated_at_local = ?
        WHERE owner_user_id = ?
          AND contour_id = ?
          AND client_operation_id = ?
          AND status IN ('pending', 'retryLater')
      `,
      [
        next.entityServerId,
        JSON.stringify(next.payload),
        updatedAtLocal,
        ownerUserId,
        currentContourId,
        row.client_operation_id
      ]
    );
  }
}
export async function updatePendingPatrolSwitchRevision(tx: SqlExecutor, owner: string, assignmentId: string, revision: number) {
  await tx.runAsync(`UPDATE outbox_commands SET payload_json = json_set(payload_json,
    CASE WHEN json_extract(payload_json, '$.assignmentId') = ? THEN '$.targetRevision' ELSE '$.sourceRevision' END, ?)
    WHERE owner_user_id = ? AND contour_id = ? AND command_type = 'switchPatrolAssignment'
      AND status IN ('pending', 'retryLater')
      AND (json_extract(payload_json, '$.assignmentId') = ? OR json_extract(payload_json, '$.sourceAssignmentId') = ?)`,
    [assignmentId, revision, owner, currentContourId, assignmentId, assignmentId]);
}
