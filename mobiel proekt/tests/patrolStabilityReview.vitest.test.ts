import { describe, expect, it } from "vitest";

import { resolveRemappedAssignmentStatus } from "@/domain/patrol/assignmentIdentityPolicy";
import { validatePatrolCompletionPayload } from "@/domain/patrol/completionPayloadPolicy";
import { evaluateReportPointReadiness } from "@/domain/patrol/reportReadinessPolicy";

describe("patrol stability review", () => {
  it("does not allow an optional unfinished point to produce a report", () => {
    const readiness = evaluateReportPointReadiness([
      { pointId: "required", pointName: "Первая", orderIndex: 1, required: true, status: "ok" },
      { pointId: "optional", pointName: "Вторая", orderIndex: 2, required: false, status: "pending" }
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.problems).toHaveLength(1);
    expect(readiness.problems[0]?.pointId).toBe("optional");
  });

  it("rejects an empty or partial completion payload before network delivery", () => {
    expect(validatePatrolCompletionPayload({
      assignmentId: "assignment",
      summary: { totalPoints: 0, completedPoints: 0 },
      pointResults: []
    }).valid).toBe(false);

    expect(validatePatrolCompletionPayload({
      assignmentId: "assignment",
      summary: { totalPoints: 2, completedPoints: 2 },
      pointResults: [{ pointId: "one", status: "ok" }]
    }).valid).toBe(false);
  });

  it("accepts only one terminal result for every route point", () => {
    expect(validatePatrolCompletionPayload({
      assignmentId: "assignment",
      summary: { totalPoints: 2, completedPoints: 2 },
      pointResults: [
        { pointId: "one", status: "ok" },
        { pointId: "two", status: "skipped" }
      ]
    })).toEqual({ valid: true });
  });

  it("preserves newer local lifecycle state during assignment ID remap", () => {
    expect(resolveRemappedAssignmentStatus("inProgress", "accepted")).toBe("inProgress");
    expect(resolveRemappedAssignmentStatus("completedLocal", "accepted")).toBe("completedLocal");
    expect(resolveRemappedAssignmentStatus("accepted", "inProgress")).toBe("inProgress");
    expect(resolveRemappedAssignmentStatus("completedLocal", "cancelledServer")).toBe("cancelledServer");
  });
});
