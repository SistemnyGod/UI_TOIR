import { MobileEntityType, OutboxCommandStatus, OutboxCommandType } from "@/domain/sync/syncTypes";

export type SyncQueueCommandItem = {
  clientOperationId: string;
  commandType: OutboxCommandType;
  entityType: MobileEntityType;
  entityLocalId: string | null;
  entityServerId: string | null;
  status: OutboxCommandStatus;
  createdAtLocal: string;
  updatedAtLocal: string | null;
  attemptCount: number;
  lastError: string | null;
  assignmentRouteName: string | null;
};
