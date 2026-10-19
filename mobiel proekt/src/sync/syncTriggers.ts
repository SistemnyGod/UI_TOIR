import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { refreshStoredAccessTokenIfNeeded } from "@/api/httpClient";

import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { getSessionGeneration } from "@/auth/sessionGeneration";
import { canAttemptServerConnection, networkRouteKey } from "@/core/networkPolicy";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { triggerDailyDiagnosticReportUpload, triggerPendingDiagnosticReportUpload } from "@/services/diagnosticReportService";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { createMutationSyncScheduler } from "@/sync/mutationSyncScheduler";
import { registerMutationSyncRequester, requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
import { registerOutboxRetrySchedulerRunner } from "@/sync/outboxRetryScheduler";
import { ForegroundSyncResult, ForegroundSyncOptions, runForegroundSync } from "@/sync/syncEngine";

const fallbackRefreshMs = 30_000;
const refreshCooldownMs = 15_000;
const mutationSyncDebounceMs = 50;

let fallbackRefreshInterval: ReturnType<typeof setInterval> | null = null;
let scheduledRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let scheduledRefreshDueAt = 0;
let scheduledRefreshForce = false;
let networkRecoveryPromise: Promise<void> | null = null;
let recoveryOwner: { generation: number; reconnect: boolean } | null = null;
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
  lastNetworkUsable = null;
  let lastRoute: string | null = null;
  fallbackRefreshInterval ??= setInterval(() => {
    if (AppState.currentState === "active" && lastNetworkUsable !== false) {
      void runMobileRecoveryCycle("fallback", "normal");
    }
  }, fallbackRefreshMs);

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const networkUsable = canAttemptServerConnection(state);
    const route = networkRouteKey(state);
    const networkBecameUsable = networkUsable && route !== lastRoute;
    if (route !== lastRoute) {
      lastRoute = route;
      lastNetworkUsable = networkUsable;
      void logMobileAction({
        eventType: networkUsable ? "network.available" : "network.unavailable",
        entityType: "mobileApp",
        message: networkUsable
          ? "Сеть доступна. Запущены обновление данных и отправка очереди."
          : "Сеть недоступна. Операции остаются в локальной очереди."
      }).catch(() => undefined);
    }

    if (networkBecameUsable) {
      void runMobileRecoveryCycle("network", "networkRecovered");
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
      scheduledRefreshDueAt = 0;
      scheduledRefreshForce = false;
    }
  };
}

export async function runMobileRecoveryCycle(
  reason: MobileDataRefreshReason,
  mode: ForegroundSyncOptions["mode"] = "normal"
) {
  const generation = getSessionGeneration();
  if (networkRecoveryPromise && recoveryOwner?.generation === generation) {
    // A reconnect is a new opportunity to deliver. Coalesce bursts, but never
    // lose it behind an older pass that may have already observed offline.
    if (mode === "networkRecovered") recoveryOwner.reconnect = true;
    return networkRecoveryPromise;
  }

  const owner = { generation, reconnect: false };
  recoveryOwner = owner;
  const isCurrent = () => recoveryOwner === owner && getSessionGeneration() === generation;
  let request!: Promise<void>;
  request = (async () => {
    do {
      owner.reconnect = false;
      try {
        const accessToken = await refreshStoredAccessTokenIfNeeded();
        if (!isCurrent() || !accessToken) return;

        await triggerForegroundSyncWithRetry({ mode });
        if (!isCurrent()) return;
        // Deliver the queued reconnect before starting list refreshes.
        if (!owner.reconnect) {
          await refreshMobileData();
          if (!isCurrent()) return;
          void triggerPendingDiagnosticReportUpload();
          void triggerDailyDiagnosticReportUpload();
        }
      } catch (error) {
        void logMobileError(`mobile.recovery.${reason}.failed`, error);
      }
      mode = "networkRecovered";
    } while (isCurrent() && owner.reconnect);
  })().finally(() => {
    if (networkRecoveryPromise === request) {
      networkRecoveryPromise = null;
      recoveryOwner = null;
    }
  });
  networkRecoveryPromise = request;
  return request;
}
export type TriggerForegroundSyncResult = ForegroundSyncResult | {
  sent: 0;
  skipped: "failed";
  hasMore: false;
  nextRetryAt: null;
  retryableCount: 0;
  outcome: "failed";
};
const activeSyncRequests = new Map<string, Promise<TriggerForegroundSyncResult>>();


export async function triggerForegroundSyncWithRetry(
  options: ForegroundSyncOptions & { forceRetry?: boolean } = {}
): Promise<TriggerForegroundSyncResult> {
  const mode = options.forceRetry ? "manualAll" : options.mode ?? "normal";
  const generation = getSessionGeneration();
  const requestKey = `${generation}:${mode}:${options.assignmentId ?? "*"}`;
  const activeRequest = activeSyncRequests.get(requestKey);
  if (activeRequest) {
    return activeRequest;
  }

  // A manual report/reconnect must not wait for unrelated paginated lists.
  const pendingRefresh = mode === "normal" ? activeRefreshPromise : null;
  let request!: Promise<TriggerForegroundSyncResult>;
  request = (async (): Promise<TriggerForegroundSyncResult> => {
    try {
      await (pendingRefresh ? pendingRefresh.catch(() => false) : Promise.resolve(false));
      if (generation !== getSessionGeneration()) {
        return { sent: 0, skipped: "unauthenticated", hasMore: false, nextRetryAt: null, retryableCount: 0, outcome: "skipped" };
      }
      const result = await runForegroundSync({ mode, assignmentId: options.assignmentId });
      if (result.skipped === null) {
        void triggerPendingDiagnosticReportUpload();
        void triggerDailyDiagnosticReportUpload();
      }
      return result;
    } catch (error) {
      void logMobileError("sync.trigger.failed", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (isReauthenticationRequiredError(errorMessage)) {
        return { sent: 0, skipped: "unauthenticated", hasMore: false, nextRetryAt: null, retryableCount: 0, outcome: "skipped" };
      }

      return { sent: 0, skipped: "failed", hasMore: false, nextRetryAt: null, retryableCount: 0, outcome: "failed" };
    }
  })().finally(() => {
    if (activeSyncRequests.get(requestKey) === request) {
      activeSyncRequests.delete(requestKey);
    }
  });
  activeSyncRequests.set(requestKey, request);
  return request;
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
    scheduleMobileDataRefresh(reason, options.force ? 1_000 : refreshCooldownMs, options.force === true);
    return;
  }

  if (!options.force && elapsedMs < refreshCooldownMs) {
    scheduleMobileDataRefresh(reason, refreshCooldownMs - elapsedMs, false);
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

function scheduleMobileDataRefresh(reason: MobileDataRefreshReason, delayMs: number, force: boolean) {
  const dueAt = Date.now() + Math.max(0, delayMs);
  if (scheduledRefreshTimeout && scheduledRefreshDueAt <= dueAt) {
    scheduledRefreshForce ||= force;
    return;
  }
  if (scheduledRefreshTimeout) {
    clearTimeout(scheduledRefreshTimeout);
  }

  scheduledRefreshDueAt = dueAt;
  scheduledRefreshForce = force;
  scheduledRefreshTimeout = setTimeout(() => {
    const shouldForce = scheduledRefreshForce;
    scheduledRefreshTimeout = null;
    scheduledRefreshDueAt = 0;
    scheduledRefreshForce = false;
    requestMobileDataRefresh(reason, { force: shouldForce });
  }, Math.max(0, dueAt - Date.now()));
}
