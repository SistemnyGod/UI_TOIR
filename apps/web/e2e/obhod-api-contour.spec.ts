import { expect, request, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const apiBaseUrl = process.env.PATROL360_E2E_API_BASE_URL ?? "http://localhost:5173";
const runApiContour = process.env.PATROL360_E2E_API_MODE === "true";

test.describe("Obhod API contour", () => {
  test.skip(!runApiContour, "Set PATROL360_E2E_API_MODE=true to run against Docker API.");

  test("creates request, completes point checklist with file photos, exports results, and shows them in UI", async ({ page }) => {
    const marker = `e2e-obhod-full-${Date.now()}`;
    const api = await request.newContext({ baseURL: apiBaseUrl });

    try {
      const login = await api.post("/api/v1/auth/login", {
        data: { login: "admin", password: "Patrol360!", rememberMe: false },
      });
      expect(login.ok()).toBeTruthy();
      const session = await login.json();
      const authorized = await request.newContext({
        baseURL: apiBaseUrl,
        extraHTTPHeaders: { Authorization: `Bearer ${session.accessToken}` },
      });

      const employeesResponse = await authorized.get("/api/v1/employees");
      expect(employeesResponse.ok()).toBeTruthy();
      const employees = await employeesResponse.json();
      expect(employees.length).toBeGreaterThan(0);

      const routesResponse = await authorized.get("/api/v1/routes");
      expect(routesResponse.ok()).toBeTruthy();
      const routes = await routesResponse.json();
      const route = routes.find((item: { points?: Array<{ isRequired: boolean; requiresPhoto: boolean }> }) =>
        item.points?.some((point) => point.isRequired && point.requiresPhoto),
      ) ?? routes[0];
      expect(route).toBeTruthy();
      expect(route.points.length).toBeGreaterThan(0);

      const employee = employees[0];
      const requestResponse = await authorized.post("/api/v1/patrol-requests", {
        data: {
          employeeId: employee.id,
          employeeName: employee.fullName,
          routeId: route.id,
          routeName: route.name,
          scheduledDate: "2026-05-29",
          scheduledTime: "08:30:00",
          shift: employee.shift || "День",
          notifyEmployee: false,
          notificationText: "",
          description: marker,
        },
      });
      expect(requestResponse.ok()).toBeTruthy();
      const patrolRequest = await requestResponse.json();

      const assignmentsResponse = await authorized.get("/api/v1/assignments");
      expect(assignmentsResponse.ok()).toBeTruthy();
      const assignments = await assignmentsResponse.json();
      const assignment = assignments.find((item: { patrolRequestId: string }) => item.patrolRequestId === patrolRequest.id);
      expect(assignment).toBeTruthy();

      const pointResults = route.points.map((point: { id: string; requiresPhoto: boolean }) => ({
        routePointId: point.id,
        status: "Подтверждено",
        comment: marker,
        severity: "-",
        photos: point.requiresPhoto ? 1 : 0,
        photoAttachments: point.requiresPhoto
          ? [{ fileName: `${point.id}.jpg`, contentType: "image/jpeg", dataBase64: "AQIDBA==" }]
          : [],
      }));
      const completeResponse = await authorized.post(`/api/v1/assignments/${assignment.id}/complete`, {
        data: {
          actualAt: "2026-05-29T08:55:00Z",
          status: "Подтверждено",
          comment: marker,
          severity: "-",
          photos: pointResults.filter((point: { photos: number }) => point.photos > 0).length,
          pointResults,
        },
      });
      expect(completeResponse.ok()).toBeTruthy();

      const resultsResponse = await authorized.get(`/api/v1/results?routeId=${route.id}&dateFrom=2026-05-29&dateTo=2026-05-29`);
      expect(resultsResponse.ok()).toBeTruthy();
      const results = await resultsResponse.json();
      const markerResults = results.filter((item: { comment: string }) => item.comment === marker);
      expect(markerResults.length).toBe(route.points.length);
      expect(markerResults.some((item: { photos: number }) => item.photos > 0)).toBeTruthy();

      const exportResponse = await authorized.get(`/api/v1/results/export?routeId=${route.id}&dateFrom=2026-05-29&dateTo=2026-05-29`);
      expect(exportResponse.ok()).toBeTruthy();
      expect(exportResponse.headers()["content-type"]).toContain("text/csv");

      await page.addInitScript((token: string) => {
        window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
        window.sessionStorage.setItem("patrol360.sessionToken", token);
      }, session.accessToken);
      await page.goto("/#results");
      await expect(page.getByRole("cell", { name: route.name, exact: true }).first()).toBeVisible();
      await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
    } finally {
      await api.dispose();
      cleanupPatrolRows(marker);
    }
  });
});

function cleanupPatrolRows(marker: string) {
  const escapedMarker = marker.replaceAll("'", "''");
  const sql = `
with req as (select id from patrol_requests where description = '${escapedMarker}'),
ass as (select id from assignments where patrol_request_id in (select id from req)),
res as (select id from patrol_results where assignment_id in (select id from ass))
delete from patrol_result_attachments where patrol_result_id in (select id from res);
with req as (select id from patrol_requests where description = '${escapedMarker}'),
ass as (select id from assignments where patrol_request_id in (select id from req)),
res as (select id from patrol_results where assignment_id in (select id from ass))
delete from patrol_result_issues where patrol_result_id in (select id from res);
with req as (select id from patrol_requests where description = '${escapedMarker}'),
ass as (select id from assignments where patrol_request_id in (select id from req))
delete from patrol_results where assignment_id in (select id from ass);
with req as (select id from patrol_requests where description = '${escapedMarker}')
delete from assignments where patrol_request_id in (select id from req);
delete from patrol_requests where description = '${escapedMarker}';
`;

  execFileSync("docker", ["exec", "patrol360-postgres", "psql", "-U", "patrol360", "-d", "patrol360", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: "ignore",
    windowsHide: true,
  });
}
