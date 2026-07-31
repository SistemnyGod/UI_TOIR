import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { currentContourId } from "@/core/environments";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { insertLocalFileInTransaction } from "@/db/repositories/filesRepository";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import { emuTaskActionError } from "@/domain/emu/emuStateMachine";
import { LocalMobileFile } from "@/domain/files/fileTypes";
import { WorkTaskRow, createWorkTaskOutboxCommand, mapWorkItemRow, mapWorkTaskRow, statusForPendingAction } from "@/db/repositories/workTaskMappers";
import { insertOutboxCommandInTransaction, type SqlExecutor } from "@/db/repositories/outboxSql";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";

export async function saveWorkItems(items: WorkItemDto[]) {
  const ownerUserId = await requireOwnerUserId();
  const db = await getDatabase();
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
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
            title = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.title ELSE excluded.title END,
            status = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.status ELSE excluded.status END,
            planned_at = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.planned_at ELSE excluded.planned_at END,
            revision = excluded.revision,
            section_id = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.section_id ELSE excluded.section_id END,
            section_name = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.section_name ELSE excluded.section_name END,
            employee_id = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.employee_id ELSE excluded.employee_id END,
            employee_name = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.employee_name ELSE excluded.employee_name END,
            item_kind = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.item_kind ELSE excluded.item_kind END,
            work_session_id = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.work_session_id ELSE excluded.work_session_id END,
            plan_task_id = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.plan_task_id ELSE excluded.plan_task_id END,
            description = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.description ELSE excluded.description END,
            approval_status = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.approval_status ELSE excluded.approval_status END,
            source = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.source ELSE excluded.source END,
            assigned_employees_json = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.assigned_employees_json ELSE excluded.assigned_employees_json END,
            actual_participants_json = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.actual_participants_json ELSE excluded.actual_participants_json END,
            attachments_json = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.attachments_json ELSE excluded.attachments_json END,
            capabilities_json = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.capabilities_json ELSE excluded.capabilities_json END,
            sync_status = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.sync_status ELSE 'synced' END
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
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
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
         AND outbox_commands.status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked')
         AND outbox_commands.contour_id = ?
         WHERE work_tasks.owner_user_id = ?
        ORDER BY outbox_commands.created_at_local ASC
      `,
      [currentContourId, ownerUserId]
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
                AND outbox_commands.status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked', 'rejected', 'conflict', 'invalidPayload')
         AND outbox_commands.contour_id = ?
            )
        `,
        [ownerUserId, ...serverTaskIds, currentContourId]
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
                AND outbox_commands.status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked', 'rejected', 'conflict', 'invalidPayload')
         AND outbox_commands.contour_id = ?
            )
        `,
        [ownerUserId, currentContourId]
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
            title = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.title ELSE excluded.title END,
            status = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.status ELSE excluded.status END,
            planned_at = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.planned_at ELSE excluded.planned_at END,
            revision = excluded.revision,
            completed_at_local = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.completed_at_local ELSE excluded.completed_at_local END,
            section_id = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.section_id ELSE excluded.section_id END,
            section_name = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.section_name ELSE excluded.section_name END,
            employee_id = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.employee_id ELSE excluded.employee_id END,
            employee_name = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.employee_name ELSE excluded.employee_name END,
            created_at_local = excluded.created_at_local,
            sync_status = CASE WHEN work_tasks.sync_status <> 'synced' THEN work_tasks.sync_status ELSE excluded.sync_status END
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
  assertEmuTaskAction("start", "new");

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
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
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

  requestSyncAfterMutation();
  return taskId;
}

export async function startPlannedWorkLocally(item: WorkItemDto, employee: MobileEmployeeDto) {
  if (item.kind !== "planTask" || !item.planTaskId) {
    throw new Error("Плановая работа недоступна для запуска.");
  }
  assertEmuTaskAction("start", item.status);

  const ownerUserId = await requireOwnerUserId();
  const taskId = Crypto.randomUUID();
  const startedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  const result = await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
    const currentItem = await tx.getFirstAsync<{ taskId: string; status: WorkTaskDto["status"]; revision: number }>(
      "SELECT task_id AS taskId, status, revision FROM work_tasks WHERE task_id = ? AND owner_user_id = ? AND item_kind = 'planTask'",
      [item.itemId, ownerUserId]
    );
    if (!currentItem) {
      throw new Error("Работа не найдена на телефоне.");
    }
    assertEmuTaskAction("start", currentItem.status);

    const existing = await tx.getFirstAsync<{ taskId: string }>(
      `
        SELECT task_id AS taskId
        FROM work_tasks
        WHERE owner_user_id = ?
          AND item_kind = 'workSession'
          AND plan_task_id = ?
        ORDER BY created_at_local ASC
        LIMIT 1
      `,
      [ownerUserId, item.planTaskId]
    );
    const capabilitiesResult = await tx.runAsync(
      `
        UPDATE work_tasks
        SET capabilities_json = ?
        WHERE task_id = ?
          AND owner_user_id = ?
          AND item_kind = 'planTask'
      `,
      [
        JSON.stringify({ canStart: false, canJoin: false, canReplace: false, canPause: false, canResume: false, canComplete: false }),
        currentItem.taskId,
        ownerUserId
      ]
    );
    if (capabilitiesResult.changes !== 1) {
      throw new Error("Работа изменилась до запуска.");
    }
    if (existing) {
      return existing.taskId;
    }

    const command = createWorkTaskOutboxCommand({
      ownerUserId,
      commandType: "startPlannedWork",
      payload: {
        taskId,
        planTaskId: item.planTaskId,
        employeeId: employee.employeeId,
        baseRevision: currentItem.revision,
        startedAtLocal
      },
      taskId,
      createdAtLocal: startedAtLocal
    });
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
    return taskId;
  }));
  requestSyncAfterMutation();
  return result;
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
  assertEmuTaskAction(commandType === "joinWorkTask" ? "start" : "edit", item.status);
  const now = new Date().toISOString();
  const db = await getDatabase();
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
    const currentTask = await getCurrentWorkTaskInTransaction(tx, ownerUserId, item.itemId);
    const action = commandType === "joinWorkTask" ? "start" : "edit";
    assertEmuTaskAction(action, currentTask.status);
    const command = createWorkTaskOutboxCommand({
      ownerUserId,
      commandType,
      payload: {
        taskId,
        employeeId: employee.employeeId,
        baseRevision: currentTask.revision,
        startedAtLocal: now,
        changedAtLocal: now,
        ...extraPayload
      },
      taskId,
      createdAtLocal: now
    });
    const result = await tx.runAsync(
      "UPDATE work_tasks SET sync_status = 'pending', status = 'inProgress' WHERE task_id = ? AND owner_user_id = ?",
      [currentTask.taskId, ownerUserId]
    );
    if (result.changes !== 1) {
      throw new Error("Работа изменилась до сохранения.");
    }
    await insertOutboxCommandInTransaction(tx, command);
  }));
  requestSyncAfterMutation();
}

type CurrentWorkTaskState = {
  taskId: string;
  status: WorkTaskDto["status"];
  revision: number;
};

async function getCurrentWorkTaskInTransaction(tx: Pick<SQLite.SQLiteDatabase, "getFirstAsync">, ownerUserId: string, taskId: string) {
  const task = await tx.getFirstAsync<CurrentWorkTaskState>(
    "SELECT task_id AS taskId, status, revision FROM work_tasks WHERE task_id = ? AND owner_user_id = ?",
    [taskId, ownerUserId]
  );
  if (!task) {
    throw new Error("Работа не найдена на телефоне.");
  }
  return task;
}

export async function updateWorkTaskLocally(input: UpdateWorkTaskInput) {
  const ownerUserId = await requireOwnerUserId();
  assertEmuTaskAction("edit", input.task.status);
  const updatedAtLocal = new Date().toISOString();
  const title = input.taskDescription.trim();
  if (!title) {
    throw new Error("Заполните задачу.");
  }

  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const currentTask = await getCurrentWorkTaskInTransaction(tx, ownerUserId, input.task.taskId);
      assertEmuTaskAction("edit", currentTask.status);
      const command = createWorkTaskOutboxCommand({
        ownerUserId,
        commandType: "updateWorkTask",
        payload: {
          taskId: currentTask.taskId,
          sectionId: input.sectionId,
          taskDescription: title,
          baseRevision: currentTask.revision,
          updatedAtLocal
        },
        taskId: currentTask.taskId,
        createdAtLocal: updatedAtLocal
      });
      const result = await tx.runAsync(
        `
          UPDATE work_tasks
          SET title = ?,
              section_id = ?,
              section_name = ?,
              sync_status = 'pending'
          WHERE task_id = ?
            AND owner_user_id = ?
        `,
        [title, input.sectionId, input.sectionName, currentTask.taskId, ownerUserId]
      );
      if (result.changes !== 1) {
        throw new Error("Работа изменилась до сохранения.");
      }
      await insertOutboxCommandInTransaction(tx, command);
    })
  );
  requestSyncAfterMutation();
}

export async function pauseWorkTaskLocally(task: WorkTaskDto, comment: string) {
  const ownerUserId = await requireOwnerUserId();
  assertEmuTaskAction("pause", task.status);
  const pausedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      if (await hasActiveWorkTaskCommand(tx, ownerUserId, task.taskId, "pauseWorkTask")) {
        return;
      }
      const currentTask = await getCurrentWorkTaskInTransaction(tx, ownerUserId, task.taskId);
      assertEmuTaskAction("pause", currentTask.status);
      const command = createWorkTaskOutboxCommand({
        ownerUserId,
        commandType: "pauseWorkTask",
        payload: {
          taskId: currentTask.taskId,
          baseRevision: currentTask.revision,
          pausedAtLocal,
          comment: comment.trim()
        },
        taskId: currentTask.taskId,
        createdAtLocal: pausedAtLocal
      });
      const result = await tx.runAsync(
        `
          UPDATE work_tasks
          SET status = 'paused',
              sync_status = 'pending'
          WHERE task_id = ?
            AND owner_user_id = ?
        `,
        [currentTask.taskId, ownerUserId]
      );
      if (result.changes !== 1) {
        throw new Error("Работа изменилась до сохранения.");
      }
      await insertOutboxCommandInTransaction(tx, command);
    })
  );
  requestSyncAfterMutation();
}

export async function resumeWorkTaskLocally(task: WorkTaskDto, comment: string) {
  const ownerUserId = await requireOwnerUserId();
  assertEmuTaskAction("resume", task.status);
  const resumedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      if (await hasActiveWorkTaskCommand(tx, ownerUserId, task.taskId, "resumeWorkTask")) {
        return;
      }
      const currentTask = await getCurrentWorkTaskInTransaction(tx, ownerUserId, task.taskId);
      assertEmuTaskAction("resume", currentTask.status);
      const command = createWorkTaskOutboxCommand({
        ownerUserId,
        commandType: "resumeWorkTask",
        payload: {
          taskId: currentTask.taskId,
          baseRevision: currentTask.revision,
          resumedAtLocal,
          comment: comment.trim()
        },
        taskId: currentTask.taskId,
        createdAtLocal: resumedAtLocal
      });
      const result = await tx.runAsync(
        `
          UPDATE work_tasks
          SET status = 'inProgress',
              sync_status = 'pending'
          WHERE task_id = ?
            AND owner_user_id = ?
        `,
        [currentTask.taskId, ownerUserId]
      );
      if (result.changes !== 1) {
        throw new Error("Работа изменилась до сохранения.");
      }
      await insertOutboxCommandInTransaction(tx, command);
    })
  );
  requestSyncAfterMutation();
}

export async function completeWorkTaskLocally(task: WorkTaskDto, resultComment: string) {
  const ownerUserId = await requireOwnerUserId();
  assertEmuTaskAction("complete", task.status);
  const comment = resultComment.trim();
  if (!comment) {
    throw new Error("Заполните комментарий для завершения работы.");
  }

  const completedAtLocal = new Date().toISOString();
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      if (await hasActiveWorkTaskCommand(tx, ownerUserId, task.taskId, "completeWorkTask")) {
        return;
      }
      const currentTask = await getCurrentWorkTaskInTransaction(tx, ownerUserId, task.taskId);
      assertEmuTaskAction("complete", currentTask.status);
      const command = createWorkTaskOutboxCommand({
        ownerUserId,
        commandType: "completeWorkTask",
        payload: {
          taskId: currentTask.taskId,
          baseRevision: currentTask.revision,
          completedAtLocal,
          resultStatus: "completed",
          resultComment: comment
        },
        taskId: currentTask.taskId,
        createdAtLocal: completedAtLocal
      });
      const result = await tx.runAsync(
        `
          UPDATE work_tasks
          SET status = 'completedLocal',
              completed_at_local = ?,
              sync_status = 'pending'
          WHERE task_id = ?
            AND owner_user_id = ?
        `,
        [completedAtLocal, currentTask.taskId, ownerUserId]
      );
      if (result.changes !== 1) {
        throw new Error("Работа изменилась до сохранения.");
      }
      await insertOutboxCommandInTransaction(tx, command);
    })
  );
  requestSyncAfterMutation();
}

export async function attachMediaToWorkTask(workTaskId: string, file: LocalMobileFile) {
  const ownerUserId = await requireOwnerUserId();
  const db = await getDatabase();
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
    const task = await tx.getFirstAsync<{ task_id: string; status: WorkTaskDto["status"] }>(
      "SELECT task_id, status FROM work_tasks WHERE task_id = ? AND owner_user_id = ?",
      [workTaskId, ownerUserId]
    );
    if (!task) {
      throw new Error("Работа не найдена на телефоне.");
    }
    assertEmuTaskAction("attach", task.status);
    await insertLocalFileInTransaction(tx, { ...file, status: "queued", workTaskId });
  }));
  requestSyncAfterMutation();
}

type WorkTaskTransitionCommand = "pauseWorkTask" | "resumeWorkTask" | "completeWorkTask";

async function hasActiveWorkTaskCommand(
  tx: SqlExecutor,
  ownerUserId: string,
  taskId: string,
  commandType: WorkTaskTransitionCommand
) {
  const rows = await tx.getAllAsync<{ client_operation_id: string }>(
    `
      SELECT client_operation_id
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND entity_local_id = ?
        AND command_type = ?
        AND status IN ('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked')
      LIMIT 1
    `,
    [ownerUserId, currentContourId, taskId, commandType]
  );

  return rows.length > 0;
}

function assertEmuTaskAction(action: Parameters<typeof emuTaskActionError>[0], status: WorkTaskDto["status"] | string) {
  const error = emuTaskActionError(action, status);
  if (error) {
    throw new Error(error);
  }
}

async function requireOwnerUserId() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Нужно войти в мобильный аккаунт.");
  }

  return ownerUserId;
}
