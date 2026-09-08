import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  blockingCount: 0,
  replacementCommitted: false,
  pendingTarget: null as string | null,
  envelopeOwner: "old-user" as string | null,
  failEnvelope: false,
  failCleanup: false,
  restoredOldSession: false
  , retryOwner: undefined as string | null | undefined
}));

vi.mock("@/api/authApi", () => ({
  login: vi.fn(async () => ({
    accessToken: "new-access", refreshToken: "new-refresh",
    expiresAt: "2030-01-01T00:00:00.000Z", refreshExpiresAt: "2030-02-01T00:00:00.000Z",
    contourId: "test-contour", user: { serverUserId: "new-user", fullName: "New User" },
    device: { trusted: true, blockedAt: null }
  })),
  logout: vi.fn(async () => undefined)
}));
vi.mock("@/auth/sessionErrors", () => ({ isReauthenticationRequiredError: () => false }));
vi.mock("@/api/httpClient", () => ({ beginAuthTransition: vi.fn(), refreshStoredAccessToken: vi.fn(async () => "refreshed-access") }));
vi.mock("@/api/mobileApi", () => ({ getBootstrap: vi.fn(async () => ({
  contourId: "test-contour", user: { serverUserId: "new-user", fullName: "New User" }, requestBoard: [], assignments: []
})) }));
vi.mock("@/auth/deviceRegistration", () => ({ getOrCreateDeviceId: vi.fn(async () => "device") }));
vi.mock("@/auth/appMetadata", () => ({ createLoginPayload: (x: unknown) => x, getAppRuntimeMetadata: () => ({}) }));
vi.mock("@/auth/tokenStorage", () => ({
  clearLocalSessionKeepingRefreshToken: vi.fn(), clearTokens: vi.fn(), getAccessToken: vi.fn(),
  getStoredOwnerUserId: vi.fn(async () => state.envelopeOwner),
  getStoredSessionSnapshot: vi.fn(async () => ({
    ownerUserId: state.envelopeOwner, accessToken: "refreshed-access", refreshToken: "refresh",
    accessExpiresAt: "2030-01-01", refreshExpiresAt: "2030-02-01", refreshOperationId: null,
    offlineSession: { userId: state.envelopeOwner, contourId: "test-contour", fullName: "User", lastOnlineLoginAt: "2026-01-01", expiresAt: "2030-02-01", offlineExpiresAt: "2030-02-01" }
  })),
  restoreStoredSessionSnapshot: vi.fn(async () => { state.restoredOldSession = true; }),
  setOfflineSession: vi.fn(), setStoredOwnerUserId: vi.fn(), setTokens: vi.fn(),
  storeSessionEnvelope: vi.fn(async (snapshot: { ownerUserId: string }) => {
    if (state.failEnvelope) throw new Error("secure store failed");
    state.envelopeOwner = snapshot.ownerUserId;
  })
}));
vi.mock("@/db/repositories/bootstrapRepository", () => ({
  clearLocalUserData: vi.fn(),
  countBlockingLocalUserData: vi.fn(async () => state.blockingCount),
  hasLocalUserData: vi.fn(async () => true), hasUnscopedLocalData: vi.fn(async () => false),
  getPendingAuthTransition: vi.fn(async () => state.pendingTarget ? {
    targetOwnerUserId: state.pendingTarget, contourId: "test-contour", startedAt: "2026-01-01"
  } : null),
  replaceLocalUserDataWithBootstrap: vi.fn(async () => { state.replacementCommitted = true; state.pendingTarget = "new-user"; }),
  saveBootstrap: vi.fn(),
  completePendingAuthTransition: vi.fn(async () => { state.pendingTarget = null; }),
  cleanupPreviousUserPhotos: vi.fn(async () => { if (state.failCleanup) throw new Error("cleanup failed"); })
}));
vi.mock("@/db/repositories/mobileActionLogRepository", () => ({ logMobileAction: vi.fn(async () => undefined) }));
vi.mock("@/db/repositories/logoutQueueRepository", () => ({ completePendingLogoutIntents: vi.fn(), enqueueLogoutIntent: vi.fn(), getPendingLogoutContourId: vi.fn(async () => undefined) }));
vi.mock("@/services/notificationService", () => ({ registerPushNotifications: vi.fn(async () => null), syncMobileNotifications: vi.fn(async () => []) }));
vi.mock("@/services/workTaskService", () => ({ syncWorkItems: vi.fn(async () => []) }));
vi.mock("@/sync/syncTriggers", () => ({ triggerForegroundSyncWithRetry: vi.fn() }));
vi.mock("@/sync/outboxRetryScheduler", () => ({ cancelNextOutboxRetry: vi.fn(), scheduleNextOutboxRetry: vi.fn(async (owner) => { state.retryOwner = owner; }) }));
vi.mock("@/core/environments", () => ({ currentContourId: "test-contour" }));

import { restoreSessionWithRefreshToken, signIn } from "@/auth/authService";

beforeEach(() => {
  state.blockingCount = 0; state.replacementCommitted = false; state.pendingTarget = null;
  state.envelopeOwner = "old-user"; state.failEnvelope = false; state.failCleanup = false; state.restoredOldSession = false;
  state.retryOwner = undefined;
});

describe("durable account transition", () => {
  it("never restores the old session after SQLite replacement committed", async () => {
    state.failEnvelope = true;
    await expect(signIn("new", "password")).rejects.toThrow("secure store failed");
    expect(state.replacementCommitted).toBe(true);
    expect(state.restoredOldSession).toBe(false);
    expect(state.pendingTarget).toBe("new-user");
    expect(state.retryOwner).toBeUndefined();
  });

  it("publishes and completes a replacement performed during refresh recovery", async () => {
    await expect(restoreSessionWithRefreshToken()).resolves.toBeTruthy();
    expect(state.replacementCommitted).toBe(true);
    expect(state.envelopeOwner).toBe("new-user");
    expect(state.pendingTarget).toBeNull();
  });

  it("finishes a durable transition for its target after restart", async () => {
    state.pendingTarget = "new-user"; state.envelopeOwner = null;
    await expect(signIn("new", "password")).resolves.toBeTruthy();
    expect(state.envelopeOwner).toBe("new-user");
    expect(state.pendingTarget).toBeNull();
  });

  it("does not roll back authorization when old photo cleanup fails", async () => {
    state.failCleanup = true;
    await expect(signIn("new", "password")).resolves.toBeTruthy();
    expect(state.envelopeOwner).toBe("new-user");
    expect(state.pendingTarget).toBeNull();
  });

  it("keeps the pending queue guard before replacement", async () => {
    state.blockingCount = 2;
    await expect(signIn("new", "password")).rejects.toThrow("Локальных незавершённых записей: 2");
    expect(state.replacementCommitted).toBe(false);
    expect(state.envelopeOwner).toBe("old-user");
  });
});
