import assert from "node:assert/strict";
import test from "node:test";

import { mapWithConcurrency } from "../src/sync/boundedAsync.ts";

test("bounded async mapper caps concurrency and preserves input order", async () => {
  let active = 0;
  let peak = 0;

  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, value === 1 ? 10 : 1));
    active -= 1;
    return value * 10;
  });

  assert.equal(peak, 2);
  assert.deepEqual(result, [10, 20, 30, 40, 50]);
});

test("bounded async mapper rejects an invalid concurrency limit", async () => {
  await assert.rejects(mapWithConcurrency([1], 0, async (value) => value), /positive integer/);
});
