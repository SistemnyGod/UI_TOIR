import { describe, expect, it } from "vitest";

import { processOrderedOutboxBatch } from "@/sync/orderedOutboxBatch";

describe("aggregate outbox sync", () => {
  it("keeps report A retryLater while report B succeeds", async () => {
    const states = new Map([
      ["assignment-A", "pending"],
      ["assignment-B", "pending"]
    ]);

    const result = await processOrderedOutboxBatch(
      [
        { aggregate: "patrolAssignment:assignment-A", assignmentId: "assignment-A" },
        { aggregate: "patrolAssignment:assignment-B", assignmentId: "assignment-B" }
      ],
      {
        getDependencyKey: (item) => item.aggregate,
        isFatal: () => false,
        process: async (item) => {
          if (item.assignmentId === "assignment-A") {
            states.set(item.assignmentId, "retryLater");
            throw new Error("missing attachment");
          }
          states.set(item.assignmentId, "accepted");
        }
      }
    );

    expect(states.get("assignment-A")).toBe("retryLater");
    expect(states.get("assignment-B")).toBe("accepted");
    expect(result.failed).toHaveLength(1);
    expect(result.succeeded).toHaveLength(1);
  });
});