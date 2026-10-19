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

export const PATROL360_BACKGROUND_SYNC_TASK = "patrol360-background-sync";

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
    const result = await runBackgroundOutboxSync();

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
      minimumInterval: 15
    });
  }

  return { registered: true, reason: null };
}
