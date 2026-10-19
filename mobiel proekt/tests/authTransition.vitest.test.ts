import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  blockingCount: 0,
  replacementCommitted: false,
  pendingTarget: null as string | null,
  envelopeOwner: "old-user" as string | null,
  failEnvelope: false,
  failCleanup: false,
  restoredOldSession: false
  , retryOwner: undefined as string | null | undefined,
  wipes: 0,
  signOutWipes: [] as (string | null)[],
  traceWipes: [] as (string | null)[]
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
  completePendingAuthTransition: vi.fn(async () => { state.pendingTarget = null; })
}));
vi.mock("@/services/accountDataWipe", () => ({
  wipeSignedOutAccountData: vi.fn(async (owner: string | null) => { state.signOutWipes.push(owner); return []; }),
  wipeAccountDeviceTraces: vi.fn(async (owner: string | null) => {
    if (state.failCleanup) throw new Error("cleanup failed");
    state.traceWipes.push(owner);
    return [];
  })
}));
vi.mock("@/db/repositories/mobileActionLogRepository", () => ({ logMobileAction: vi.fn(async () => undefined) }));
vi.mock("@/db/repositories/logoutQueueRepository", () => ({ completePendingLogoutIntents: vi.fn(), enqueueLogoutIntent: vi.fn(), getPendingLogoutContourId: vi.fn(async () => undefined) }));
vi.mock("@/services/notificationService", () => ({ registerPushNotifications: vi.fn(async () => null), syncMobileNotifications: vi.fn(async () => []) }));
vi.mock("@/services/workTaskService", () => ({ syncWorkItems: vi.fn(async () => []), syncWorkTasks: vi.fn(async () => []) }));
vi.mock("@/sync/syncTriggers", () => ({ triggerForegroundSyncWithRetry: vi.fn() }));
vi.mock("@/sync/outboxRetryScheduler", () => ({ cancelNextOutboxRetry: vi.fn(), scheduleNextOutboxRetry: vi.fn(async (owner) => { state.retryOwner = owner; }) }));
vi.mock("@/core/environments", () => ({ currentContourId: "test-contour" }));
vi.mock("@/auth/rememberedCredentials", () => ({ wipeRememberedCredentials: vi.fn(async () => { state.wipes += 1; }) }));

import { restoreSessionWithRefreshToken, signIn, signOut } from "@/auth/authService";
import { login } from "@/api/authApi";
import { getBootstrap } from "@/api/mobileApi";
import { syncWorkItems, syncWorkTasks } from "@/services/workTaskService";

beforeEach(() => {
  state.blockingCount = 0; state.replacementCommitted = false; state.pendingTarget = null;
  state.envelopeOwner = "old-user"; state.failEnvelope = false; state.failCleanup = false; state.restoredOldSession = false;
  state.retryOwner = undefined; state.wipes = 0; state.signOutWipes = []; state.traceWipes = [];
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

  it("serializes overlapping logins through database and session publication", async () => {
    let finish!: () => void;
    const normal = vi.mocked(login).getMockImplementation()!;
    vi.mocked(login).mockClear().mockImplementationOnce(async (...args) => {
      await new Promise<void>(resolve => { finish = resolve; });
      return normal(...args);
    });
    const first = signIn("first", "password");
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const second = signIn("second", "password");
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(login).toHaveBeenCalledTimes(1);
    finish(); await first; await second;
    expect(login).toHaveBeenCalledTimes(2);
    expect(state.pendingTarget).toBeNull();
    expect(state.envelopeOwner).toBe("new-user");
  });

  it("refuses a login bootstrap for another user before touching local data", async () => {
    vi.mocked(getBootstrap).mockResolvedValueOnce({ contourId: "test-contour", user: { serverUserId: "unexpected-user" } } as any);
    await expect(signIn("new", "password")).rejects.toThrow("другому пользователю");
    expect(state.replacementCommitted).toBe(false);
    expect(state.envelopeOwner).toBe("old-user");
    await expect(signIn("new", "password")).resolves.toBeTruthy();
  });
});

describe("remembered credentials lifecycle", () => {
  it("wipes the saved pair when another account replaces local data", async () => {
    await expect(signIn("new", "password")).resolves.toBeTruthy();
    expect(state.wipes).toBe(1);
  });

  it("keeps the saved pair when the same account signs in again", async () => {
    state.envelopeOwner = "new-user";
    await expect(signIn("new", "password")).resolves.toBeTruthy();
    expect(state.wipes).toBe(0);
  });

  it("wipes the saved pair when refresh recovery switches the account", async () => {
    await expect(restoreSessionWithRefreshToken()).resolves.toBeTruthy();
    expect(state.wipes).toBe(1);
  });

  it("keeps a ticked saved pair on sign-out for the next shift login", async () => {
    await signOut();
    expect(state.wipes).toBe(0);
  });
});

describe("sign-out data wipe", () => {
  it("wipes the signed-out owner's data, but nothing while unsent work blocks sign-out", async () => {
    state.blockingCount = 1;
    await expect(signOut()).rejects.toThrow("Нельзя выйти");
    expect(state.signOutWipes).toEqual([]);
    state.blockingCount = 0;
    await expect(signOut()).resolves.toBe(true);
    expect(state.signOutWipes).toEqual(["old-user"]);
  });

  it("removes the previous owner's files and notices when another account replaces local data", async () => {
    await expect(signIn("new", "password")).resolves.toBeTruthy();
    expect(state.traceWipes).toEqual(["old-user"]);
    state.traceWipes = [];
    state.envelopeOwner = "new-user";
    await expect(signIn("new", "password")).resolves.toBeTruthy();
    expect(state.traceWipes).toEqual([]);
  });
});

describe("work items after authorization", () => {
  it("sign-in and refresh recovery download work items through the v2 work item sync", async () => {
    vi.mocked(syncWorkItems).mockClear(); vi.mocked(syncWorkTasks).mockClear();
    await signIn("new", "password");
    expect(syncWorkItems).toHaveBeenCalledWith();
    vi.mocked(syncWorkItems).mockClear();
    await restoreSessionWithRefreshToken();
    expect(syncWorkItems).toHaveBeenCalledWith();
    expect(syncWorkTasks).not.toHaveBeenCalled();
  });
});
