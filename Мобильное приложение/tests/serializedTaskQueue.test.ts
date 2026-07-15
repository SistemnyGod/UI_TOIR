import assert from "node:assert/strict";
import test from "node:test";

import { SerializedTaskQueue } from "../src/sync/serializedTaskQueue.ts";

test("a sync request received during an active pass is executed afterwards", async () => {
  const queue = new SerializedTaskQueue<string>();
  const calls: string[] = [];
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    calls.push("first:start");
    await firstBlocked;
    calls.push("first:end");
    return "first";
  });
  const second = queue.run(async () => {
    calls.push("second");
    return "second";
  });

  await Promise.resolve();
  assert.deepEqual(calls, ["first:start"]);

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(calls, ["first:start", "first:end", "second"]);
});

test("a failed pass does not discard the next requested pass", async () => {
  const queue = new SerializedTaskQueue<string>();
  const first = queue.run(async () => {
    throw new Error("network failed");
  });
  const second = queue.run(async () => "recovered");

  await assert.rejects(first, /network failed/);
  assert.equal(await second, "recovered");
});
