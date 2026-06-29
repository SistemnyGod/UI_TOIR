import NetInfo from "@react-native-community/netinfo";

import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { runForegroundSync } from "@/sync/syncEngine";

const retryDelaysMs = [30_000, 60_000, 120_000, 300_000];
const fallbackRefreshMs = 300_000;
const refreshCooldownMs = 15_000;

let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let fallbackRefreshInterval: ReturnType<typeof setInterval> | null = null;
let scheduledRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let lastRefreshStartedAt = 0;
let activeRefreshPromise: Promise<boolean> | null = null;

export type MobileDataRefreshReason = "push" | "notificationResponse" | "network" | "appActive" | "fallback" | "manual";

export function subscribeToNetworkSync() {
  fallbackRefreshInterval ??= setInterval(() => {
    requestMobileDataRefresh("fallback");
  }, fallbackRefreshMs);

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      requestMobileDataRefresh("network");
      triggerForegroundSyncWithRetry();
    }
  });

  return () => {
    unsubscribeNetInfo();
    if (fallbackRefreshInterval) {
      clearInterval(fallbackRefreshInterval);
      fallbackRefreshInterval = null;
    }
    if (scheduledRefreshTimeout) {
      clearTimeout(scheduledRefreshTimeout);
      scheduledRefreshTimeout = null;
    }
  };
}

export function triggerForegroundSyncWithRetry() {
  clearScheduledRetry();
  const pendingRefresh = activeRefreshPromise;

  void (pendingRefresh ? pendingRefresh.catch(() => false) : Promise.resolve(false))
    .then(() => runForegroundSync())
    .then((result) => {
      if (result.skipped === "serverUnavailable") {
        scheduleRetry();
        return;
      }

      if (result.skipped !== "busy") {
        resetRetryBackoff();
      }
    })
    .catch(() => {
      scheduleRetry();
    });
}

export function triggerMobileDataRefresh() {
  requestMobileDataRefresh("manual", { force: true });
}

export function requestMobileDataRefresh(
  reason: MobileDataRefreshReason,
  options: { force?: boolean } = {}
) {
  const now = Date.now();
  const elapsedMs = now - lastRefreshStartedAt;

  if (activeRefreshPromise) {
    scheduleMobileDataRefresh(reason, options.force ? 1_000 : refreshCooldownMs);
    return;
  }

  if (!options.force && elapsedMs < refreshCooldownMs) {
    scheduleMobileDataRefresh(reason, refreshCooldownMs - elapsedMs);
    return;
  }

  lastRefreshStartedAt = now;
  activeRefreshPromise = refreshMobileData()
    .catch(() => false)
    .finally(() => {
      activeRefreshPromise = null;
    });
}

function scheduleMobileDataRefresh(reason: MobileDataRefreshReason, delayMs: number) {
  if (scheduledRefreshTimeout) {
    return;
  }

  scheduledRefreshTimeout = setTimeout(() => {
    scheduledRefreshTimeout = null;
    requestMobileDataRefresh(reason);
  }, delayMs);
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
