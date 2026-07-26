import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  withProtectedExclusiveTransactionAsync: vi.fn(),
  getFirstAsync: vi.fn(),
  runAsync: vi.fn(),
  requestSyncAfterMutation: vi.fn(),
}));

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "local-result-1"),
}));
vi.mock("expo-sqlite", () => ({}));
vi.mock("@/core/environments", () => ({ currentContourId: "test-contour" }));
vi.mock("@/db/database", () => ({
  getDatabase: mocks.getDatabase,
  withProtectedExclusiveTransactionAsync: mocks.withProtectedExclusiveTransactionAsync,
}));
vi.mock("@/db/sqliteBusyRetry", () => ({
  withSqliteBusyRetry: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("@/sync/mutationSyncRequest", () => ({
  requestSyncAfterMutation: mocks.requestSyncAfterMutation,
}));

describe("point mutation sync request", () => {
  beforeEach(() => {
    mocks.getFirstAsync.mockReset().mockResolvedValue(undefined);
    mocks.runAsync.mockReset().mockResolvedValue(undefined);
    mocks.withProtectedExclusiveTransactionAsync.mockReset().mockImplementation(async (_db, operation) => operation({
      getFirstAsync: mocks.getFirstAsync,
      runAsync: mocks.runAsync,
    }));
    mocks.getDatabase.mockReset().mockResolvedValue({
      getFirstAsync: mocks.getFirstAsync,
      runAsync: mocks.runAsync,
    });
    mocks.requestSyncAfterMutation.mockReset();
  });

  it("requests sync once after a successful point result save", async () => {
    const { upsertPointResult } = await import("@/db/repositories/patrolPersistence");

    await upsertPointResult({
      ownerUserId: "owner-1",
      assignmentId: "assignment-1",
      pointId: "point-1",
      status: "ok",
      comment: "",
      issueTypeId: null,
      severity: null,
      deferredReason: null,
      completedAtLocal: new Date().toISOString(),
      syncStatus: "pending",
      confirmationType: "nfc",
      nfcUidHash: "uid-hash",
      scannedAtLocal: new Date().toISOString(),
      photoClientFileIds: [],
    });

    expect(mocks.requestSyncAfterMutation).toHaveBeenCalledTimes(1);
  });

  it("does not request sync for a localOnly point draft", async () => {
    const { upsertPointResult } = await import("@/db/repositories/patrolPersistence");

    await upsertPointResult({
      ownerUserId: "owner-1",
      assignmentId: "assignment-1",
      pointId: "point-1",
      status: "deferred",
      comment: "",
      issueTypeId: null,
      severity: null,
      deferredReason: "Fill later",
      completedAtLocal: null,
      syncStatus: "localOnly",
      confirmationType: "manual",
      nfcUidHash: null,
      scannedAtLocal: new Date().toISOString(),
      photoClientFileIds: [],
    });

    expect(mocks.requestSyncAfterMutation).not.toHaveBeenCalled();
    expect(mocks.runAsync.mock.calls.some(([sql]) => String(sql).includes("outbox_commands"))).toBe(false);
  });
});
