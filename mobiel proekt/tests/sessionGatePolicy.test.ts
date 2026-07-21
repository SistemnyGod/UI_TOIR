import assert from "node:assert/strict";
import test from "node:test";

import {
  consumePendingSessionRoute,
  isSessionUnlocked,
  lockSession,
  markSessionUnlocked,
  setPendingSessionRoute
} from "../src/auth/sessionGateState.ts";

test("session gate only keeps local protected routes as a return target", () => {
  setPendingSessionRoute("/patrol/request/request-1");
  assert.equal(consumePendingSessionRoute(), "/patrol/request/request-1");

  setPendingSessionRoute("https://attacker.example/redirect");
  assert.equal(consumePendingSessionRoute(), null);
});

test("session gate can be locked after token revocation", () => {
  lockSession();
  assert.equal(isSessionUnlocked(), false);

  markSessionUnlocked();
  assert.equal(isSessionUnlocked(), true);

  lockSession();
  assert.equal(isSessionUnlocked(), false);
});

