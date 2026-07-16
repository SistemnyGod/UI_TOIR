import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { insertLocalFileInTransaction } from "@/db/repositories/filesRepository";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkAttachmentDto, WorkItemCapabilitiesDto, WorkItemDto, WorkParticipantDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import { LocalMobileFile } from "@/domain/files/fileTypes";
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
  item_kind?: WorkItemDto["kind"] | null;
  work_session_id?: string | null;
  plan_task_id?: string | null;
  description?: string | null;
  approval_status?: string | null;
  source?: string | null;
  assigned_employees_json?: string | null;
  actual_participants_json?: string | null;
  attachments_json?: string | null;
  capabilities_json?: string | null;
  local_attachment_count?: number | null;
  local_photo_count?: number | null;
  local_video_count?: number | null;
};

export async function saveWorkItems(items: WorkItemDto[]) {
  const ownerUserId = await requireOwnerUserId();
  const db = await getDatabase();
  await withSqliteBusyRetry(() => db.withExclusiveTransactionAsync(async (tx) => {
    const itemIds = items.map((item) => item.itemId);
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => "?").join(", ");
      await tx.runAsync(
        `DELETE FROM work_tasks WHERE owner_user_id = ? AND sync_status = 'synced' AND task_id NOT IN (${placeholders})`,
        [ownerUserId, ...itemIds]
      );
    }

    for (const item of items) {
      const primaryEmployee = item.actualParticipants.find((employee) => employee.isCurrentMobileEmployee)
        ?? item.assignedEmployees.find((employee) => employee.isCurrentMobileEmployee)
        ?? item.actualParticipants[0]
        ?? item.assignedEmployees[0]
        ?? null;
      await tx.runAsync(
        `
          INSERT INTO work_tasks (
            task_id, owner_user_id, title, status, planned_at, revision, completed_at_local,
            section_id, section_name, employee_id, employee_name, created_at_local, sync_status,
            item_kind, work_session_id, plan_task_id, description, approval_status, source,
            assigned_employees_json, actual_participants_json, attachments_json, capabilities_json
          )
          VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            title = excluded.title,
            status = CASE WHEN work_tasks.sync_status = 'pending' THEN work_tasks.status ELSE excluded.status END,
            planned_at = excluded.planned_at,
            revision = excluded.revision,
            section_id = excluded.section_id,
            section_name = excluded.section_name,
            employee_id = excluded.employee_id,
            employee_name = excluded.employee_name,
            item_kind = excluded.item_kind,
            work_session_id = excluded.work_session_id,
            plan_task_id = excluded.plan_task_id,
            description = excluded.description,
            approval_status = excluded.approval_status,
            source = excluded.source,
            assigned_employees_json = excluded.assigned_employees_json,
            actual_participants_json = excluded.actual_participants_json,
            attachments_json = excluded.attachments_json,
            capabilities_json = excluded.capabilities_json,
            sync_status = CASE WHEN work_tasks.sync_status = 'pending' THEN work_tasks.sync_status ELSE 'synced' END
        `,
        [
          item.itemId,
          ownerUserId,
          item.title,
          item.status,
          item.plannedAt,
          item.revision,
          item.sectionId,
          item.sectionName,
          primaryEmployee?.employeeId ?? null,
          primaryEmployee?.fullName ?? null,
          item.plannedAt ?? new Date().toISOString(),
          item.kind,
          item.workSessionId,
          item.planTaskId,
          item.description,
          item.approvalStatus,
          item.source,
          JSON.stringify(item.assignedEmployees),
          JSON.stringify(item.actualParticipants),
          JSON.stringify(item.attachments),
          JSON.stringify(item.capabilities)
        ]
      );
    }
  }));
}

export async function listLocalWorkItems(): Promise<WorkItemDto[]> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<WorkTaskRow>(
    `
      SELECT *, item_kind, work_session_id, plan_task_id, description, approval_status, source,
        assigned_employees_json, actual_participants_json, attachments_json, capabilities_json,
        (SELECT COUNT(*) FROM files WHERE files.work_task_id = work_tasks.task_id) AS local_attachment_count,
        (SELECT COUNT(*) FROM files WHERE files.work_task_id = work_tasks.task_id AND files.media_kind = 'photo') AS local_photo_count,
        (SELECT COUNT(*) FROM files WHERE files.work_task_id = work_tasks.task_id AND files.media_kind = 'video') AS local_video_count
      FROM work_tasks
      WHERE owner_user_id = ?
      ORDER BY planned_at ASC, created_at_local DESC
    `,
    [ownerUserId]
  );
  return rows.map(mapWorkItemRow);
}

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

  return taskId;
}

export async function startPlannedWorkLocally(item: WorkItemDto, employee: MobileEmployeeDto) {
  if (item.kind !== "planTask" || !item.planTaskId) {
    throw new Error("Плановая работа недоступна для запуска.");
  }

  const ownerUserId = await requireOwnerUserId();
  const taskId = Crypto.randomUUID();
  const startedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  const command = createWorkTaskOutboxCommand({
    ownerUserId,
    commandType: "startPlannedWork",
    payload: {
      taskId,
      planTaskId: item.planTaskId,
      employeeId: employee.employeeId,
      baseRevision: item.revision,
      startedAtLocal
    },
    taskId,
    createdAtLocal: startedAtLocal
  });
  await withSqliteBusyRetry(() => db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM work_tasks WHERE task_id = ? AND owner_user_id = ?", [item.itemId, ownerUserId]);
    await tx.runAsync(
      `INSERT INTO work_tasks (
        task_id, owner_user_id, title, status, planned_at, revision, completed_at_local,
        section_id, section_name, employee_id, employee_name, created_at_local, sync_status,
        item_kind, work_session_id, plan_task_id, description, approval_status, source,
        assigned_employees_json, actual_participants_json, capabilities_json
      ) VALUES (?, ?, ?, 'inProgress', ?, 0, NULL, ?, ?, ?, ?, ?, 'pending', 'workSession', ?, ?, ?, ?, 'mobile', ?, ?, ?)`,
      [
        taskId, ownerUserId, item.title, startedAtLocal, item.sectionId, item.sectionName,
        employee.employeeId, employee.fullName, startedAtLocal, taskId, item.planTaskId,
        item.description, item.approvalStatus, JSON.stringify(item.assignedEmployees),
        JSON.stringify([{ employeeId: employee.employeeId, fullName: employee.fullName, status: "Работает", startedAt: startedAtLocal, finishedAt: null, isCurrentMobileEmployee: true }]),
        JSON.stringify({ canStart: false, canJoin: false, canReplace: false, canPause: true, canResume: false, canComplete: true })
      ]
    );
    await insertOutboxCommandInTransaction(tx, command);
  }));
}

export async function joinWorkTaskLocally(item: WorkItemDto, employee: MobileEmployeeDto, comment: string) {
  await enqueueParticipantChange(item, employee, "joinWorkTask", { comment: comment.trim() || "Присоединение к работе" });
}

export async function replaceWorkTaskParticipantLocally(
  item: WorkItemDto,
  previousEmployeeId: string,
  employee: MobileEmployeeDto,
  reason: string
) {
  if (!reason.trim()) {
    throw new Error("Укажите причину замены исполнителя.");
  }
  await enqueueParticipantChange(item, employee, "replaceWorkTaskParticipant", {
    previousEmployeeId,
    reason: reason.trim()
  });
}

async function enqueueParticipantChange(
  item: WorkItemDto,
  employee: MobileEmployeeDto,
  commandType: "joinWorkTask" | "replaceWorkTaskParticipant",
  extraPayload: Record<string, unknown>
) {
  const taskId = item.workSessionId ?? item.itemId;
  const ownerUserId = await requireOwnerUserId();
  const now = new Date().toISOString();
  const db = await getDatabase();
  const command = createWorkTaskOutboxCommand({
    ownerUserId,
    commandType,
    payload: {
      taskId,
      employeeId: employee.employeeId,
      baseRevision: item.revision,
      startedAtLocal: now,
      changedAtLocal: now,
      ...extraPayload
    },
    taskId,
    createdAtLocal: now
  });
  await withSqliteBusyRetry(() => db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("UPDATE work_tasks SET sync_status = 'pending', status = 'inProgress' WHERE task_id = ? AND owner_user_id = ?", [item.itemId, ownerUserId]);
    await insertOutboxCommandInTransaction(tx, command);
  }));
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

export async function attachMediaToWorkTask(workTaskId: string, file: LocalMobileFile) {
  const ownerUserId = await requireOwnerUserId();
  const db = await getDatabase();
  await withSqliteBusyRetry(() => db.withExclusiveTransactionAsync(async (tx) => {
    const task = await tx.getFirstAsync<{ task_id: string }>(
      "SELECT task_id FROM work_tasks WHERE task_id = ? AND owner_user_id = ?",
      [workTaskId, ownerUserId]
    );
    if (!task) {
      throw new Error("Работа не найдена на телефоне.");
    }

    await insertLocalFileInTransaction(tx, { ...file, status: "queued", workTaskId });
  }));
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
  commandType: "createWorkTask" | "updateWorkTask" | "pauseWorkTask" | "resumeWorkTask" | "completeWorkTask" | "startPlannedWork" | "joinWorkTask" | "replaceWorkTaskParticipant";
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

function mapWorkItemRow(row: WorkTaskRow): WorkItemDto {
  const assignedEmployees = parseJson<WorkParticipantDto[]>(row.assigned_employees_json, []);
  const actualParticipants = parseJson<WorkParticipantDto[]>(row.actual_participants_json, []);
  const attachments = parseJson<WorkAttachmentDto[]>(row.attachments_json, []);
  const defaultCapabilities: WorkItemCapabilitiesDto = {
    canStart: row.item_kind === "planTask",
    canJoin: false,
    canReplace: false,
    canPause: row.status === "inProgress",
    canResume: row.status === "paused",
    canComplete: row.status === "inProgress" || row.status === "paused"
  };
  const capabilities = {
    ...defaultCapabilities,
    ...parseJson<Partial<WorkItemCapabilitiesDto>>(row.capabilities_json, {})
  };
  return {
    taskId: row.work_session_id ?? row.task_id,
    itemId: row.task_id,
    kind: row.item_kind === "planTask" ? "planTask" : "workSession",
    workSessionId: row.work_session_id ?? (row.item_kind === "planTask" ? null : row.task_id),
    planTaskId: row.plan_task_id ?? null,
    title: row.title,
    description: row.description ?? row.title,
    sectionId: row.section_id,
    sectionName: row.section_name ?? "Без участка",
    plannedAt: row.planned_at,
    status: row.status,
    approvalStatus: row.approval_status ?? "",
    revision: row.revision,
    source: row.source ?? "web",
    assignedEmployees,
    actualParticipants,
    attachments,
    localAttachmentCount: row.local_attachment_count ?? 0,
    localPhotoCount: row.local_photo_count ?? 0,
    localVideoCount: row.local_video_count ?? 0,
    capabilities,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    createdAtLocal: row.created_at_local ?? row.planned_at ?? new Date().toISOString(),
    completedAtLocal: row.completed_at_local,
    syncStatus: row.sync_status
  };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
