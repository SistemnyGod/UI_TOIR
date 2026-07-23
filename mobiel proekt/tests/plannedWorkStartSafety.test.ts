import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("planned work start reuses the local session and retains the plan until server acceptance", async () => {
  const [workTaskSource, outboxSource] = await Promise.all([
    readFile(join(process.cwd(), "src/db/repositories/workTaskRepository.ts"), "utf8"),
    readFile(join(process.cwd(), "src/db/repositories/outboxRepository.ts"), "utf8")
  ]);
  const startFunction = workTaskSource.match(
    /export async function startPlannedWorkLocally[\s\S]*?\n}\n\nexport async function joinWorkTaskLocally/
  );

  assert.ok(startFunction, "startPlannedWorkLocally was not found.");
  assert.doesNotMatch(startFunction[0], /DELETE FROM work_tasks/);
  assert.match(
    startFunction[0],
    /item_kind = 'workSession'\s+AND plan_task_id = \?[\s\S]*?if \(existing\) \{\s*return existing\.taskId;/
  );
  assert.ok(
    startFunction[0].indexOf("if (existing)") < startFunction[0].indexOf("INSERT INTO work_tasks"),
    "Existing work session must be returned before a new row is inserted."
  );
  assert.match(
    outboxSource,
    /command\?\.command_type === "startPlannedWork"[\s\S]*?DELETE FROM work_tasks[\s\S]*?item_kind = 'planTask'[\s\S]*?SELECT plan_task_id/
  );
});
