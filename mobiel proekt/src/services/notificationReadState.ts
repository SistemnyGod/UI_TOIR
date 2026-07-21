export type LocalNotificationReadState = {
  readAt: string | null;
  readSyncPending: boolean;
};

/**
 * A bootstrap response may still contain readAt=null while a local read
 * acknowledgement is waiting for delivery. Do not make an already-read
 * notification unread while that acknowledgement is being retried.
 */
export function mergeNotificationReadState(
  local: LocalNotificationReadState,
  serverReadAt: string | null
): LocalNotificationReadState {
  if (serverReadAt) {
    return { readAt: serverReadAt, readSyncPending: false };
  }

  if (local.readAt) {
    return local;
  }

  return { readAt: null, readSyncPending: false };
}
