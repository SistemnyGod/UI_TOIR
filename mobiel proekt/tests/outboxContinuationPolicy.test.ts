import assert from "node:assert/strict";
import test from "node:test";

import { shouldContinueOutboxSync } from "../src/sync/outboxContinuationPolicy.ts";
import { getRetryDelayMs, retryDelaysMs, retryJitterRatio } from "../src/sync/retryPolicy.ts";

test("continues after the bounded foreground sync limit when commands remain", () => {
  assert.equal(shouldContinueOutboxSync(4, 4, true), true);
});

test("does not schedule another pass before the limit or after the queue is drained", () => {
  assert.equal(shouldContinueOutboxSync(3, 4, true), false);
  assert.equal(shouldContinueOutboxSync(4, 4, false), false);
});

test("retry backoff follows 30, 60, 120, 300 seconds and then 15 minutes", () => {
  assert.deepEqual(
    retryDelaysMs.map((_, attempt) => getRetryDelayMs(attempt, 0.5)),
    [30_000, 60_000, 120_000, 300_000, 900_000]
  );
  assert.equal(getRetryDelayMs(99, 0.5), 900_000);
});

test("retry jitter stays within the configured 20 percent bounds", () => {
  assert.equal(getRetryDelayMs(0, 0), Math.round(30_000 * (1 - retryJitterRatio)));
  assert.equal(getRetryDelayMs(0, 1), Math.round(30_000 * (1 + retryJitterRatio)));
});