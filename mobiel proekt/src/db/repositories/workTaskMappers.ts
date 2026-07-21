import * as Crypto from "expo-crypto";

import { WorkAttachmentDto, WorkItemCapabilitiesDto, WorkItemDto, WorkParticipantDto, WorkTaskDto } from "@/domain/emu/emuTypes";
import { OutboxCommand } from "@/domain/sync/syncTypes";

export type WorkTaskRow = {
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

export function statusForPendingAction(commandType: string): WorkTaskDto["status"] {
  if (commandType === "completeWorkTask") {
    return "completedLocal";
  }

  return commandType === "pauseWorkTask" ? "paused" : "inProgress";
}

export function createWorkTaskOutboxCommand({
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

export function mapWorkItemRow(row: WorkTaskRow): WorkItemDto {
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



export function mapWorkTaskRow(row: WorkTaskRow): WorkTaskDto {
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
