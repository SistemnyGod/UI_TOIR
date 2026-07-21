export type OutboxCommandStatus =
  | "pending"
  | "sending"
  | "accepted"
  | "duplicate"
  | "retryLater"
  | "waiting_auth"
  | "waiting_network"
  | "wrong_contour"
  | "blocked"
  | "rejected"
  | "conflict"
  | "superseded";

export type OutboxCommandType =
  | "takePatrolRequest"
  | "acceptPatrolRequest"
  | "releasePatrolRequest"
  | "startPatrolAssignment"
  | "pausePatrolAssignment"
  | "resumePatrolAssignment"
  | "handoffPatrolAssignment"
  | "scanPatrolPointNfc"
  | "scanPatrolPointQr"
  | "markPatrolPointOk"
  | "markPatrolPointIssue"
  | "uploadPatrolPhoto"
  | "completePatrolAssignment"
  | "createWorkTask"
  | "updateWorkTask"
  | "pauseWorkTask"
  | "resumeWorkTask"
  | "completeWorkTask"
  | "startPlannedWork"
  | "joinWorkTask"
  | "replaceWorkTaskParticipant"
  | "createShiftRemark"
  | "attachShiftRemarkMedia";

export type MobileEntityType =
  | "patrolRequest"
  | "patrolAssignment"
  | "patrolPoint"
  | "patrolPhoto"
  | "workTask"
  | "shiftRemark";

export type OutboxCommand = {
  clientOperationId: string;
  ownerUserId: string;
  contourId?: string;
  commandType: OutboxCommandType;
  entityType: MobileEntityType;
  entityLocalId?: string | null;
  entityServerId?: string | null;
  payload: Record<string, unknown>;
  createdAtLocal: string;
  attemptCount: number;
  status: OutboxCommandStatus;
};

export type OutboxResponseStatus =
  | "accepted"
  | "duplicate"
  | "retryLater"
  | "rejected"
  | "conflict";

export type OutboxResponse = {
  clientOperationId: string;
  status: OutboxResponseStatus;
  serverEntityId: string | null;
  serverRevision: number | null;
  message: string;
  conflictId: string | null;
  retryAfterSeconds: number | null;
  reasonCode?: string | null;
};

export type SyncConflict = {
  conflictId: string;
  clientOperationId: string | null;
  entityType: MobileEntityType;
  reason: string;
  payloadSnapshot: Record<string, unknown>;
  status: "open" | "accepted" | "rejected" | "repeatRequested";
};
