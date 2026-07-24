export type SyncEvent = {
  acceptedOperationIds: string[];
  completedAssignmentIds: string[];
  cancelledAssignmentIds?: string[];
  snapshotRefreshed?: boolean;
};

type SyncEventListener = (event: SyncEvent) => void;

const listeners = new Set<SyncEventListener>();

export function subscribeToSyncEvents(listener: SyncEventListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function emitSyncEvent(event: SyncEvent) {
  for (const listener of listeners) {
    listener(event);
  }
}

export function shouldReloadAssignmentAfterSync(event: SyncEvent, assignmentId: string) {
  return event.snapshotRefreshed === true
    || event.completedAssignmentIds.includes(assignmentId)
    || event.cancelledAssignmentIds?.includes(assignmentId) === true;
}
