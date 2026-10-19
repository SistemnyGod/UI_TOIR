import assert from "node:assert/strict";
import test from "node:test";

import { shouldContinueOutboxSync } from "../src/sync/outboxContinuationPolicy.ts";
import { resolveRetryDelaySeconds, resolveServerUnreachableDelaySeconds } from "../src/sync/outboxRetryPolicy.ts";

test("continues after the bounded foreground sync limit when commands remain", () => {
  assert.equal(shouldContinueOutboxSync(4, 4, true), true);
});

test("does not schedule another pass before the limit or after the queue is drained", () => {
  assert.equal(shouldContinueOutboxSync(3, 4, true), false);
  assert.equal(shouldContinueOutboxSync(4, 4, false), false);
});

const middle = () => 0.5;

test("transient failures retry after 5, 10, 20, 40 seconds and then every minute", () => {
  for (const reason of ["network", "timeout", "server", "rateLimit"] as const) {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 40].map(attempt => resolveRetryDelaySeconds(null, attempt, reason, middle)),
      [5, 10, 20, 40, 60, 60, 60]
    );
  }
});

test("an unexplained failure keeps the patient 30 s to 15 min schedule", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 99].map(attempt => resolveRetryDelaySeconds(null, attempt, "unknown", middle)),
    [30, 60, 120, 300, 900, 900]
  );
  assert.equal(resolveRetryDelaySeconds(null, 1, null, middle), 30);
});

test("jitter spreads retries by at most 20 percent in both directions", () => {
  assert.equal(resolveRetryDelaySeconds(null, 5, "network", () => 0), 48);
  assert.equal(resolveRetryDelaySeconds(null, 5, "network", () => 1), 72);
  assert.equal(resolveRetryDelaySeconds(null, 1, "network", () => 0), 4);
  assert.equal(resolveRetryDelaySeconds(null, 1, "network", () => Number.NaN), 5);
  const samples = new Set(Array.from({ length: 200 }, () => resolveRetryDelaySeconds(null, 5, "server")));
  assert.ok(samples.size > 1, "delays must not be identical across phones");
  for (const delay of samples) assert.ok(delay >= 48 && delay <= 72, `delay ${delay} outside ±20 %`);
});

test("server retry hints are honored without jitter, bounded, and never trigger an immediate repeated batch", () => {
  assert.equal(resolveRetryDelaySeconds(0, 1, "rateLimit", () => 0), 1);
  assert.equal(resolveRetryDelaySeconds(120, 1, "server", () => 0), 120);
  assert.equal(resolveRetryDelaySeconds(120, 9, "server", () => 1), 120);
  assert.equal(resolveRetryDelaySeconds(48 * 60 * 60, 1), 24 * 60 * 60);
});

test("a failed health check waits about 30 s for the connection monitor", () => {
  assert.equal(resolveServerUnreachableDelaySeconds(middle), 30);
  assert.equal(resolveServerUnreachableDelaySeconds(() => 0), 24);
  assert.equal(resolveServerUnreachableDelaySeconds(() => 1), 36);
});
