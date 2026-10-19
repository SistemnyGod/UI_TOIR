import assert from "node:assert/strict";
import test from "node:test";

import { shouldContinueOutboxSync } from "../src/sync/outboxContinuationPolicy.ts";
import { resolveRetryDelaySeconds } from "../src/sync/outboxRetryPolicy.ts";

test("continues after the bounded foreground sync limit when commands remain", () => {
  assert.equal(shouldContinueOutboxSync(4, 4, true), true);
});

test("does not schedule another pass before the limit or after the queue is drained", () => {
  assert.equal(shouldContinueOutboxSync(3, 4, true), false);
  assert.equal(shouldContinueOutboxSync(4, 4, false), false);
});

test("retry backoff follows 30, 60, 120, 300 seconds and then 15 minutes", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(attempt => resolveRetryDelaySeconds(null, attempt)),
    [30, 60, 120, 300, 900]
  );
  assert.equal(resolveRetryDelaySeconds(null, 99), 900);
});

test("server retry hints remain bounded and never trigger an immediate repeated batch", () => {
  assert.equal(resolveRetryDelaySeconds(0, 1), 1);
  assert.equal(resolveRetryDelaySeconds(48 * 60 * 60, 1), 24 * 60 * 60);
});
