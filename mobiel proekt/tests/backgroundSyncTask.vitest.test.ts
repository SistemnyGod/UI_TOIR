import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runForegroundSync: vi.fn(),
  recordBackgroundSyncResult: vi.fn(),
  triggerDailyDiagnosticReportUpload: vi.fn()
}));

vi.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: "success", Failed: "failed" },
  BackgroundTaskStatus: { Available: "available" },
  getStatusAsync: vi.fn(),
  registerTaskAsync: vi.fn()
}));

vi.mock("expo-task-manager", () => ({
  isTaskDefined: vi.fn(() => true),
  defineTask: vi.fn(),
  isAvailableAsync: vi.fn(),
  isTaskRegisteredAsync: vi.fn()
}));

vi.mock("@/db/database", () => ({ initializeDatabase: vi.fn() }));
vi.mock("@/services/mobileErrorReporter", () => ({ logMobileError: vi.fn() }));
vi.mock("@/services/diagnosticReportService", () => ({
  triggerDailyDiagnosticReportUpload: mocks.triggerDailyDiagnosticReportUpload
}));
vi.mock("@/sync/syncEngine", () => ({
  recoverStaleSendingOutboxCommands: vi.fn(),
  runForegroundSync: mocks.runForegroundSync
}));
vi.mock("@/sync/backgroundSyncState", () => ({
  recordBackgroundSyncResult: mocks.recordBackgroundSyncResult
}));

import * as BackgroundTask from "expo-background-task";
import { runBackgroundSyncTask } from "@/sync/backgroundSyncTask";

describe("background sync result", () => {
  it("does not report success when foreground sync is server unavailable", async () => {
    mocks.recordBackgroundSyncResult.mockResolvedValue(undefined);

    mocks.runForegroundSync.mockResolvedValue({
      sent: 0,
      skipped: "serverUnavailable",
      hasMore: false
    });

    const result = await runBackgroundSyncTask();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    expect(mocks.recordBackgroundSyncResult).toHaveBeenCalledWith("serverUnavailable", expect.any(String));
    expect(mocks.triggerDailyDiagnosticReportUpload).not.toHaveBeenCalled();
  });
});