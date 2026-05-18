import { describe, expect, it } from "vitest";
import { createMobileAccountDraft } from "../domain/mobileAccounts";
import { moveRoutePoint } from "../domain/routes";
import { resolveServiceRequests } from "../repositories/patrolRequestsRepository";
import type { ServiceRequest } from "../types";
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
    const result = createMobileAccountDraft({
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

    const { account, temporaryPassword } = result;

    expect(account.login).toBe("ivan.petrov2");
    expect(account.boundEmployees).toEqual(["Ivan Petrov", "Anna Sidorova"]);
    expect(account.employee).toBe("Ivan Petrov +1");
    expect(account.password).toBe("Требует смены пароля");
    expect(temporaryPassword).toHaveLength(10);
    expect(account.password).not.toBe(temporaryPassword);
  });

  it("keeps API-created requests separate from local request storage", () => {
    const localRequests = [createRequest("local-1")];
    const apiRequests = [createRequest("api-1")];

    expect(resolveServiceRequests({ apiRequests, dataSourceMode: "api", localRequests })).toEqual(apiRequests);
    expect(resolveServiceRequests({ apiRequests, dataSourceMode: "mock", localRequests })).toEqual(localRequests);
  });
});

function createRequest(id: string): ServiceRequest {
  return {
    id,
    requestKind: "patrol-assignment",
    title: id,
    status: "Новая",
    priority: "Средний",
    sourceResultId: "",
    source: "test",
    route: "Route",
    point: "",
    employee: "Employee",
    scheduledDate: "2026-05-18",
    scheduledTime: "",
    notifyEmployee: false,
    notificationText: "",
    createdAt: "2026-05-18",
    dueAt: "",
    responsible: "Employee",
    description: "",
    timeline: [],
  };
}

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
