import assert from "node:assert/strict";
import test from "node:test";

import { processOrderedOutboxBatch } from "../src/sync/orderedOutboxBatch.ts";

type Item = { id: string; dependency: string };

test("a poison attachment does not block unrelated commands", async () => {
  const processed: string[] = [];
  const items: Item[] = [
    { id: "bad-photo", dependency: "assignment-a" },
    { id: "same-assignment-complete", dependency: "assignment-a" },
    { id: "unrelated", dependency: "assignment-b" }
  ];

  const result = await processOrderedOutboxBatch(items, {
    getDependencyKey: (item) => item.dependency,
    isFatal: () => false,
    process: async (item) => {
      processed.push(item.id);
      if (item.id === "bad-photo") throw new Error("missing attachment");
    }
  });

  assert.deepEqual(processed, ["bad-photo", "unrelated"]);
  assert.deepEqual(result.failed.map((item) => item.id), ["bad-photo"]);
  assert.deepEqual(result.blocked.map((item) => item.id), ["same-assignment-complete"]);
  assert.deepEqual(result.succeeded.map((item) => item.id), ["unrelated"]);
});

test("fatal authorization errors stop the batch immediately", async () => {
  const processed: string[] = [];
  await assert.rejects(
    processOrderedOutboxBatch([{ id: "auth", dependency: "a" }, { id: "later", dependency: "b" }], {
      getDependencyKey: (item) => item.dependency,
      isFatal: (error) => error instanceof Error && error.message === "auth",
      process: async (item) => {
        processed.push(item.id);
        if (item.id === "auth") throw new Error("auth");
      }
    }),
    /auth/
  );
  assert.deepEqual(processed, ["auth"]);
});
