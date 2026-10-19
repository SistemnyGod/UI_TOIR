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
  | "invalidPayload"
  | "rejected"
  | "conflict"
  | "superseded"
  | "cancelled"
  | "cancelledLocal";

export type OutboxCommandType =
  | "takePatrolRequest"
  | "acceptPatrolRequest"
  | "releasePatrolRequest"
  | "switchPatrolAssignment"
  | "createPatrolAppeal"
  | "startPatrolAssignment"
  | "pausePatrolAssignment"
  | "resumePatrolAssignment"
  | "handoffPatrolAssignment"
  | "transferPatrolAssignment"
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
  | "patrolAppeal"
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
  aggregateKey?: string | null;
  sequenceNo?: number | null;
  /** Allows an explicit user-confirmed continuation to bypass a failed switch barrier. */
  bypassSwitchBarrier?: boolean;
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
  status: "open" | "resolved" | "dismissed";
  resolutionStatus: "open" | "dispatcher" | "resolvedServerWins" | "cancelledLocal" | "retryRequested";
  resolvedAt: string | null;
  resolutionReason: string | null;
};
