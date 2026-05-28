export type OutboxCommandStatus =
  | "pending"
  | "sending"
  | "accepted"
  | "duplicate"
  | "retryLater"
  | "rejected"
  | "conflict";

export type OutboxCommandType =
  | "takePatrolRequest"
  | "startPatrolAssignment"
  | "scanPatrolPointNfc"
  | "scanPatrolPointQr"
  | "markPatrolPointOk"
  | "markPatrolPointIssue"
  | "uploadPatrolPhoto"
  | "completePatrolAssignment"
  | "pauseWorkTask"
  | "resumeWorkTask"
  | "completeWorkTask"
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
};

export type SyncConflict = {
  conflictId: string;
  clientOperationId: string | null;
  entityType: MobileEntityType;
  reason: string;
  payloadSnapshot: Record<string, unknown>;
  status: "open" | "accepted" | "rejected" | "repeatRequested";
};
