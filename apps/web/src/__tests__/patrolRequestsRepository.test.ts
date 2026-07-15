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
          assignmentId: "assignment-1",
        },
      ]),
    );
    const repository = createApiPatrolRequestsRepository({
      baseUrl: "https://api.example.test",
      fetcher,
    });

    const requests = await repository.getPatrolRequests();

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/patrol-requests?page=1&pageSize=500",
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
      assignmentId: null,
          },
        ]),
    });

    const requests = await repository.getPatrolRequests();

    expect(requests[0].status).toBe("Закрыта");
  });

  it("loads all patrol request pages", async () => {
    const requestedUrls: string[] = [];
    const firstPage = Array.from({ length: 500 }, (_, index) => createPatrolRequestDto(`request-${index + 1}`));
    const repository = createApiPatrolRequestsRepository({
      fetcher: async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.includes("page=1")) {
          return jsonResponse(firstPage);
        }

        if (url.includes("page=2")) {
          return jsonResponse([createPatrolRequestDto("request-501")]);
        }

        return jsonResponse([]);
      },
    });

    const requests = await repository.getPatrolRequests();

    expect(requests).toHaveLength(501);
    expect(requests.at(-1)?.id).toBe("request-501");
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("/api/v1/patrol-requests?page=1&pageSize=500");
    expect(requestedUrls[1]).toContain("/api/v1/patrol-requests?page=2&pageSize=500");
  });

  it("passes request filters to the API", async () => {
    let requestedUrl = "";
    const repository = createApiPatrolRequestsRepository({
      baseUrl: "https://api.example.test",
      fetcher: async (input) => {
        requestedUrl = String(input);
        return jsonResponse([]);
      },
    });

    await repository.getPatrolRequests({
      employeeId: "employee-1",
      routeId: "route-1",
      status: "Assigned",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      query: "north route",
    });

    const query = new URL(requestedUrl).searchParams;
    expect(query.get("employeeId")).toBe("employee-1");
    expect(query.get("routeId")).toBe("route-1");
    expect(query.get("status")).toBe("Assigned");
    expect(query.get("dateFrom")).toBe("2026-05-01");
    expect(query.get("dateTo")).toBe("2026-05-31");
    expect(query.get("query")).toBe("north route");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function createPatrolRequestDto(id: string) {
  return {
    id,
    number: id,
    employeeId: "employee-1",
    employeeName: "Ivan Petrov",
    routeId: "route-1",
    routeName: "North route",
    scheduledDate: "2026-05-18",
    scheduledTime: "09:30",
    notifyEmployee: false,
    notificationText: "",
    status: "Assigned",
    createdAt: "2026-05-18T08:00:00Z",
      description: "",
      assignmentId: null,
  };
}
