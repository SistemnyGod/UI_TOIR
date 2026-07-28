import { subscribeToNetworkSync, triggerForegroundSyncWithRetry, type TriggerForegroundSyncResult } from "@/sync/syncTriggers";
import type { ForegroundSyncOptions } from "@/sync/syncEngine";

type PatrolSyncRequest = ForegroundSyncOptions & { forceRetry?: boolean };

let started = false;

/** Single foreground coordinator used by app lifecycle, mutations and screens. */
export function startPatrolSyncCoordinator() {
  if (started) {
    return () => undefined;
  }

  started = true;
  const stopNetworkSubscription = subscribeToNetworkSync();
  return () => {
    if (!started) {
      return;
    }
    started = false;
    stopNetworkSubscription();
  };
}

export function requestPatrolSync(options: PatrolSyncRequest = {}): Promise<TriggerForegroundSyncResult> {
  return triggerForegroundSyncWithRetry(options);
}