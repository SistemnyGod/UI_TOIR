import { describe, expect, it } from "vitest";

import { getCommandAssignmentId, selectNextOutboxCommands } from "@/sync/outboxOrderingPolicy";

type TestCommand = {
  commandType: string;
  entityLocalId: string | null;
  payload: Record<string, unknown>;
  createdAtLocal: string;
  assignmentId: string | null;
  sequenceNo?: number;
  clientOperationId?: string;
};

function command(commandType: string, assignmentId: string, createdAtLocal: string, payload: Record<string, unknown> = {}): TestCommand {
  const base = { commandType, entityLocalId: assignmentId, payload, createdAtLocal };
  return { ...base, assignmentId: getCommandAssignmentId(base) };
}

describe("outbox ordering by patrol assignment", () => {
  it("keeps accept before start for one assignment and preserves independent aggregates", () => {
    const selected = selectNextOutboxCommands([
      command("acceptPatrolRequest", "assignment-A", "2026-07-25T10:00:00.000Z"),
      command("startPatrolAssignment", "assignment-A", "2026-07-25T10:01:00.000Z"),
      command("scanPatrolPointNfc", "assignment-A", "2026-07-25T10:02:00.000Z", { assignmentId: "assignment-A" }),
      command("startPatrolAssignment", "assignment-B", "2026-07-25T10:00:30.000Z")
    ], 25);

    expect(selected.map((item) => item.commandType + ":" + item.assignmentId)).toEqual([
      "acceptPatrolRequest:assignment-A",
      "startPatrolAssignment:assignment-B"
    ]);
    expect(selected.some((item) => item.commandType === "startPatrolAssignment" && item.assignmentId === "assignment-A")).toBe(false);

    const nextPass = selectNextOutboxCommands([
      command("startPatrolAssignment", "assignment-A", "2026-07-25T10:01:00.000Z")
    ], 25);
    expect(nextPass[0]?.commandType).toBe("startPatrolAssignment");
  });
  it("uses sequenceNo as a stable FIFO tie-breaker", () => {
    const selected = selectNextOutboxCommands([
      { ...command("startPatrolAssignment", "assignment-A", "2026-07-25T11:00:00.000Z"), sequenceNo: 2, clientOperationId: "op-2" },
      { ...command("acceptPatrolRequest", "assignment-A", "2026-07-25T11:00:00.000Z"), sequenceNo: 1, clientOperationId: "op-1" }
    ], 25);

    expect(selected[0]?.commandType).toBe("acceptPatrolRequest");
    expect(selected[0]?.sequenceNo).toBe(1);
  });
});