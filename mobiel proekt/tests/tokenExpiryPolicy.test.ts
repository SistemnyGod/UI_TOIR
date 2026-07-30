import assert from "node:assert/strict";
import test from "node:test";

import { shouldRefreshAccessToken } from "../src/auth/tokenExpiryPolicy.ts";

const now = Date.parse("2026-07-30T12:00:00.000Z");

test("access token is refreshed when it is expired or almost expired", () => {
  assert.equal(shouldRefreshAccessToken("2026-07-30T11:59:59.000Z", now), true);
  assert.equal(shouldRefreshAccessToken("2026-07-30T12:00:30.000Z", now), true);
  assert.equal(shouldRefreshAccessToken("2026-07-30T12:02:00.000Z", now), false);
});

test("legacy sessions without local expiry metadata are not locked out", () => {
  assert.equal(shouldRefreshAccessToken(null, now), false);
  assert.equal(shouldRefreshAccessToken(undefined, now), false);
  assert.equal(shouldRefreshAccessToken("not-a-date", now), false);
});
