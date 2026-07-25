import { describe, expect, it } from "vitest";

import { canCreateCompletionCommand, evaluateRequiredPointReadiness } from "@/domain/patrol/reportReadinessPolicy";

describe("report readiness for scanned mandatory points", () => {
  it("blocks completion and does not create completePatrolAssignment", () => {
    const readiness = evaluateRequiredPointReadiness([{
      pointId: "point-1",
      pointName: "Насосная",
      orderIndex: 1,
      required: true,
      status: "scanned"
    }]);

    expect(readiness.ready).toBe(false);
    expect(readiness.problems).toEqual([{
      pointId: "point-1",
      pointName: "Насосная",
      orderIndex: 1,
      reason: "Обязательная метка просканирована, но результат не заполнен."
    }]);
    expect(canCreateCompletionCommand(true, readiness.ready)).toBe(false);
  });
});
