import NetInfo from "@react-native-community/netinfo";
import { canAttemptServerConnection } from "@/core/networkPolicy";
import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";

import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { triggerDailyDiagnosticReportUpload } from "@/services/diagnosticReportService";
import { ForegroundSyncResult, prepareManualSyncRetry, runForegroundSync } from "@/sync/syncEngine";
import { createMutationSyncScheduler } from "@/sync/mutationSyncScheduler";
import { registerMutationSyncRequester, requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
import { getRetryDelayMs } from "@/sync/retryPolicy";

const fallbackRefreshMs = 300_000;
const refreshCooldownMs = 15_000;
const mutationSyncDebounceMs = 50;

let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let fallbackRefreshInterval: ReturnType<typeof setInterval> | null = null;
let scheduledRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let lastRefreshStartedAt = 0;
let activeRefreshPromise: Promise<boolean> | null = null;
let lastNetworkUsable: boolean | null = null;

const mutationSyncScheduler = createMutationSyncScheduler(
  () => triggerForegroundSyncWithRetry(),
  mutationSyncDebounceMs
);
registerMutationSyncRequester(() => mutationSyncScheduler.request());

export type MobileDataRefreshReason = "push" | "notificationResponse" | "network" | "appActive" | "fallback" | "manual";

export function subscribeToNetworkSync() {
  fallbackRefreshInterval ??= setInterval(() => {
    requestMobileDataRefresh("fallback");
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
          ? "РЎРµС‚СЊ РґРѕСЃС‚СѓРїРЅР°. Р—Р°РїСѓС‰РµРЅС‹ РѕР±РЅРѕРІР»РµРЅРёРµ РґР°РЅРЅС‹С… Рё РѕС‚РїСЂР°РІРєР° РѕС‡РµСЂРµРґРё."
          : "РЎРµС‚СЊ РЅРµРґРѕСЃС‚СѓРїРЅР°. РћРїРµСЂР°С†РёРё РѕСЃС‚Р°СЋС‚СЃСЏ РІ Р»РѕРєР°Р»СЊРЅРѕР№ РѕС‡РµСЂРµРґРё."
      }).catch(() => undefined);
    }

    if (networkUsable) {
      requestMobileDataRefresh("network");
      void triggerForegroundSyncWithRetry({ forceRetry: networkBecameUsable });
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
  if (options.forceRetry) {
    clearScheduledRetry();
  }
  const pendingRefresh = activeRefreshPromise;

  try {
    if (options.forceRetry) {
      await prepareManualSyncRetry();
    }
    await (pendingRefresh ? pendingRefresh.catch(() => false) : Promise.resolve(false));
    const result = await runForegroundSync();
    if (result.skipped === "serverUnavailable" || result.skipped === "offline") {
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
