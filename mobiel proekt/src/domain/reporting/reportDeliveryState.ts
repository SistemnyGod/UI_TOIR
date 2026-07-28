export type ReportDeliveryState =
  | { status: "notQueued" }
  | { status: "queued"; clientOperationId: string }
  | { status: "waitingNetwork"; clientOperationId: string; lastError: string | null }
  | { status: "waitingAuth"; clientOperationId: string; lastError: string | null }
  | { status: "retryScheduled"; clientOperationId: string; nextAttemptAt: string | null; lastError: string | null }
  | { status: "sending"; clientOperationId: string }
  | { status: "delivered"; clientOperationId: string; deliveredAt: string | null }
  | { status: "repairRequired"; blockingOperationId: string; blockingCommandType: string; lastError: string | null }
  | { status: "conflict"; blockingOperationId: string; blockingCommandType: string; lastError: string | null }
  | { status: "wrongContour"; blockingOperationId: string; lastError: string | null }
  | { status: "blockedByDependency"; blockingOperationId: string; blockingCommandType: string; blockingStatus: string; lastError: string | null };

export type ReportDeliveryStateSnapshot = ReportDeliveryState & {
  updatedAtLocal: string | null;
  attemptCount: number;
};
