import { describe, expect, it, vi } from "vitest";
import { createApiPatrolRequestsRepository } from "../repositories/patrolRequestsRepository";

describe("patrol requests repository", () => {
  it("loads patrol requests from API list endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse([
        {
          id: "request-1",
          number: "REQ-001",
          employeeId: "employee-1",
          employeeName: "Ivan Petrov",
          routeId: "route-1",
          routeName: "North route",
          scheduledDate: "2026-05-18",
          scheduledTime: "09:30",
          notifyEmployee: true,
          notificationText: "Start patrol",
          status: "Assigned",
          createdAt: "2026-05-18T08:00:00Z",
          description: "Daily route",
        },
      ]),
    );
    const repository = createApiPatrolRequestsRepository({
      baseUrl: "https://api.example.test",
      fetcher,
    });

    const requests = await repository.getPatrolRequests();

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/patrol-requests",
      expect.objectContaining({ method: "GET" }),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      id: "request-1",
      title: "REQ-001",
      status: "Назначена",
      source: "API",
      route: "North route",
      employee: "Ivan Petrov",
      scheduledDate: "2026-05-18",
      scheduledTime: "09:30",
      notifyEmployee: true,
    });
  });

  it("maps closed patrol request statuses for dashboard filtering", async () => {
    const repository = createApiPatrolRequestsRepository({
      fetcher: async () =>
        jsonResponse([
          {
            id: "request-closed",
            number: "REQ-002",
            employeeId: "employee-1",
            employeeName: "Ivan Petrov",
            routeId: "route-1",
            routeName: "North route",
            scheduledDate: "2026-05-18",
            scheduledTime: "09:30",
            notifyEmployee: false,
            notificationText: "",
            status: "Закрыта",
            createdAt: "2026-05-18T08:00:00Z",
            description: "",
          },
        ]),
    });

    const requests = await repository.getPatrolRequests();

    expect(requests[0].status).toBe("Закрыта");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
