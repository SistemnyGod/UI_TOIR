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

test("retry backoff follows 15 seconds, 1 minute, 5 minutes, 15 minutes and 1 hour", () => {
  assert.deepEqual(
    retryDelaysMs.map((_, attempt) => getRetryDelayMs(attempt, 0.5)),
    [15_000, 60_000, 300_000, 900_000, 3_600_000]
  );
  assert.equal(getRetryDelayMs(99, 0.5), 3_600_000);
});

test("retry jitter stays within the configured 20 percent bounds", () => {
  assert.equal(getRetryDelayMs(0, 0), Math.round(15_000 * (1 - retryJitterRatio)));
  assert.equal(getRetryDelayMs(0, 1), Math.round(15_000 * (1 + retryJitterRatio)));
});