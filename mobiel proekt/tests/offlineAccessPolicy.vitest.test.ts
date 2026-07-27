import { strict as assert } from "node:assert";
import { test } from "vitest";

import { evaluateOfflineAccess } from "../src/auth/offlineAccessPolicy";

test("offline session remains available after legacy expiry date", () => {
  const decision = evaluateOfflineAccess({
    userId: "user-1",
    fullName: "Test User",
    lastOnlineLoginAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-01T00:00:00.000Z",
    offlineExpiresAt: "2026-07-01T00:00:00.000Z",
    deviceTrusted: true,
    userBlockedAt: null,
    deviceBlockedAt: null
  }, { authenticationSatisfied: true });

  assert.equal(decision.mode, "full");
  assert.equal(decision.canOpenWorkTabs, true);
});
