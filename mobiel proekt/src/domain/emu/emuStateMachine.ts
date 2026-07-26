import type { WorkTaskStatus } from "@/domain/emu/emuTypes";

export type EmuTaskAction =
  | "accept"
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "edit"
  | "attach"
  | "cancel"
  | "resolve"
  | "amend"
  | "serverAccepted"
  | "serverConflict";

const activeStatuses = new Set<WorkTaskStatus>(["new", "accepted", "inProgress", "paused"]);
const blockedStatuses = new Set<WorkTaskStatus>(["cancelled", "completedServer", "conflict"]);

export function canTransitionEmuTask(status: WorkTaskStatus | string, action: EmuTaskAction): boolean {
  switch (action) {
    case "accept":
      return status === "new" || status === "available" || status === "assigned";
    case "start":
      return status === "new" || status === "available" || status === "assigned" || status === "accepted";
    case "pause":
      return status === "inProgress";
    case "resume":
      return status === "paused";
    case "complete":
      return status === "inProgress" || status === "paused";
    case "edit":
      return activeStatuses.has(status as WorkTaskStatus);
    case "attach":
      return status === "inProgress" || status === "paused";
    case "cancel":
      return activeStatuses.has(status as WorkTaskStatus);
    case "resolve":
      return status === "conflict";
    case "amend":
      return status === "completedServer";
    case "serverAccepted":
      return status === "completedLocal";
    case "serverConflict":
      return status === "completedLocal" || activeStatuses.has(status as WorkTaskStatus);
  }
}

export function canAcceptEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "accept");
}

export function canStartEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "start");
}

export function canPauseEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "pause");
}

export function canResumeEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "resume");
}

export function canCompleteEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "complete");
}

export function canEditEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "edit");
}

export function canAttachEmuMedia(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "attach");
}

export function canResolveEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "resolve");
}

export function canAmendEmuTask(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "amend");
}

export function canMarkEmuTaskCompletedServer(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "serverAccepted");
}

export function canMarkEmuTaskConflict(status: WorkTaskStatus | string) {
  return canTransitionEmuTask(status, "serverConflict");
}

export function emuTaskActionError(action: EmuTaskAction, status: WorkTaskStatus | string) {
  if (canTransitionEmuTask(status, action)) {
    return null;
  }
  if (status === "completedServer") {
    return "Работа уже завершена на сервере. Доступно только оформление исправления.";
  }
  if (status === "cancelled") {
    return "Отменённую работу нельзя изменять.";
  }
  if (status === "conflict") {
    return "Работа заблокирована конфликтом. Сначала разрешите конфликт.";
  }
  if (blockedStatuses.has(status as WorkTaskStatus)) {
    return "Действие недоступно для текущего статуса работы.";
  }
  return "Действие недоступно для текущего статуса работы.";
}
