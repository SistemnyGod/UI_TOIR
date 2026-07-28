export type SyncEvent = {
  acceptedOperationIds: string[];
  completedAssignmentIds: string[];
  cancelledAssignmentIds?: string[];
  changedAssignmentIds?: string[];
  deliveryChangedAssignmentIds?: string[];
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

/** Merge command-level updates into one aggregate notification for a sync pass. */
export function mergeSyncEvents(events: SyncEvent[]): SyncEvent {
  const unique = (values: string[]) => Array.from(new Set(values));
  return {
    acceptedOperationIds: unique(events.flatMap((event) => event.acceptedOperationIds)),
    completedAssignmentIds: unique(events.flatMap((event) => event.completedAssignmentIds)),
    cancelledAssignmentIds: unique(events.flatMap((event) => event.cancelledAssignmentIds ?? [])),
    changedAssignmentIds: unique(events.flatMap((event) => event.changedAssignmentIds ?? [])),
    deliveryChangedAssignmentIds: unique(events.flatMap((event) => event.deliveryChangedAssignmentIds ?? [])),
    snapshotRefreshed: events.some((event) => event.snapshotRefreshed === true)
  };
}

export function shouldReloadReportAfterSync(event: SyncEvent, assignmentId: string) {
  return event.snapshotRefreshed === true
    || event.completedAssignmentIds.includes(assignmentId)
    || event.cancelledAssignmentIds?.includes(assignmentId) === true
    || event.deliveryChangedAssignmentIds?.includes(assignmentId) === true;
}
export function shouldReloadAssignmentAfterSync(event: SyncEvent, assignmentId: string) {
  return event.snapshotRefreshed === true
    || event.completedAssignmentIds.includes(assignmentId)
    || event.cancelledAssignmentIds?.includes(assignmentId) === true
    || event.changedAssignmentIds?.includes(assignmentId) === true;
}
