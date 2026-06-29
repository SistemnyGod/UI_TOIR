import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import { OutboxCommand } from "@/domain/sync/syncTypes";

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;

type WorkTaskRow = {
  task_id: string;
  title: string;
  status: WorkTaskDto["status"];
  planned_at: string | null;
  revision: number;
  completed_at_local: string | null;
  section_id: string | null;
  section_name: string | null;
  employee_id: string | null;
  employee_name: string | null;
  created_at_local: string | null;
  sync_status: string;
};

export type CreateWorkTaskInput = {
  employeeId: string;
  employeeName: string;
  sectionId: string;
  sectionName: string;
  taskDescription: string;
};

export type UpdateWorkTaskInput = {
  task: WorkTaskDto;
  sectionId: string;
  sectionName: string;
  taskDescription: string;
};

export async function saveWorkTasks(tasks: WorkTaskDto[]) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return;
  }

  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
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
         AND outbox_commands.command_type IN ('createWorkTask', 'updateWorkTask', 'pauseWorkTask', 'resumeWorkTask', 'completeWorkTask')
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
                AND outbox_commands.command_type IN ('createWorkTask', 'updateWorkTask', 'pauseWorkTask', 'resumeWorkTask', 'completeWorkTask')
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
                AND outbox_commands.command_type IN ('createWorkTask', 'updateWorkTask', 'pauseWorkTask', 'resumeWorkTask', 'completeWorkTask')
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
            completed_at_local,
            section_id,
            section_name,
            employee_id,
            employee_name,
            created_at_local,
            sync_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            title = excluded.title,
            status = excluded.status,
            planned_at = excluded.planned_at,
            revision = excluded.revision,
            completed_at_local = excluded.completed_at_local,
            section_id = excluded.section_id,
            section_name = excluded.section_name,
            employee_id = excluded.employee_id,
            employee_name = excluded.employee_name,
            created_at_local = excluded.created_at_local,
            sync_status = excluded.sync_status
        `,
        [
          task.taskId,
          ownerUserId,
          task.title,
          pendingAction ? statusForPendingAction(pendingAction.command_type) : task.status,
          task.plannedAt,
          task.revision,
          pendingAction?.completed_at_local ?? task.completedAtLocal,
          task.sectionId,
          task.sectionName,
          task.employeeId,
          task.employeeName,
          task.createdAtLocal,
          pendingAction ? "pending" : (task.syncStatus ?? "synced")
        ]
      );
    }
    })
  );
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
        completed_at_local,
        section_id,
        section_name,
        employee_id,
        employee_name,
        created_at_local,
        sync_status
      FROM work_tasks
      WHERE owner_user_id = ?
      ORDER BY created_at_local DESC, planned_at DESC, title ASC
    `,
    [ownerUserId]
  );

  return rows.map(mapWorkTaskRow);
}

export async function listMobileEmployees() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const db = await getDatabase();
  return db.getAllAsync<MobileEmployeeDto>(
    `
      SELECT
        employee_id AS employeeId,
        full_name AS fullName,
        position,
        department
      FROM mobile_employees
      WHERE owner_user_id = ?
      ORDER BY full_name ASC
    `,
    [ownerUserId]
  );
}

export async function listEmuSections() {
  const db = await getDatabase();
  return db.getAllAsync<MobileEmuSectionDto>(
    `
      SELECT
        section_id AS sectionId,
        name,
        sort_order AS sortOrder
      FROM emu_sections
      ORDER BY sort_order ASC, name ASC
    `
  );
}

export async function createWorkTaskLocally(input: CreateWorkTaskInput) {
  const ownerUserId = await requireOwnerUserId();
  const taskId = Crypto.randomUUID();
  const createdAtLocal = new Date().toISOString();
  const title = input.taskDescription.trim();
  if (!title) {
    throw new Error("Заполните задачу.");
  }

  const db = await getDatabase();
  const command = createWorkTaskOutboxCommand({
    ownerUserId,
    commandType: "createWorkTask",
    payload: {
      taskId,
      employeeId: input.employeeId,
      sectionId: input.sectionId,
      taskDescription: title,
      createdAtLocal
    },
    taskId,
    createdAtLocal
  });

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `
          INSERT INTO work_tasks (
            task_id,
            owner_user_id,
            title,
            status,
            planned_at,
            revision,
            completed_at_local,
            section_id,
            section_name,
            employee_id,
            employee_name,
            created_at_local,
            sync_status
          )
          VALUES (?, ?, ?, 'inProgress', ?, 0, NULL, ?, ?, ?, ?, ?, 'pending')
        `,
        [
          taskId,
          ownerUserId,
          title,
          createdAtLocal,
          input.sectionId,
          input.sectionName,
          input.employeeId,
          input.employeeName,
          createdAtLocal
        ]
      );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );
}

export async function updateWorkTaskLocally(input: UpdateWorkTaskInput) {
  const ownerUserId = await requireOwnerUserId();
  const updatedAtLocal = new Date().toISOString();
  const title = input.taskDescription.trim();
  if (!title) {
    throw new Error("Заполните задачу.");
  }

  const db = await getDatabase();
  const command = createWorkTaskOutboxCommand({
    ownerUserId,
    commandType: "updateWorkTask",
    payload: {
      taskId: input.task.taskId,
      sectionId: input.sectionId,
      taskDescription: title,
      baseRevision: input.task.revision,
      updatedAtLocal
    },
    taskId: input.task.taskId,
    createdAtLocal: updatedAtLocal
  });

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `
          UPDATE work_tasks
          SET title = ?,
              section_id = ?,
              section_name = ?,
              sync_status = 'pending'
          WHERE task_id = ?
            AND owner_user_id = ?
        `,
        [title, input.sectionId, input.sectionName, input.task.taskId, ownerUserId]
      );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );
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

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `
        UPDATE work_tasks
        SET status = 'paused',
            sync_status = 'pending'
        WHERE task_id = ?
          AND owner_user_id = ?
      `,
      [task.taskId, ownerUserId]
    );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );
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

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `
        UPDATE work_tasks
        SET status = 'inProgress',
            sync_status = 'pending'
        WHERE task_id = ?
          AND owner_user_id = ?
      `,
      [task.taskId, ownerUserId]
    );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );
}

export async function completeWorkTaskLocally(task: WorkTaskDto, resultComment: string) {
  const ownerUserId = await requireOwnerUserId();

  const comment = resultComment.trim();
  if (!comment) {
    throw new Error("Заполните комментарий для завершения работы.");
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

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `
        UPDATE work_tasks
        SET status = 'completedLocal',
            completed_at_local = ?,
            sync_status = 'pending'
        WHERE task_id = ?
          AND owner_user_id = ?
      `,
      [completedAtLocal, task.taskId, ownerUserId]
    );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );
}

async function requireOwnerUserId() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Нужно войти в мобильный аккаунт.");
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
  commandType: "createWorkTask" | "updateWorkTask" | "pauseWorkTask" | "resumeWorkTask" | "completeWorkTask";
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
    completedAtLocal: row.completed_at_local,
    sectionId: row.section_id,
    sectionName: row.section_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    createdAtLocal: row.created_at_local ?? row.planned_at ?? new Date().toISOString(),
    syncStatus: row.sync_status
  };
}
