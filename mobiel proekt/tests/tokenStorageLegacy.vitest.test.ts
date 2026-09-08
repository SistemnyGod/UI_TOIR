import { strict as assert } from "node:assert";
import { test, vi } from "vitest";

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

vi.mock("expo-secure-store", () => secureStore);
vi.mock("expo-crypto", () => ({ randomUUID: vi.fn() }));

import { getOfflineSession, getStoredOwnerUserId } from "../src/auth/tokenStorage";

test("legacy offline session without deviceTrusted remains trusted", async () => {
  const legacySession = JSON.stringify({
    userId: "user-1",
    fullName: "Test User",
    lastOnlineLoginAt: "2026-07-23T00:00:00.000Z",
    expiresAt: "2026-01-01T00:00:00.000Z",
    contourId: "patrol360-local-enterprise"
  });
  secureStore.getItemAsync.mockImplementation(async (key: string) => key === "patrol360.offlineSession" ? legacySession : null);

  const session = await getOfflineSession();

  assert.ok(session);
  assert.equal(session.deviceTrusted, undefined);
});

test("a corrupt versioned envelope fails closed instead of reviving legacy owner keys", async () => {
  secureStore.getItemAsync.mockImplementation(async (key: string) => {
    if (key === "patrol360.session.v1") return "{corrupt";
    if (key === "patrol360.ownerUserId") return "old-user";
    return null;
  });

  assert.equal(await getStoredOwnerUserId(), null);
});
