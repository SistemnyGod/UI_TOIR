export type PatrolAction =
  | "acceptRequest"
  | "startAssignment"
  | "pauseAssignment"
  | "resumeAssignment"
  | "scanAssignment"
  | "editPoint"
  | "attachMedia"
  | "completeAssignment"
  | "releaseAssignment";

const blockedAssignmentStatuses = new Set([
  "authRequired",
  "syncError",
  "needsDispatcherDecision",
  "cancelledServer",
  "cancelled",
  "completed",
  "completedServer"
]);

const isNotBlocked = (status: string) => !blockedAssignmentStatuses.has(status);

export function canAcceptRequest(status: string) {
  return status === "available" || status === "assigned";
}

export function canStartAssignment(status: string) {
  return isNotBlocked(status) && (status === "accepted" || status === "paused" || status === "inProgress");
}

export function canPauseAssignment(status: string) {
  return isNotBlocked(status) && status === "inProgress";
}

export function canResumeAssignment(status: string) {
  return isNotBlocked(status) && status === "paused";
}

export function canScanAssignment(status: string) {
  return isNotBlocked(status) && status === "inProgress";
}

export function canEditPoint(status: string) {
  return isNotBlocked(status) && status === "inProgress";
}

export function canAttachMedia(status: string) {
  return isNotBlocked(status) && (status === "inProgress" || status === "completedLocal");
}

export function canCompleteAssignment(status: string) {
  return isNotBlocked(status) && status === "inProgress";
}

export function canReleaseAssignment(status: string) {
  return isNotBlocked(status) && status === "accepted";
}

export function canPatrolAction(action: PatrolAction, status: string) {
  switch (action) {
    case "acceptRequest": return canAcceptRequest(status);
    case "startAssignment": return canStartAssignment(status);
    case "pauseAssignment": return canPauseAssignment(status);
    case "resumeAssignment": return canResumeAssignment(status);
    case "scanAssignment": return canScanAssignment(status);
    case "editPoint": return canEditPoint(status);
    case "attachMedia": return canAttachMedia(status);
    case "completeAssignment": return canCompleteAssignment(status);
    case "releaseAssignment": return canReleaseAssignment(status);
  }
}

export function patrolActionError(action: PatrolAction, status: string) {
  if (canPatrolAction(action, status)) {
    return null;
  }

  if (blockedAssignmentStatuses.has(status)) {
    return "Действие заблокировано текущим статусом назначения.";
  }

  return "Действие недоступно для текущего статуса назначения.";
}
