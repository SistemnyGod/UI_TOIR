import assert from "node:assert/strict";
import test from "node:test";

import { getAssignmentCommandIds } from "../src/db/repositories/patrolCancellationPolicy.ts";

test("server cancellation supersedes only commands of the cancelled assignment", () => {
  const ids = getAssignmentCommandIds(
    [
      {
        clientOperationId: "start-cancelled",
        entityLocalId: "assignment-cancelled",
        entityServerId: null,
        payloadJson: "{}"
      },
      {
        clientOperationId: "point-cancelled",
        entityLocalId: "point-1",
        entityServerId: null,
        payloadJson: JSON.stringify({ assignmentId: "assignment-cancelled", pointId: "point-1" })
      },
      {
        clientOperationId: "other-assignment",
        entityLocalId: "point-2",
        entityServerId: null,
        payloadJson: JSON.stringify({ assignmentId: "assignment-active", pointId: "point-2" })
      }
    ],
    "assignment-cancelled"
  );

  assert.deepEqual(ids, ["start-cancelled", "point-cancelled"]);
});