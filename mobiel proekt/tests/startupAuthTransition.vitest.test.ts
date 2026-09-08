import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ storedOwner: "old-user" as string | null, storedContour: "test-contour", cleared: false, completed: false }));

vi.mock("@/db/database", () => ({ initializeDatabase: vi.fn(async () => undefined) }));
vi.mock("@/db/repositories/bootstrapRepository", () => ({
  getPendingAuthTransition: vi.fn(async () => ({ targetOwnerUserId: "new-user", contourId: "test-contour", startedAt: "2026-01-01" })),
  completePendingAuthTransition: vi.fn(async () => { state.completed = true; })
}));
vi.mock("@/auth/tokenStorage", () => ({
  getStoredOwnerUserId: vi.fn(async () => state.storedOwner),
  getStoredSessionSnapshot: vi.fn(async () => ({
    ownerUserId: state.storedOwner, accessToken: "access", refreshToken: "refresh",
    accessExpiresAt: null, refreshExpiresAt: null, refreshOperationId: null,
    offlineSession: state.storedOwner ? { userId: state.storedOwner, contourId: state.storedContour } : null
  })),
  clearTokens: vi.fn(async () => { state.cleared = true; state.storedOwner = null; })
}));
vi.mock("@/db/repositories/filesRepository", () => ({ listKnownLocalFilePaths: vi.fn(async () => []) }));
vi.mock("@/db/repositories/mobileActionLogRepository", () => ({ pruneMobileActionLog: vi.fn() }));
vi.mock("@/services/fileStorageService", () => ({ deleteOrphanPatrolPhotos: vi.fn() }));
vi.mock("@/services/localMediaReclamationService", () => ({ reclaimAcceptedLocalMedia: vi.fn() }));
vi.mock("@/sync/syncEngine", () => ({
  recoverSendingOutboxCommandsAfterProcessRestart: vi.fn(), recoverStaleSendingOutboxCommands: vi.fn()
}));

import { bootstrapApplication } from "@/core/bootstrap";

beforeEach(() => { state.storedOwner = "old-user"; state.storedContour = "test-contour"; state.cleared = false; state.completed = false; });

describe("startup account transition recovery", () => {
  it("removes an old session while a transition to another owner is pending", async () => {
    await bootstrapApplication();
    expect(state.cleared).toBe(true);
    expect(state.completed).toBe(false);
  });

  it("accepts a fully published target session and clears its marker", async () => {
    state.storedOwner = "new-user";
    await bootstrapApplication();
    expect(state.cleared).toBe(false);
    expect(state.completed).toBe(true);
  });

  it("rejects the same owner when the stored session belongs to another contour", async () => {
    state.storedOwner = "new-user";
    state.storedContour = "old-contour";
    await bootstrapApplication();
    expect(state.cleared).toBe(true);
    expect(state.completed).toBe(false);
  });
});
