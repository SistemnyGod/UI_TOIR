import assert from "node:assert/strict";
import test from "node:test";

import {
  getMobileActionLogRetentionCutoff,
  maxMobileActionLogEntriesPerOwner,
  mobileActionLogRetentionDays
} from "../src/services/mobileActionLogRetention.ts";

test("action-log retention keeps a bounded 30-day diagnostic window", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(getMobileActionLogRetentionCutoff(now), "2026-06-15T12:00:00.000Z");
  assert.equal(mobileActionLogRetentionDays, 30);
  assert.equal(maxMobileActionLogEntriesPerOwner, 2_000);
});
