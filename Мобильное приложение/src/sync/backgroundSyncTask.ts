import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import { initializeDatabase } from "@/db/database";
import { triggerDailyDiagnosticReportUpload } from "@/services/diagnosticReportService";
import { recoverStaleSendingOutboxCommands, runForegroundSync } from "@/sync/syncEngine";

export const PATROL360_BACKGROUND_SYNC_TASK = "patrol360-background-sync";

if (!TaskManager.isTaskDefined(PATROL360_BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(PATROL360_BACKGROUND_SYNC_TASK, async () => {
    try {
      await initializeDatabase();
      await recoverStaleSendingOutboxCommands();
      await runForegroundSync();
      await triggerDailyDiagnosticReportUpload();

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
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
