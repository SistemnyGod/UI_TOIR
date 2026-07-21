import assert from "node:assert/strict";
import test from "node:test";

import { assertSessionOwner } from "../src/auth/sessionIdentity.ts";
import { isReauthenticationRequiredError, isSessionExpiredError } from "../src/auth/sessionErrors.ts";
import { isOfflineSessionValid } from "../src/auth/offlineSession.ts";
import { assertRecordsBelongToOwner } from "../src/sync/ownerIsolation.ts";

test("refresh accepts the stored account and binds a legacy session once", () => {
  assert.doesNotThrow(() => assertSessionOwner("user-a", "user-a"));
  assert.doesNotThrow(() => assertSessionOwner(null, "user-a"));
  assert.throws(() => assertSessionOwner("user-a", "user-b"), /другого пользователя/);
  assert.throws(() => assertSessionOwner("user-a", undefined), /другого пользователя/);
});

test("only explicit revocation forces re-authentication", () => {
  assert.equal(isSessionExpiredError("Session revoked by administrator"), true);
  assert.equal(isSessionExpiredError("Device revoked"), true);
  assert.equal(isSessionExpiredError("Mobile session is invalid"), true);
  assert.equal(isSessionExpiredError("Mobile API temporarily rejected the request after token refresh"), false);
  assert.equal(isReauthenticationRequiredError("session owner mismatch"), true);
  assert.equal(isReauthenticationRequiredError("Server temporarily unavailable"), false);
});

test("sync refuses a mixed-owner batch", () => {
  assert.deepEqual(
    assertRecordsBelongToOwner("user-a", [{ ownerUserId: "user-a", id: 1 }]),
    [{ ownerUserId: "user-a", id: 1 }]
  );
  assert.throws(
    () => assertRecordsBelongToOwner("user-a", [
      { ownerUserId: "user-a" },
      { ownerUserId: "user-b" }
    ]),
    /другого пользователя/
  );
});

test("offline access remains available until explicit revocation", () => {
  const session = {
    userId: "user-a",
    fullName: "Илья",
    lastOnlineLoginAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-08T00:00:00.000Z"
  };

  assert.equal(isOfflineSessionValid(session), true);
  assert.equal(isOfflineSessionValid({ ...session, revokedAt: "2026-07-08T00:00:00.000Z" }), false);
});
