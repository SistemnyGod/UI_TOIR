import { completeAssignmentLocally } from '@/db/repositories/patrolRepository';
import { requestPatrolSync } from '@/sync/PatrolSyncCoordinator';

export type QueuedReportResult = {
  status: 'queued';
  alreadyQueued: boolean;
  clientOperationId: string;
  /** Settles independently from the local commit; never rejects that commit. */
  deliveryAttempt: Promise<unknown>;
};

/**
 * Commits the report locally first. Network delivery is deliberately started
 * in the background so a slow connection cannot turn one confirmation into a
 * second visible send step.
 */
export async function queuePatrolReport(assignmentId: string): Promise<QueuedReportResult> {
  const completion = await completeAssignmentLocally(assignmentId);

  const deliveryAttempt = requestPatrolSync({ mode: 'manualReport', assignmentId }).catch(() => undefined);

  return {
    status: 'queued',
    alreadyQueued: completion.alreadyQueued,
    clientOperationId: completion.clientOperationId,
    deliveryAttempt
  };
}

