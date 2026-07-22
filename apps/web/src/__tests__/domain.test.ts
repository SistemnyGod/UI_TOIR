import { describe, expect, it, vi } from "vitest";
import { buildLocalDashboardMetrics } from "../domain/dashboardMetrics";
import { createMobileAccountDraft } from "../domain/mobileAccounts";
import { moveRoutePoint } from "../domain/routes";
import { createApiAssignmentsRepository } from "../repositories/assignmentsRepository";
import { createApiPatrolRequestsRepository, resolveServiceRequests } from "../repositories/patrolRequestsRepository";
import { createApiResultsRepository } from "../repositories/resultsRepository";
import { createPercoRepository } from "../repositories/percoRepository";
import { isTerminalPatrolRequestStatus } from "../domain/patrolRequestStatus";
import { buildOperationalPatrolDateRange } from "../domain/patrolQueryWindow";
import { isAssignableRequest } from "../features/patrol/assignments/assignmentUtils";
import { getPrimaryActionPermission } from "../security/permissions";
import { shouldCreateAssignmentAfterRequest } from "../screens/AssignmentScreen";
import type { ServiceRequest } from "../types";
import type { RoutePoint } from "../types";

describe("domain workflows", () => {
  it("builds a bounded operational patrol date range", () => {
    expect(buildOperationalPatrolDateRange(new Date(2026, 6, 15, 18, 30))).toEqual({
      dateFrom: "2026-04-16",
      dateTo: "2027-07-15",
    });
  });

  it.each(["completed", "closed", "cancelled", "Завершена", "Закрыта", "Отменена", "Отменено"])(
    "treats %s as a terminal patrol request status",
    (status) => expect(isTerminalPatrolRequestStatus(status)).toBe(true),
  );

  it("does not offer cancelled or already linked requests for assignment", () => {
    expect(isAssignableRequest({ ...createRequest("request-cancelled"), status: "Отменено" as never })).toBe(false);
    expect(isAssignableRequest({ ...createRequest("request-linked"), assignmentId: "assignment-1" })).toBe(false);
    expect(isAssignableRequest(createRequest("request-open"))).toBe(true);
  });

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
    expect(account.passwordState).toBe("Требует смены пароля");
    expect(temporaryPassword).toHaveLength(10);
    expect(JSON.stringify(account)).not.toContain(temporaryPassword);
  });

  it("keeps API-created requests separate from local request storage", () => {
    const localRequests = [createRequest("local-1")];
    const apiRequests = [createRequest("api-1")];

    expect(resolveServiceRequests({ apiRequests, dataSourceMode: "api", localRequests })).toEqual(apiRequests);
    expect(resolveServiceRequests({ apiRequests, dataSourceMode: "mock", localRequests })).toEqual(localRequests);
  });

  it("allows view-only users to open PERCo integration screen", () => {
    expect(getPrimaryActionPermission("perco-integration")).toBe("integrations.perco.view");
  });

  it("keeps PERCo repository routes and methods stable", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const repository = createPercoRepository({
      baseUrl: "https://api.example.test",
      fetcher: async (input, init) => {
        requests.push({ method: init?.method ?? "GET", url: String(input) });
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });

    await repository.getSettings();
    await repository.syncEvents();
    await repository.closePresenceInterval("interval-1", { comment: "Проверено", endedAt: "2026-07-22T08:15:30Z" });

    expect(requests).toEqual([
      { method: "GET", url: "https://api.example.test/api/v1/integrations/perco/settings" },
      { method: "POST", url: "https://api.example.test/api/v1/integrations/perco/sync-events" },
      { method: "PATCH", url: "https://api.example.test/api/v1/integrations/perco/presence-intervals/interval-1/close" },
    ]);
  });

  it("maps API result DTOs without reading fallback results", async () => {
    const repository = createApiResultsRepository({
      fetcher: async () =>
        new Response(
          JSON.stringify({ items: [{
            assignmentId: "assignment-1",
            resultId: null,
            results: [{
              id: "result-1",
              status: "Замечание",
              pointId: "point-1",
              point: "КПП-1",
              employeeId: "employee-1",
              employee: "Иванов И.И.",
              routeId: "route-1",
              route: "Периметр",
              territory: "Север",
              shift: "День",
              plannedAt: "2026-05-18T10:00:00Z",
              actualAt: "2026-05-18T10:12:00Z",
              deviation: "+12 мин",
              comment: "Нужна проверка",
              photos: 2,
              issueType: "Повреждение",
              severity: "Высокая",
            }],
          }], page: 1, pageSize: 100, total: 1, totalPages: 1, hasNext: false }),
          { headers: { "content-type": "application/json" } },
        ),
    });

    const results = await repository.getResults();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "result-1",
      status: "Замечание",
      issueType: "Повреждение",
      severity: "Высокая",
    });
  });

  it("loads a bounded API result page and exposes hasMore", async () => {
    const requestedPaths: string[] = [];
    const repository = createApiResultsRepository({
      baseUrl: "https://api.example.test",
      fetcher: async (input) => {
        const path = String(input);
        requestedPaths.push(path);

        return jsonResponse({
          items: Array.from({ length: 100 }, (_, index) => ({
            assignmentId: `assignment-${index + 1}`,
            resultId: null,
            results: [createResultDto(`result-${index + 1}`)],
          })),
          page: 1,
          pageSize: 100,
          total: 101,
          totalPages: 2,
          hasNext: true,
        });
      },
    });

    const resultPage = await repository.getResultPage({ status: "issue" });

    expect(resultPage.results).toHaveLength(100);
    expect(resultPage.results.at(-1)?.id).toBe("result-100");
    expect(resultPage.hasMore).toBe(true);
    expect(requestedPaths).toHaveLength(1);
    expect(requestedPaths[0]).toContain("/api/v3/results?status=issue&page=1&pageSize=100");
  });

  it("does not request API details for local mock result ids", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const repository = createApiResultsRepository({ fetcher });

    await expect(repository.getResult("result-smoke-photo")).rejects.toThrow("backend API id");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends sourceResultId when creating a request through API repository", async () => {
    let requestBody = "";
    const repository = createApiPatrolRequestsRepository({
      fetcher: async (_input, init) => {
        requestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            id: "request-1",
            number: "REQ-1",
            employeeId: "employee-1",
            employeeName: "Иванов И.И.",
            routeId: "route-1",
            routeName: "Периметр",
            sourceResultId: "result-1",
            scheduledDate: "2026-05-18",
            scheduledTime: null,
            notifyEmployee: true,
            notificationText: "Проверить",
            status: "Новая",
            createdAt: "2026-05-18T10:00:00Z",
            description: "Проверить результат",
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

    const request = await repository.createPatrolRequest({
      employee: "Иванов И.И.",
      route: "Периметр",
      sourceResultId: "result-1",
      scheduledDate: "2026-05-18",
      scheduledTime: "",
      notifyEmployee: true,
      notificationText: "Проверить",
      description: "Проверить результат",
    });

    expect(JSON.parse(requestBody)).toMatchObject({ sourceResultId: "result-1" });
    expect(request.sourceResultId).toBe("result-1");
  });

  it("maps API assignments and sends command endpoints", async () => {
    const requestedPaths: string[] = [];
    let createBody = "";
    const repository = createApiAssignmentsRepository({
      fetcher: async (input, init) => {
        const path = String(input);
        requestedPaths.push(path);
        if (path.endsWith("/api/v1/assignments") && init?.method === "POST") {
          createBody = String(init.body ?? "");
          return jsonResponse(createAssignmentDto("assignment-2"));
        }

        if (path.endsWith("/api/v1/assignments/assignment-2/start")) {
          return jsonResponse({
            assignment: createAssignmentDto("assignment-2", "В пути", 1),
            changed: true,
            message: "started",
          });
        }

        return jsonResponse([createAssignmentDto("assignment-1")]);
      },
    });

    const assignments = await repository.getAssignments();
    const created = await repository.createAssignment({
      employeeId: "employee-1",
      employeeName: "Иванов И.И.",
      comment: "Проверить северную зону",
      notificationText: "Новое назначение",
      notifyEmployee: true,
      patrolRequestId: "request-1",
      plannedAt: "2026-05-18T10:00:00Z",
      plannedEndAt: "2026-05-18T12:00:00Z",
      priority: "high",
      routeId: "route-1",
      routeName: "Периметр",
      shift: "День",
    });
    const command = await repository.startAssignment("assignment-2");

    expect(assignments[0]).toMatchObject({ id: "assignment-1", patrolRequestId: "request-1", employeeId: "employee-1", progress: 0 });
    expect(JSON.parse(createBody)).toMatchObject({
      comment: "Проверить северную зону",
      employeeId: "employee-1",
      notificationText: "Новое назначение",
      notifyEmployee: true,
      patrolRequestId: "request-1",
      plannedEndAt: "2026-05-18T12:00:00Z",
      priority: "high",
    });
    expect(JSON.parse(createBody)).not.toHaveProperty("employeeName");
    expect(JSON.parse(createBody)).not.toHaveProperty("routeName");
    expect(created.id).toBe("assignment-2");
    expect(command.changed).toBe(true);
    expect(command.assignment.id).toBe("assignment-2");
    expect(requestedPaths.some((path) => path.endsWith("/api/v1/assignments/assignment-2/start"))).toBe(true);
  });

  it("loads all API assignment pages", async () => {
    const requestedPaths: string[] = [];
    const firstPage = Array.from({ length: 200 }, (_, index) => createAssignmentDto(`assignment-${index + 1}`));
    const repository = createApiAssignmentsRepository({
      fetcher: async (input) => {
        const path = String(input);
        requestedPaths.push(path);

        if (path.includes("page=1")) {
          return jsonResponse(firstPage);
        }

        if (path.includes("page=2")) return jsonResponse([createAssignmentDto("assignment-201")]);

        return jsonResponse([]);
      },
    });

    const assignments = await repository.getAssignments();

    expect(assignments).toHaveLength(201);
    expect(assignments.at(-1)?.id).toBe("assignment-201");
    expect(requestedPaths).toHaveLength(2);
    expect(requestedPaths[0]).toContain("/api/v1/assignments?page=1&pageSize=200");
    expect(requestedPaths[1]).toContain("/api/v1/assignments?page=2&pageSize=200");
  });

  it("passes assignment filters to the API", async () => {
    let requestedUrl = "";
    const repository = createApiAssignmentsRepository({
      baseUrl: "https://api.example.test",
      fetcher: async (input) => {
        requestedUrl = String(input);
        return jsonResponse([]);
      },
    });

    await repository.getAssignments({
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

  it("does not double count requests that already have active assignments in dashboard metrics", () => {
    const metrics = buildLocalDashboardMetrics({
      activePatrols: [
        {
          id: "assignment-1",
          patrolRequestId: "request-1",
          employee: "Ivan Petrov",
          employeeId: "employee-1",
          route: "North route",
          routeId: "route-1",
          zone: "North",
          shift: "День",
          currentPoint: "ожидает старта",
          status: "Ожидает",
          progress: 0,
          eta: "09:00",
          deviation: "-",
        },
      ],
      requests: [
        createRequest("request-1"),
        { ...createRequest("request-2"), status: "Закрыта" },
        createRequest("request-3"),
      ],
      routeDirectory: [],
    });

    expect(metrics.find((metric) => metric.label === "Заявки на обход")?.value).toBe("1");
  });

  it("does not create a second assignment after creating a new API request", () => {
    expect(shouldCreateAssignmentAfterRequest({ dataSourceMode: "api", hasSelectedRequest: false })).toBe(false);
    expect(shouldCreateAssignmentAfterRequest({ dataSourceMode: "api", hasSelectedRequest: true })).toBe(true);
    expect(shouldCreateAssignmentAfterRequest({ dataSourceMode: "api", hasSelectedRequest: true, hasLinkedAssignment: true })).toBe(false);
    expect(shouldCreateAssignmentAfterRequest({ dataSourceMode: "mock", hasSelectedRequest: false })).toBe(true);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function createAssignmentDto(id: string, status = "Назначена", progressPercent = 0) {
  return {
    id,
    patrolRequestId: "request-1",
    employeeId: "employee-1",
    employeeName: "Иванов И.И.",
    routeId: "route-1",
    routeName: "Периметр",
    shift: "День",
    status,
    plannedAt: "2026-05-18T10:00:00Z",
    startedAt: null,
    finishedAt: null,
    progressPercent,
    eta: "10:00",
  };
}

function createResultDto(id: string) {
  return {
    id,
    assignmentId: `assignment-${id}`,
    status: "issue",
    pointId: `point-${id}`,
    point: `Point ${id}`,
    employeeId: "employee-1",
    employee: "Employee",
    routeId: "route-1",
    route: "Route",
    territory: "North",
    shift: "day",
    plannedAt: "2026-05-18T10:00:00Z",
    actualAt: "2026-05-18T10:12:00Z",
    deviation: "+12 min",
    comment: "Needs review",
    photos: 0,
    issueType: "issue",
    severity: "medium",
  };
}

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
    description: "",
    instruction: "",
    interval: "00:10",
    expectedTime: "00:05",
    status: "Активна",
    requiresPhoto: false,
  };
}
