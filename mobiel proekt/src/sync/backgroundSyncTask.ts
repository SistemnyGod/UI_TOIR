import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { initializeDatabase } from "@/db/database";
import { logMobileError } from "@/services/mobileErrorReporter";
import { triggerDailyDiagnosticReportUpload } from "@/services/diagnosticReportService";
import { triggerPendingDiagnosticReportUpload } from "@/services/diagnosticReportService";
import { recoverStaleSendingOutboxCommands, runForegroundSync } from "@/sync/syncEngine";
import { recordBackgroundSyncResult } from "@/sync/backgroundSyncState";

export const PATROL360_BACKGROUND_SYNC_TASK = "patrol360-background-sync";

export async function runBackgroundSyncTask() {
  const attemptAt = new Date().toISOString();
  await recordBackgroundSyncResult("failed", attemptAt).catch((error) => {
    void logMobileError("background.sync.state-save.failed", error);
  });

  try {
    await initializeDatabase();
    await recoverStaleSendingOutboxCommands();
    const result = await runForegroundSync();

    await recordBackgroundSyncResult(result, attemptAt).catch((error) => {
      void logMobileError("background.sync.state-save.failed", error);
    });

    await triggerPendingDiagnosticReportUpload();
    if (result.skipped !== null) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

    await triggerDailyDiagnosticReportUpload();
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