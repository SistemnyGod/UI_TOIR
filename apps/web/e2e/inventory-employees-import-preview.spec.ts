import { expect, test } from "@playwright/test";

test("inventory employees import uses preview before database write", async ({ page }) => {
  const employeeId = "00000000-0000-0000-0000-00000000e777";
  const sessionUser = {
    id: "admin-1",
    login: "admin",
    displayName: "Администратор",
    roles: ["admin"],
    permissions: [],
  };
  const employees = {
    rows: [
      {
        id: employeeId,
        fullName: "Иванов Иван Иванович",
        personnelNo: "T-001",
        position: "Слесарь",
        department: "Участок обогащения",
        employeeGroup: "Атом",
        status: "active",
        hiredAt: "2024-01-15",
        birthDate: "1990-02-20",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 300,
    pageCount: 1,
  };
  const preview = {
    rowsRead: 2,
    newRows: 1,
    updateRows: 1,
    skippedRows: 0,
    newPositions: ["Электрик"],
    newDepartments: ["Энергоучасток"],
    newGroups: ["Атом Экология"],
    errors: [],
    rows: [
      {
        rowNumber: 2,
        fullName: "Иванов Иван Иванович",
        personnelNo: "T-001",
        position: "Слесарь",
        department: "Участок обогащения",
        employeeGroup: "Атом",
        hiredAt: "2024-01-15",
        birthDate: "1990-02-20",
        changeType: "update",
        error: "",
      },
      {
        rowNumber: 3,
        fullName: "Петров Петр Петрович",
        personnelNo: "T-002",
        position: "Электрик",
        department: "Энергоучасток",
        employeeGroup: "Атом Экология",
        hiredAt: "2025-03-01",
        birthDate: null,
        changeType: "create",
        error: "",
      },
    ],
  };
  const result = {
    rowsRead: 2,
    insertedRows: 1,
    updatedRows: 1,
    skippedRows: 0,
    errors: [],
  };
  const previewRequests: string[] = [];
  const importRequests: string[] = [];
  const archiveRequests: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionUser) }),
  );
  await page.route("**/api/v1/inventory/employees?**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(employees) }),
  );
  await page.route("**/api/v1/inventory/employees/import/preview", (route) => {
    previewRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(preview) });
  });
  await page.route("**/api/v1/inventory/employees/import", (route) => {
    importRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.route(`**/api/v1/inventory/employees/${employeeId}/archive`, (route) => {
    archiveRequests.push(route.request().url());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...employees.rows[0], status: "archived" }),
    });
  });

  await page.goto("/#inventory-employees");

  await expect(page.getByRole("heading", { name: "Сотрудники учета" })).toBeVisible();
  await page.locator("input[type='file']").setInputFiles({
    name: "employees.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("ФИО;Табельный;Должность\nПетров Петр Петрович;T-002;Электрик", "utf8"),
  });

  await expect(page.getByRole("heading", { name: "employees.csv" })).toBeVisible();
  await expect(page.locator(".inventory-employees-preview-table").getByText("Электрик").first()).toBeVisible();
  await expect.poll(() => previewRequests.length).toBe(1);
  await expect.poll(() => importRequests.length).toBe(0);

  await page.getByRole("button", { name: "Импортировать" }).click();
  await expect(page.getByRole("dialog", { name: "Результат импорта сотрудников" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 строк обработано" })).toBeVisible();
  await expect.poll(() => importRequests.length).toBe(1);

  await page.getByRole("dialog", { name: "Результат импорта сотрудников" }).getByRole("button", { name: "Закрыть" }).last().click();
  await page.getByRole("button", { name: "Архив", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Архивировать Иванов Иван Иванович/ })).toBeVisible();
  await page.getByRole("button", { name: "Архивировать" }).click();
  await expect.poll(() => archiveRequests.length).toBe(1);
});
