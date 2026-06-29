type SyncEvent = {
  acceptedOperationIds: string[];
  completedAssignmentIds: string[];
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
