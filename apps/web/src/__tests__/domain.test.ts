import { describe, expect, it } from "vitest";
import { createMobileAccountDraft } from "../domain/mobileAccounts";
import { moveRoutePoint } from "../domain/routes";
import type { RoutePoint } from "../types";

describe("domain workflows", () => {
  it("moves route points and recalculates order without mutating source list", () => {
    const points: RoutePoint[] = [createPoint("p1", 1), createPoint("p2", 2), createPoint("p3", 3)];

    const nextPoints = moveRoutePoint(points, "p2", -1);

    expect(nextPoints.map((point) => point.id)).toEqual(["p2", "p1", "p3"]);
    expect(nextPoints.map((point) => point.order)).toEqual([1, 2, 3]);
    expect(points.map((point) => point.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("creates mobile account with normalized unique login and employee binding", () => {
    const account = createMobileAccountDraft({
      payload: {
        employee: "Ivan Petrov; Anna Sidorova; Ivan Petrov",
        employeeScope: "selected",
        login: "Ivan Petrov",
        role: "",
        bindEmployee: true,
        restrictToBoundDevice: true,
        temporaryPassword: true,
      },
      existingCount: 1,
      existingLogins: new Set(["ivan.petrov"]),
    });

    expect(account.login).toBe("ivan.petrov2");
    expect(account.boundEmployees).toEqual(["Ivan Petrov", "Anna Sidorova"]);
    expect(account.employee).toBe("Ivan Petrov +1");
    expect(account.password).toHaveLength(10);
  });
});

function createPoint(id: string, order: number): RoutePoint {
  return {
    id,
    order,
    name: `Point ${order}`,
    zone: "North",
    type: "NFC",
    tag: `NFC-${order}`,
    interval: "00:10",
    expectedTime: "00:05",
    status: "Активна",
    requiresPhoto: false,
  };
}
