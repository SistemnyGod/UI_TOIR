import assert from "node:assert/strict";
import test from "node:test";

import { canAttemptServerConnection } from "../src/core/networkPolicy.ts";

test("attempts configured LAN API when the device is connected but public Internet is unavailable", () => {
  assert.equal(canAttemptServerConnection({ isConnected: true }), true);
});

test("does not attempt server API without a network connection", () => {
  assert.equal(canAttemptServerConnection({ isConnected: false }), false);
  assert.equal(canAttemptServerConnection({ isConnected: null }), false);
});
