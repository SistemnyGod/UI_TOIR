import { strict as assert } from "node:assert";
import { test, vi } from "vitest";

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

vi.mock("expo-secure-store", () => secureStore);

import { getOfflineSession } from "../src/auth/tokenStorage";

test("legacy offline session without deviceTrusted remains trusted", async () => {
  secureStore.getItemAsync.mockResolvedValue(JSON.stringify({
    userId: "user-1",
    fullName: "Test User",
    lastOnlineLoginAt: "2026-07-23T00:00:00.000Z",
    expiresAt: "2026-01-01T00:00:00.000Z",
    contourId: "patrol360-local-enterprise"
  }));

  const session = await getOfflineSession();

  assert.ok(session);
  assert.equal(session.deviceTrusted, undefined);
});