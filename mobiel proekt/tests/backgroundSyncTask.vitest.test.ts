import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runBackgroundOutboxSync: vi.fn(),
  pending: vi.fn(), owner: 'owner', generation: 1,
  recordBackgroundSyncResult: vi.fn(),
  triggerDailyDiagnosticReportUpload: vi.fn(),
  triggerPendingDiagnosticReportUpload: vi.fn()
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
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => mocks.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => mocks.generation }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/outboxRepository', () => ({ hasPendingOutboxCommands: mocks.pending }));
vi.mock("@/services/mobileErrorReporter", () => ({ logMobileError: vi.fn() }));
vi.mock("@/services/diagnosticReportService", () => ({
  triggerDailyDiagnosticReportUpload: mocks.triggerDailyDiagnosticReportUpload,
  triggerPendingDiagnosticReportUpload: mocks.triggerPendingDiagnosticReportUpload
}));
vi.mock("@/sync/syncEngine", () => ({
  recoverStaleSendingOutboxCommands: vi.fn(),
  runBackgroundOutboxSync: mocks.runBackgroundOutboxSync
}));
vi.mock("@/sync/backgroundSyncState", () => ({
  recordBackgroundSyncResult: mocks.recordBackgroundSyncResult
}));

import * as BackgroundTask from "expo-background-task";
import { runBackgroundSyncTask, syncPendingReportsOnBackground } from "@/sync/backgroundSyncTask";
beforeEach(() => {
  vi.resetAllMocks(); mocks.owner = 'owner'; mocks.generation = 1;
  mocks.recordBackgroundSyncResult.mockResolvedValue(undefined);
  mocks.pending.mockResolvedValue(true);
  mocks.runBackgroundOutboxSync.mockResolvedValue({ skipped: null, outcome: 'complete', hasMore: false });
});

describe("background sync result", () => {
  it("does not report success when foreground sync is server unavailable", async () => {
    mocks.recordBackgroundSyncResult.mockResolvedValue(undefined);

    mocks.runBackgroundOutboxSync.mockResolvedValue({
      sent: 0,
      skipped: "serverUnavailable",
      outcome: "skipped",
      hasMore: false
    });

    const result = await runBackgroundSyncTask();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    expect(mocks.runBackgroundOutboxSync).toHaveBeenCalledOnce();
    expect(mocks.recordBackgroundSyncResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipped: "serverUnavailable", outcome: "skipped" }),
      expect.any(String)
    );
    expect(mocks.triggerDailyDiagnosticReportUpload).not.toHaveBeenCalled();
  });
});

it('coalesces lifecycle and system task requests until report continuations finish', async () => {
  let finish!: (value: any) => void;
  mocks.runBackgroundOutboxSync.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = runBackgroundSyncTask();
  const second = syncPendingReportsOnBackground();
  await vi.waitFor(() => expect(mocks.runBackgroundOutboxSync).toHaveBeenCalledOnce());
  finish({ skipped: null, outcome: 'complete', hasMore: false });
  await expect(first).resolves.toBe('success');
  await second;
  expect(mocks.triggerDailyDiagnosticReportUpload).not.toHaveBeenCalled();
  expect(mocks.triggerPendingDiagnosticReportUpload).not.toHaveBeenCalled();
});

it('background transition with an empty queue does not start a network sync', async () => {
  mocks.pending.mockResolvedValue(false);
  await syncPendingReportsOnBackground();
  expect(mocks.runBackgroundOutboxSync).not.toHaveBeenCalled();
});

it('an account change during the pending check cannot hand off an old request', async () => {
  mocks.pending.mockImplementation(async () => { mocks.generation++; return true; });
  await expect(syncPendingReportsOnBackground()).rejects.toThrow('Устаревший');
  expect(mocks.runBackgroundOutboxSync).not.toHaveBeenCalled();
});
