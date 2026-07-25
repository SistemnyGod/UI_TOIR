import { MobileEntityType, OutboxCommandStatus, OutboxCommandType } from "@/domain/sync/syncTypes";

export type SyncQueueCommandItem = {
  clientOperationId: string;
  contourId: string;
  commandType: OutboxCommandType;
  entityType: MobileEntityType;
  entityLocalId: string | null;
  entityServerId: string | null;
  status: OutboxCommandStatus;
  resolutionStatus: "open" | "dispatcher" | "resolvedServerWins" | "cancelledLocal" | "retryRequested" | null;
  createdAtLocal: string;
  updatedAtLocal: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  attemptCount: number;
  lastError: string | null;
  assignmentRouteName: string | null;
};
