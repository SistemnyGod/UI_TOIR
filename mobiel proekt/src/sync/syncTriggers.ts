import NetInfo from "@react-native-community/netinfo";

import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { canAttemptServerConnection } from "@/core/networkPolicy";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { triggerDailyDiagnosticReportUpload } from "@/services/diagnosticReportService";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { createMutationSyncScheduler } from "@/sync/mutationSyncScheduler";
import { registerMutationSyncRequester, requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
import { registerOutboxRetrySchedulerRunner } from "@/sync/outboxRetryScheduler";
import { ForegroundSyncResult, ForegroundSyncOptions, runForegroundSync } from "@/sync/syncEngine";

const fallbackRefreshMs = 300_000;
const refreshCooldownMs = 15_000;
const mutationSyncDebounceMs = 50;

let fallbackRefreshInterval: ReturnType<typeof setInterval> | null = null;
let scheduledRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let lastRefreshStartedAt = 0;
let activeRefreshPromise: Promise<boolean> | null = null;
let lastNetworkUsable: boolean | null = null;

const mutationSyncScheduler = createMutationSyncScheduler(
  () => triggerForegroundSyncWithRetry({ mode: "normal" }),
  mutationSyncDebounceMs
);
registerMutationSyncRequester(() => mutationSyncScheduler.request());
registerOutboxRetrySchedulerRunner(() => triggerForegroundSyncWithRetry({ mode: "normal" }));

export type MobileDataRefreshReason = "push" | "notificationResponse" | "network" | "appActive" | "fallback" | "manual";

export function subscribeToNetworkSync() {
  fallbackRefreshInterval ??= setInterval(() => {
    requestMobileDataRefresh("fallback");
    void triggerForegroundSyncWithRetry({ mode: "normal" });
  }, fallbackRefreshMs);

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const networkUsable = canAttemptServerConnection(state);
    const networkBecameUsable = networkUsable && lastNetworkUsable !== true;
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
      void triggerForegroundSyncWithRetry({ mode: networkBecameUsable ? "networkRecovered" : "normal" });
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
  nextRetryAt: null;
  retryableCount: 0;
};

export async function triggerForegroundSyncWithRetry(
  options: ForegroundSyncOptions & { forceRetry?: boolean } = {}
): Promise<TriggerForegroundSyncResult> {
  const mode = options.forceRetry ? "manualAll" : options.mode ?? "normal";
  const pendingRefresh = activeRefreshPromise;

  try {
    await (pendingRefresh ? pendingRefresh.catch(() => false) : Promise.resolve(false));
    const result = await runForegroundSync({ mode, assignmentId: options.assignmentId });
    if (result.skipped === null) {
      void triggerDailyDiagnosticReportUpload();
    }
    return result;
  } catch (error) {
    void logMobileError("sync.trigger.failed", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (isReauthenticationRequiredError(errorMessage)) {
      return { sent: 0, skipped: "unauthenticated", hasMore: false, nextRetryAt: null, retryableCount: 0 };
    }

    return { sent: 0, skipped: "failed", hasMore: false, nextRetryAt: null, retryableCount: 0 };
  }
}

export { requestSyncAfterMutation };

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