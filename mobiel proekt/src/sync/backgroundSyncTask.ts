import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { initializeDatabase } from "@/db/database";
import { logMobileError } from "@/services/mobileErrorReporter";
import { recoverStaleSendingOutboxCommands, runBackgroundOutboxSync } from "@/sync/syncEngine";
import { recordBackgroundSyncResult } from "@/sync/backgroundSyncState";
import { captureDataOwnerContext, assertDataOwnerContext } from "@/auth/dataOwnerContext";
import { getSessionGeneration } from "@/auth/sessionGeneration";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { hasPendingOutboxCommands } from "@/db/repositories/outboxRepository";
import { evaluateReportAutoSubmits, runReportDeliveryNotices } from "@/services/reportAutoSubmitService";

export const PATROL360_BACKGROUND_SYNC_TASK = "patrol360-background-sync";
/** Regular cadence; WorkManager runs it only with a network connection. */
export const BACKGROUND_SYNC_NORMAL_INTERVAL_MINUTES = 15;

let activeRun: { generation: number; promise: Promise<BackgroundTask.BackgroundTaskResult> } | null = null;

export function runBackgroundSyncTask() {
  const generation = getSessionGeneration();
  if (activeRun?.generation === generation) return activeRun.promise;
  const promise = executeBackgroundSyncTask().finally(() => {
    if (activeRun?.promise === promise) activeRun = null;
  });
  activeRun = { generation, promise };
  return promise;
}

/** Best-effort handoff while JS is still alive. OS-scheduled recovery remains
 * registered for process termination, Doze and connectivity returning later.
 */
export async function syncPendingReportsOnBackground() {
  if (!await getStoredOwnerUserId()) return;
  const scope = await captureDataOwnerContext();
  const pending = await hasPendingOutboxCommands(scope.ownerUserId);
  await assertDataOwnerContext(scope);
  if (pending) await runBackgroundSyncTask();
}

async function executeBackgroundSyncTask() {
  const attemptAt = new Date().toISOString();
  await recordBackgroundSyncResult("failed", attemptAt).catch((error) => {
    void logMobileError("background.sync.state-save.failed", error);
  });

  try {
    await initializeDatabase();
    await recoverStaleSendingOutboxCommands();
    // A finished patrol the employee forgot to send is committed before the
    // pass, so it leaves in this same run even if the app was closed.
    await evaluateReportAutoSubmits().catch((error) => logMobileError("background.autosubmit.failed", error));
    const result = await runBackgroundOutboxSync();
    await runReportDeliveryNotices().catch((error) => logMobileError("background.report-notices.failed", error));

    await recordBackgroundSyncResult(result, attemptAt).catch((error) => {
      void logMobileError("background.sync.state-save.failed", error);
    });

    if (result.skipped !== null) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

    // Diagnostic uploads run on the foreground path. Background time belongs
    // to the user's reports; do not hold task completion for diagnostic media.
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    await recordBackgroundSyncResult("failed", attemptAt).catch((stateError) => {
      void logMobileError("background.sync.state-save.failed", stateError);
    });
    await logMobileError("background.sync.failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

if (!TaskManager.isTaskDefined(PATROL360_BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(PATROL360_BACKGROUND_SYNC_TASK, runBackgroundSyncTask);
}

export async function registerBackgroundSyncTask() {
  const [taskManagerAvailable, backgroundStatus] = await Promise.all([
    TaskManager.isAvailableAsync(),
    BackgroundTask.getStatusAsync()
  ]);

  if (!taskManagerAvailable || backgroundStatus !== BackgroundTask.BackgroundTaskStatus.Available) {
    return { registered: false, reason: "unavailable" as const };
  }

  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(PATROL360_BACKGROUND_SYNC_TASK);
  if (!alreadyRegistered) {
    await BackgroundTask.registerTaskAsync(PATROL360_BACKGROUND_SYNC_TASK, {
      minimumInterval: BACKGROUND_SYNC_NORMAL_INTERVAL_MINUTES
    });
  }

  return { registered: true, reason: null };
}

/**
 * Re-arms the OS run so it starts after `intervalMinutes` as soon as a network
 * is connected. On Android 8+ expo-background-task enqueues a one-time
 * WorkManager request (initial delay = interval, NetworkType.CONNECTED) and
 * re-enqueues it after each run, so re-registering is the only way to move
 * the next run earlier without a custom native module. The new interval also
 * applies to later runs until it is set back.
 */
export async function setBackgroundSyncInterval(intervalMinutes: number, options: { restart?: boolean } = {}) {
  const minutes = Math.min(Math.max(Math.ceil(intervalMinutes), 1), BACKGROUND_SYNC_NORMAL_INTERVAL_MINUTES);
  const [taskManagerAvailable, backgroundStatus] = await Promise.all([
    TaskManager.isAvailableAsync(),
    BackgroundTask.getStatusAsync()
  ]);
  if (!taskManagerAvailable || backgroundStatus !== BackgroundTask.BackgroundTaskStatus.Available) {
    return { changed: false, minutes };
  }

  if (await TaskManager.isTaskRegisteredAsync(PATROL360_BACKGROUND_SYNC_TASK)) {
    const current = await TaskManager.getTaskOptionsAsync<{ minimumInterval?: number } | null>(PATROL360_BACKGROUND_SYNC_TASK)
      .catch(() => null);
    if (current?.minimumInterval === minutes && !options.restart) {
      return { changed: false, minutes };
    }
    // Unregistering cancels the pending WorkManager request; registering
    // enqueues a fresh one with the new initial delay.
    await BackgroundTask.unregisterTaskAsync(PATROL360_BACKGROUND_SYNC_TASK);
  }
  await BackgroundTask.registerTaskAsync(PATROL360_BACKGROUND_SYNC_TASK, { minimumInterval: minutes });
  return { changed: true, minutes };
}
