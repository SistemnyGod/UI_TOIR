import NetInfo from "@react-native-community/netinfo";
import { canAttemptServerConnection } from "@/core/networkPolicy";
import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";

import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { triggerDailyDiagnosticReportUpload } from "@/services/diagnosticReportService";
import { ForegroundSyncResult, prepareManualSyncRetry, runForegroundSync } from "@/sync/syncEngine";
import { getRetryDelayMs } from "@/sync/retryPolicy";

const fallbackRefreshMs = 300_000;
const refreshCooldownMs = 15_000;

let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let fallbackRefreshInterval: ReturnType<typeof setInterval> | null = null;
let scheduledRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let lastRefreshStartedAt = 0;
let activeRefreshPromise: Promise<boolean> | null = null;
let lastNetworkUsable: boolean | null = null;

export type MobileDataRefreshReason = "push" | "notificationResponse" | "network" | "appActive" | "fallback" | "manual";

export function subscribeToNetworkSync() {
  fallbackRefreshInterval ??= setInterval(() => {
    requestMobileDataRefresh("fallback");
  }, fallbackRefreshMs);

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const networkUsable = canAttemptServerConnection(state);
    if (networkUsable !== lastNetworkUsable) {
      lastNetworkUsable = networkUsable;
      void logMobileAction({
        eventType: networkUsable ? "network.available" : "network.unavailable",
        entityType: "mobileApp",
        message: networkUsable
          ? "Сеть доступна. Запущены обновление данных и отправка очереди."
          : "Сеть недоступна. Операции остаются в локальной очереди."
      }).catch(() => undefined);
    }

    if (networkUsable) {
      requestMobileDataRefresh("network");
      triggerForegroundSyncWithRetry();
      void triggerDailyDiagnosticReportUpload();
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

export type TriggerForegroundSyncResult = ForegroundSyncResult | {
  sent: 0;
  skipped: "failed";
  hasMore: false;
};

export async function triggerForegroundSyncWithRetry(
  options: { forceRetry?: boolean } = {}
): Promise<TriggerForegroundSyncResult> {
  clearScheduledRetry();
  const pendingRefresh = activeRefreshPromise;

  try {
    if (options.forceRetry) {
      await prepareManualSyncRetry();
    }
    await (pendingRefresh ? pendingRefresh.catch(() => false) : Promise.resolve(false));
    const result = await runForegroundSync();
    if (result.skipped === "serverUnavailable") {
      scheduleRetry();
      return result;
    }

    resetRetryBackoff();
    void triggerDailyDiagnosticReportUpload();
    return result;
  } catch (error) {
    void logMobileError("sync.trigger.failed", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (isReauthenticationRequiredError(errorMessage)) {
      return { sent: 0, skipped: "unauthenticated", hasMore: false };
    }

    scheduleRetry();
    return { sent: 0, skipped: "failed", hasMore: false };
  }
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
    .catch((error) => {
      void logMobileError("mobile.data.refresh.failed", error);
      return false;
    })
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

  const delayMs = getRetryDelayMs(retryAttempt);
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
