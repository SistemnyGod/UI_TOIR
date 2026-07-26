import { strict as assert } from "node:assert";
import { test } from "vitest";

import { evaluateOfflineAccess } from "../src/auth/offlineAccessPolicy";

test("expired offline session does not open work tabs", () => {
  const decision = evaluateOfflineAccess({
    userId: "user-1",
    fullName: "Test User",
    lastOnlineLoginAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-01T00:00:00.000Z",
    offlineExpiresAt: "2026-07-01T00:00:00.000Z",
    deviceTrusted: true,
    userBlockedAt: null,
    deviceBlockedAt: null
  }, {
    now: new Date("2026-07-26T00:00:00.000Z"),
    authenticationSatisfied: true
  });

  assert.equal(decision.mode, "emergency");
  assert.equal(decision.canOpenWorkTabs, false);
});
