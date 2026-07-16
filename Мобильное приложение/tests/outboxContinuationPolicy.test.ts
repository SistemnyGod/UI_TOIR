import assert from "node:assert/strict";
import test from "node:test";

import { shouldContinueOutboxSync } from "../src/sync/outboxContinuationPolicy.ts";

test("continues after the bounded foreground sync limit when commands remain", () => {
  assert.equal(shouldContinueOutboxSync(4, 4, true), true);
});

test("does not schedule another pass before the limit or after the queue is drained", () => {
  assert.equal(shouldContinueOutboxSync(3, 4, true), false);
  assert.equal(shouldContinueOutboxSync(4, 4, false), false);
});
