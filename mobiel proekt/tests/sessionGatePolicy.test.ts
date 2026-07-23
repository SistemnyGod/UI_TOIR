import assert from "node:assert/strict";
import test from "node:test";

import { resolveSessionRestoreDecision } from "../src/auth/sessionRestorePolicy.ts";

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
test("active local session resumes directly into the protected app", () => {
  assert.equal(resolveSessionRestoreDecision({
    accessToken: "access-token",
    ownerUserId: "user-1",
    offlineSession: {
      userId: "user-1",
      contourId: "patrol360-local-enterprise",
      fullName: "Иванов И.И.",
      lastOnlineLoginAt: "2026-07-23T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z"
    },
    contourId: "patrol360-local-enterprise"
  }), "resume");
});

test("stored local session without access token uses offline unlock", () => {
  assert.equal(resolveSessionRestoreDecision({
    accessToken: null,
    ownerUserId: "user-1",
    offlineSession: {
      userId: "user-1",
      contourId: "patrol360-local-enterprise",
      fullName: "Иванов И.И.",
      lastOnlineLoginAt: "2026-07-23T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z"
    },
    contourId: "patrol360-local-enterprise"
  }), "offline-unlock");
});

test("missing or cross-contour local session requires online login", () => {
  assert.equal(resolveSessionRestoreDecision({
    accessToken: "access-token",
    ownerUserId: "user-1",
    offlineSession: {
      userId: "user-1",
      contourId: "patrol360-other",
      fullName: "Иванов И.И.",
      lastOnlineLoginAt: "2026-07-23T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z"
    },
    contourId: "patrol360-local-enterprise"
  }), "login");
});
