import NetInfo from "@react-native-community/netinfo";

import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { runForegroundSync } from "@/sync/syncEngine";

const retryDelaysMs = [30_000, 60_000, 120_000, 300_000];

let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let retryAttempt = 0;

export function subscribeToNetworkSync() {
  refreshInterval ??= setInterval(() => {
    triggerMobileDataRefresh();
  }, 30_000);

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      triggerMobileDataRefresh();
      triggerForegroundSyncWithRetry();
    }
  });

  return () => {
    unsubscribeNetInfo();
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };
}

export function triggerForegroundSyncWithRetry() {
  clearScheduledRetry();

  void runForegroundSync()
    .then((result) => {
      if (result.skipped !== "busy") {
        resetRetryBackoff();
      }
    })
    .catch(() => {
      scheduleRetry();
    });
}

export function triggerMobileDataRefresh() {
  void refreshMobileData().catch(() => undefined);
}

function scheduleRetry() {
  if (retryTimeout) {
    return;
  }

  const delayMs = retryDelaysMs[Math.min(retryAttempt, retryDelaysMs.length - 1)];
  retryAttempt += 1;
  retryTimeout = setTimeout(() => {
    retryTimeout = null;
    triggerForegroundSyncWithRetry();
  }, delayMs);
}

function resetRetryBackoff() {
  retryAttempt = 0;
  clearScheduledRetry();
}

function clearScheduledRetry() {
  if (!retryTimeout) {
    return;
  }

  clearTimeout(retryTimeout);
  retryTimeout = null;
}
