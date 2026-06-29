import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";

const apiBaseUrl = process.env.PATROL360_E2E_API_BASE_URL ?? "http://localhost:5173";
const runApiContour = process.env.PATROL360_E2E_API_MODE === "true";

type AuthSession = {
  accessToken: string;
};

type Employee = {
  id: string;
  fullName: string;
  personnelNo?: string;
  position?: string;
};

type EmuReference = {
  id: string;
  isActive: boolean;
  name: string;
};

type EmuFavoriteEmployee = {
  employeeId: string;
  fullName: string;
  isActive: boolean;
};

type EmuSettings = {
  favoriteEmployees: EmuFavoriteEmployee[];
  sections: EmuReference[];
  waitReasons: EmuReference[];
};

type EmuWorkEmployee = {
  employeeId: string;
  status: string;
};

type EmuWorkSession = {
  id: string;
  workNumber: string;
  workDate: string;
  sectionId: string;
  taskDescription: string;
  operationalStatus: string;
  resultStatus: string;
  resultComment: string;
  arrivedAt: string;
  completedAt: string | null;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  rowVersion: number;
  employees: EmuWorkEmployee[];
};

type EmuListResponse<T> = {
  rows: T[];
};

test.describe("EMU API contour", () => {
  test.skip(!runApiContour, "Set PATROL360_E2E_API_MODE=true to run against Docker API.");

  test("creates, pauses, resumes, completes, shows history, and cleans up", async ({ page }) => {
    const marker = `e2e-emu-full-${Date.now()}`;
    const api = await request.newContext({ baseURL: apiBaseUrl });
    let authorized: APIRequestContext | undefined;
    let createdWork: EmuWorkSession | undefined;

    try {
      const login = await api.post("/api/v1/auth/login", {
        data: { login: "admin", password: "Patrol360!", rememberMe: false },
      });
      expect(login.ok()).toBeTruthy();
      const session = (await login.json()) as AuthSession;
      authorized = await request.newContext({
        baseURL: apiBaseUrl,
        extraHTTPHeaders: { Authorization: `Bearer ${session.accessToken}` },
      });

      const settingsResponse = await authorized.get("/api/v1/emu/settings");
      expect(settingsResponse.ok()).toBeTruthy();
      const settings = (await settingsResponse.json()) as EmuSettings;
      const section = settings.sections.find((item) => item.isActive) ?? settings.sections[0];
      const waitReason = settings.waitReasons.find((item) => item.isActive) ?? settings.waitReasons[0];
      expect(section).toBeTruthy();
      expect(waitReason).toBeTruthy();

      const employee = await chooseAvailableEmployee(authorized, settings);
      expect(employee).toBeTruthy();

      const now = Date.now();
      const arrivedAt = new Date(now - 20 * 60_000);
      const pauseStartedAt = new Date(now - 12 * 60_000);
      const resumedAt = new Date(now - 6 * 60_000);
      const completedAt = new Date(now - 60_000);
      const workDate = toDateKey(arrivedAt);

      const createResponse = await authorized.post("/api/v1/emu/work-sessions", {
        data: {
          arrivedAt: arrivedAt.toISOString(),
          employeeIds: [employee.id],
          sectionId: section.id,
          taskDescription: marker,
          workDate,
        },
      });
      expect(createResponse.ok()).toBeTruthy();
      let work = (await createResponse.json()) as EmuWorkSession;
      createdWork = work;
      expect(work.taskDescription).toBe(marker);
      expect(work.employees.map((item) => item.employeeId)).toContain(employee.id);

      await page.addInitScript((token: string) => {
        window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
        window.sessionStorage.setItem("patrol360.sessionToken", token);
      }, session.accessToken);
      await page.goto("/#emu-work-accounting");
      await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();

      const pauseResponse = await authorized.post(`/api/v1/emu/work-sessions/${work.id}/pause`, {
        data: {
          comment: `${marker}: ожидание допуска`,
          employeeIds: [employee.id],
          markAsOtherWork: false,
          rowVersion: work.rowVersion,
          startedAt: pauseStartedAt.toISOString(),
          waitReasonId: waitReason.id,
        },
      });
      expect(pauseResponse.ok()).toBeTruthy();
      work = (await pauseResponse.json()) as EmuWorkSession;
      createdWork = work;
      expect(work.operationalStatus.toLowerCase()).toContain("ожид");

      const resumeResponse = await authorized.post(`/api/v1/emu/work-sessions/${work.id}/resume`, {
        data: {
          comment: `${marker}: возврат`,
          employeeIds: [employee.id],
          resumedAt: resumedAt.toISOString(),
          rowVersion: work.rowVersion,
        },
      });
      expect(resumeResponse.ok()).toBeTruthy();
      work = (await resumeResponse.json()) as EmuWorkSession;
      createdWork = work;
      expect(work.completedAt).toBeNull();

      const completeResponse = await authorized.post(`/api/v1/emu/work-sessions/${work.id}/complete`, {
        data: {
          completedAt: completedAt.toISOString(),
          employeeIds: [employee.id],
          notCompletedReasonId: null,
          resultComment: `${marker}: выполнено`,
          resultStatus: "Выполнено",
          rowVersion: work.rowVersion,
        },
      });
      expect(completeResponse.ok()).toBeTruthy();
      work = (await completeResponse.json()) as EmuWorkSession;
      createdWork = work;
      expect(work.completedAt).toBeTruthy();
      expect(work.workMinutes).toBeGreaterThanOrEqual(0);
      expect(work.waitingMinutes).toBeGreaterThanOrEqual(0);

      const historyQuery = new URLSearchParams({
        dateFrom: workDate,
        dateTo: workDate,
        manualCorrectionsOnly: "true",
        pageSize: "200",
        problemOnly: "true",
        sortBy: "section",
      });
      const historyResponse = await authorized.get(`/api/v1/emu/work-sessions?${historyQuery.toString()}`);
      expect(historyResponse.ok()).toBeTruthy();
      const history = (await historyResponse.json()) as EmuListResponse<EmuWorkSession>;
      const completed = history.rows.find((item) => item.id === work.id);
      expect(completed?.taskDescription).toBe(marker);
      expect(completed?.completedAt).toBeTruthy();

      const exportResponse = await authorized.get(`/api/v1/emu/work-sessions/export?${historyQuery.toString()}`);
      expect(exportResponse.ok()).toBeTruthy();
      expect(exportResponse.headers()["content-type"]).toContain("text/csv");
      expect(await exportResponse.text()).toContain(marker);

      const auditResponse = await authorized.get(`/api/v1/emu/work-sessions/${work.id}/audit`);
      expect(auditResponse.ok()).toBeTruthy();
      const audit = (await auditResponse.json()) as EmuListResponse<{ eventType: string }>;
      expect(audit.rows.map((event) => event.eventType)).toEqual(expect.arrayContaining(["created", "paused", "resumed", "completed"]));

      await page.goto("/#emu-completed-work-history");
      await page.locator(".emu-filter-panel button.emu-primary-button").click();
      await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
    } finally {
      if (authorized && createdWork) {
        await softDeleteWorkSession(authorized, createdWork, marker);
      }
      await authorized?.dispose();
      await api.dispose();
      if (process.env.PATROL360_E2E_HARD_CLEANUP === "true") {
        cleanupEmuRows(marker);
      }
    }
  });
});

async function chooseAvailableEmployee(api: APIRequestContext, settings: EmuSettings) {
  const activeResponse = await api.get("/api/v1/emu/work-sessions?pageSize=500");
  expect(activeResponse.ok()).toBeTruthy();
  const active = (await activeResponse.json()) as EmuListResponse<EmuWorkSession>;
  const busyEmployeeIds = new Set(
    active.rows
      .filter((work) => !work.completedAt)
      .flatMap((work) => work.employees.map((employee) => employee.employeeId)),
  );

  const favorite = settings.favoriteEmployees.find((employee) => employee.isActive && !busyEmployeeIds.has(employee.employeeId));
  if (favorite) {
    return { fullName: favorite.fullName, id: favorite.employeeId } satisfies Employee;
  }

  const employeesResponse = await api.get("/api/v1/employees");
  expect(employeesResponse.ok()).toBeTruthy();
  const employees = (await employeesResponse.json()) as Employee[];
  return employees.find((employee) => !busyEmployeeIds.has(employee.id)) ?? employees[0];
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function softDeleteWorkSession(api: APIRequestContext, work: EmuWorkSession, marker: string) {
  let rowVersion = work.rowVersion;
  const reload = await api.get(`/api/v1/emu/work-sessions/${work.id}`);
  if (reload.ok()) {
    const latest = (await reload.json()) as EmuWorkSession;
    rowVersion = latest.rowVersion;
  }

  const cleanup = await api.delete(`/api/v1/emu/work-sessions/${work.id}`, {
    data: {
      reason: `${marker}: e2e cleanup`,
      rowVersion,
    },
  });

  expect(cleanup.ok()).toBeTruthy();
}

function cleanupEmuRows(marker: string) {
  const escapedMarker = marker.replaceAll("'", "''");
  const sql = `delete from emu_work_sessions where task_description = '${escapedMarker}';`;

  execFileSync("docker", ["exec", "patrol360-postgres", "psql", "-U", "patrol360", "-d", "patrol360", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: "ignore",
    windowsHide: true,
  });
}
