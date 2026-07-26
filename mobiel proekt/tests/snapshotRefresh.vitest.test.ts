import { describe, expect, it } from "vitest";

import { getSnapshotRefreshPlan } from "@/domain/patrol/snapshotPolicy";

describe("обновление snapshot принятого назначения", () => {
  it("заменяет snapshot v2 на v3 и добавляет новую точку", () => {
    const plan = getSnapshotRefreshPlan({
      localStatus: "accepted",
      localSnapshotVersion: 2,
      localPointCount: 1,
      routeVersion: 3,
      incomingPointIds: ["point-1", "point-2"]
    });

    expect(plan.shouldReplace).toBe(true);
    expect(plan.snapshotVersion).toBe(3);
    expect(plan.pointIds).toEqual(["point-1", "point-2"]);
  });
});

describe("active patrol snapshot", () => {
  it("does not replace an in-progress snapshot even when it is empty", () => {
    const plan = getSnapshotRefreshPlan({
      localStatus: "inProgress",
      localSnapshotVersion: 2,
      localPointCount: 0,
      routeVersion: 3,
      incomingPointIds: ["point-1", "point-2"]
    });

    expect(plan.shouldReplace).toBe(false);
    expect(plan.snapshotVersion).toBe(2);
  });
});
