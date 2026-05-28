import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { WorkTaskDto } from "@/domain/emu/emuTypes";
import { OutboxCommand } from "@/domain/sync/syncTypes";

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "runAsync">;

type WorkTaskRow = {
  task_id: string;
  title: string;
  status: WorkTaskDto["status"];
  planned_at: string | null;
  revision: number;
  completed_at_local: string | null;
};

export async function saveWorkTasks(tasks: WorkTaskDto[]) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return;
  }

  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const pendingActions = await tx.getAllAsync<{
      task_id: string;
      command_type: string;
      completed_at_local: string | null;
    }>(
      `
        SELECT
          work_tasks.task_id,
          outbox_commands.command_type,
          work_tasks.completed_at_local
        FROM work_tasks
        INNER JOIN outbox_commands
          ON outbox_commands.entity_local_id = work_tasks.task_id
         AND outbox_commands.command_type IN ('pauseWorkTask', 'resumeWorkTask', 'completeWorkTask')
         AND outbox_commands.status IN ('pending', 'sending', 'retryLater')
        WHERE work_tasks.owner_user_id = ?
        ORDER BY outbox_commands.created_at_local ASC
      `,
      [ownerUserId]
    );
    const pendingByTaskId = new Map(pendingActions.map((item) => [item.task_id, item]));
    const serverTaskIds = tasks.map((task) => task.taskId);

    if (serverTaskIds.length > 0) {
      const placeholders = serverTaskIds.map(() => "?").join(", ");
      await tx.runAsync(
        `
          DELETE FROM work_tasks
          WHERE owner_user_id = ?
            AND task_id NOT IN (${placeholders})
            AND NOT EXISTS (
              SELECT 1
              FROM outbox_commands
              WHERE outbox_commands.entity_local_id = work_tasks.task_id
                AND outbox_commands.command_type IN ('pauseWorkTask', 'resumeWorkTask', 'completeWorkTask')
                AND outbox_commands.status IN ('pending', 'sending', 'retryLater')
            )
        `,
        [ownerUserId, ...serverTaskIds]
      );
    } else {
      await tx.runAsync(
        `
          DELETE FROM work_tasks
          WHERE owner_user_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM outbox_commands
              WHERE outbox_commands.entity_local_id = work_tasks.task_id
                AND outbox_commands.command_type IN ('pauseWorkTask', 'resumeWorkTask', 'completeWorkTask')
                AND outbox_commands.status IN ('pending', 'sending', 'retryLater')
            )
        `,
        [ownerUserId]
      );
    }

    for (const task of tasks) {
      const pendingAction = pendingByTaskId.get(task.taskId);
      await tx.runAsync(
        `
          INSERT INTO work_tasks (
            task_id,
            owner_user_id,
            title,
            status,
            planned_at,
            revision,
          completed_at_local
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            title = excluded.title,
            status = excluded.status,
            planned_at = excluded.planned_at,
            revision = excluded.revision,
            completed_at_local = excluded.completed_at_local
        `,
        [
          task.taskId,
          ownerUserId,
          task.title,
          pendingAction ? statusForPendingAction(pendingAction.command_type) : task.status,
          task.plannedAt,
          task.revision,
          pendingAction?.completed_at_local ?? task.completedAtLocal
        ]
      );
    }
  });
}

export async function listLocalWorkTasks() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<WorkTaskRow>(
    `
      SELECT
        task_id,
        title,
        status,
        planned_at,
        revision,
        completed_at_local
      FROM work_tasks
      WHERE owner_user_id = ?
      ORDER BY planned_at DESC, title ASC
    `,
    [ownerUserId]
  );

  return rows.map(mapWorkTaskRow);
}

export async function pauseWorkTaskLocally(task: WorkTaskDto, comment: string) {
  const ownerUserId = await requireOwnerUserId();
  const pausedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  const command = createWorkTaskOutboxCommand({
    ownerUserId,
    commandType: "pauseWorkTask",
    payload: {
      taskId: task.taskId,
      baseRevision: task.revision,
      pausedAtLocal,
      comment: comment.trim()
    },
    taskId: task.taskId,
    createdAtLocal: pausedAtLocal
  });

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `
        UPDATE work_tasks
        SET status = 'paused'
        WHERE task_id = ?
          AND owner_user_id = ?
      `,
      [task.taskId, ownerUserId]
    );

    await insertOutboxCommandInTransaction(tx, command);
  });
}

export async function resumeWorkTaskLocally(task: WorkTaskDto, comment: string) {
  const ownerUserId = await requireOwnerUserId();
  const resumedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  const command = createWorkTaskOutboxCommand({
    ownerUserId,
    commandType: "resumeWorkTask",
    payload: {
      taskId: task.taskId,
      baseRevision: task.revision,
      resumedAtLocal,
      comment: comment.trim()
    },
    taskId: task.taskId,
    createdAtLocal: resumedAtLocal
  });

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `
        UPDATE work_tasks
        SET status = 'inProgress'
        WHERE task_id = ?
          AND owner_user_id = ?
      `,
      [task.taskId, ownerUserId]
    );

    await insertOutboxCommandInTransaction(tx, command);
  });
}

export async function completeWorkTaskLocally(task: WorkTaskDto, resultComment: string) {
  const ownerUserId = await requireOwnerUserId();

  const comment = resultComment.trim();
  if (!comment) {
    throw new Error("Result comment is required.");
  }

  const completedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  const command = createWorkTaskOutboxCommand({
    ownerUserId,
    commandType: "completeWorkTask",
    payload: {
      taskId: task.taskId,
      baseRevision: task.revision,
      completedAtLocal,
      resultStatus: "completed",
      resultComment: comment
    },
    taskId: task.taskId,
    createdAtLocal: completedAtLocal
  });

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `
        UPDATE work_tasks
        SET status = 'completedLocal',
            completed_at_local = ?
        WHERE task_id = ?
          AND owner_user_id = ?
      `,
      [completedAtLocal, task.taskId, ownerUserId]
    );

    await insertOutboxCommandInTransaction(tx, command);
  });
}

async function requireOwnerUserId() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Owner user is not available.");
  }

  return ownerUserId;
}

function statusForPendingAction(commandType: string): WorkTaskDto["status"] {
  if (commandType === "completeWorkTask") {
    return "completedLocal";
  }

  return commandType === "pauseWorkTask" ? "paused" : "inProgress";
}

function createWorkTaskOutboxCommand({
  ownerUserId,
  commandType,
  payload,
  taskId,
  createdAtLocal
}: {
  ownerUserId: string;
  commandType: "pauseWorkTask" | "resumeWorkTask" | "completeWorkTask";
  payload: Record<string, unknown>;
  taskId: string;
  createdAtLocal: string;
}): OutboxCommand {
  return {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType,
    entityType: "workTask",
    entityLocalId: taskId,
    entityServerId: taskId,
    payload,
    createdAtLocal,
    attemptCount: 0,
    status: "pending"
  };
}

async function insertOutboxCommandInTransaction(executor: SqlExecutor, command: OutboxCommand) {
  await executor.runAsync(
    `
      INSERT INTO outbox_commands (
        client_operation_id,
        owner_user_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      command.clientOperationId,
      command.ownerUserId,
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
  );
}

function mapWorkTaskRow(row: WorkTaskRow): WorkTaskDto {
  return {
    taskId: row.task_id,
    title: row.title,
    status: row.status,
    plannedAt: row.planned_at,
    revision: row.revision,
    completedAtLocal: row.completed_at_local
  };
}
