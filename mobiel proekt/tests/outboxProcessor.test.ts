import assert from "node:assert/strict";
import test from "node:test";

import { selectNextOutboxCommands } from "../src/sync/outboxOrderingPolicy.ts";

function command(commandType: string, assignmentId: string, createdAtLocal: string) {
  return {
    id: `${assignmentId}-${commandType}-${createdAtLocal}`,
    assignmentId,
    commandType,
    createdAtLocal
  };
}

test("outbox advances one lifecycle step per patrol before later commands", () => {
  const selected = selectNextOutboxCommands([
    command("acceptPatrolRequest", "a", "2026-07-16T10:00:00.000Z"),
    command("startPatrolAssignment", "a", "2026-07-16T10:01:00.000Z"),
    command("scanPatrolPointNfc", "a", "2026-07-16T10:02:00.000Z"),
    command("startPatrolAssignment", "b", "2026-07-16T10:00:30.000Z")
  ], 25);

  assert.deepEqual(selected.map((item) => item.id), [
    "a-acceptPatrolRequest-2026-07-16T10:00:00.000Z",
    "b-startPatrolAssignment-2026-07-16T10:00:30.000Z"
  ]);
});
