import { expect, test } from "@playwright/test";

test("inventory custody screen supports journal, detail, history and print exports", async ({ page }) => {
  const sessionUser = {
    id: "user-admin",
    login: "admin",
    displayName: "Администратор",
    roles: ["admin"],
    permissions: [],
  };
  const documentId = "00000000-0000-0000-0000-00000000c101";
  const recordId = "00000000-0000-0000-0000-00000000c201";
  const employeeId = "00000000-0000-0000-0000-00000000e101";
  const itemId = "00000000-0000-0000-0000-00000000a101";
  const warehouseId = "00000000-0000-0000-0000-00000000b101";
  const listPayload = {
    rows: [
      {
        id: documentId,
        number: "CUST-001",
        employeeName: "Иванов Иван Иванович",
        status: "open",
        createdAt: "2026-05-22T08:00:00.000Z",
        recordsCount: 1,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
    pageCount: 1,
  };
  const recordsPayload = {
    rows: [
      {
        id: recordId,
        documentId,
        employeeName: "Иванов Иван Иванович",
        itemName: "Ноутбук Lenovo",
        warehouseName: "Основной склад",
        quantity: 1,
        status: "in_use",
        issuedAt: "2026-05-22T08:00:00.000Z",
        closedAt: null,
        itemId,
        warehouseId,
        unit: "шт.",
        comment: "Для обхода участка",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
    pageCount: 1,
  };
  const detailPayload = {
    id: documentId,
    number: "CUST-001",
    employeeId,
    employeeName: "Иванов Иван Иванович",
    employeePersonnelNo: "TAB-101",
    employeeDepartment: "Электромонтажный участок",
    status: "open",
    createdAt: "2026-05-22T08:00:00.000Z",
    closedAt: null,
    records: recordsPayload.rows,
    history: [],
  };
  const historyPayload = {
    rows: [
      {
        id: "00000000-0000-0000-0000-00000000d101",
        entityType: "custody_record",
        action: "created",
        description: "created -> in_use",
        actor: "system",
        createdAt: "2026-05-22T08:05:00.000Z",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 50,
    pageCount: 1,
  };
  const optionsPayload = {
    employees: [
      {
        id: employeeId,
        fullName: "Иванов Иван Иванович",
        personnelNo: "TAB-101",
        position: "Инженер",
        department: "Электромонтажный участок",
        employeeGroup: "ИТР",
        status: "active",
        birthDate: null,
        hiredAt: null,
      },
    ],
    items: [
      {
        id: itemId,
        sku: "NB-001",
        name: "Ноутбук Lenovo",
        category: "Оборудование",
        unit: "шт.",
        isActive: true,
      },
    ],
    warehouses: [{ id: warehouseId, name: "Основной склад", code: "MAIN", isActive: true }],
    custodyCategories: [],
    documentStatuses: ["open", "closed", "archived"],
    recordStatuses: ["in_use", "returned", "written_off", "lost", "archived"],
  };
  const settingsPayload = {
    categories: [],
    units: [],
    warehouses: optionsPayload.warehouses,
    custodyCategories: [],
    ppeItemCategories: [],
    itemSets: [],
    positionNorms: [],
    employeePositions: [],
    employeeDepartments: [],
    employeeGroups: [],
  };
  const printRequests: string[] = [];
  const statusRequests: string[] = [];

  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionUser) }));
  await page.route(/\/api\/v1\/inventory\/custody\/documents(\\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(listPayload) }));
  await page.route(/\/api\/v1\/inventory\/custody\/records(\\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(recordsPayload) }));
  await page.route("**/api/v1/inventory/custody/options", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(optionsPayload) }));
  await page.route("**/api/v1/inventory/settings", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(settingsPayload) }));
  await page.route(`**/api/v1/inventory/custody/documents/${documentId}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(detailPayload) }));
  await page.route(`**/api/v1/inventory/custody/documents/${documentId}/history**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(historyPayload) }));
  await page.route(`**/api/v1/inventory/custody/records/${recordId}/history**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(historyPayload) }));
  await page.route("**/api/v1/inventory/custody/documents/**/print**", async (route) => {
    printRequests.push(route.request().url());
    await route.fulfill({
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      headers: { "content-disposition": "attachment; filename=\"custody.docx\"" },
      body: "file",
    });
  });
  await page.route("**/api/v1/inventory/custody/documents/**/close", (route) => {
    statusRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...listPayload.rows[0], status: "closed" }) });
  });
  await page.route("**/api/v1/inventory/custody/documents/**/open", (route) => {
    statusRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...listPayload.rows[0], status: "open" }) });
  });
  await page.route("**/api/v1/inventory/custody/records/**/status", (route) => {
    statusRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...recordsPayload.rows[0], status: "returned" }) });
  });
  await page.route("**/api/v1/inventory/custody/records/**/archive", (route) => {
    statusRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...recordsPayload.rows[0], status: "archived" }) });
  });

  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });
  await page.goto("/?inventory-custody-smoke=1#inventory-custody");

  await expect(page.getByRole("heading", { name: "Под запись" })).toBeVisible();
  await expect(page.getByText("Открыть акт").first()).toBeVisible();
  await expect(page.getByText("Ноутбук Lenovo", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Открыть" }).first().click();
  await expect(page.getByText("История акта")).toBeVisible();
  await expect(page.locator(".inventory-custody-drawer").getByText("TAB-101", { exact: true })).toBeVisible();
  await expect(page.locator(".inventory-custody-drawer").getByText("Электромонтажный участок")).toBeVisible();
  await expect(page.locator(".inventory-custody-drawer").getByText("Для обхода участка")).toBeVisible();

  await page.locator(".inventory-custody-drawer-actions").getByRole("button", { name: "Закрыть" }).click();
  await page.locator(".inventory-custody-drawer").getByRole("button", { name: "Вернуть" }).click();
  await page.getByRole("dialog", { name: "Вернуть предмет" }).getByRole("button", { name: "Провести возврат" }).click();
  await page.locator(".inventory-custody-drawer").getByRole("button", { name: "Списать" }).click();
  await page.getByRole("dialog", { name: "Списать предмет" }).getByRole("textbox").fill("Smoke write-off");
  await page.getByRole("dialog", { name: "Списать предмет" }).getByRole("button", { name: "Провести списание" }).click();
  await page.getByRole("button", { name: "Архив" }).last().click();
  await page.getByRole("button", { name: "PDF" }).last().click();
  await page.getByRole("button", { name: "DOCX" }).last().click();

  await expect.poll(() => statusRequests.length).toBeGreaterThanOrEqual(4);
  await expect.poll(() => printRequests.length).toBe(2);
  await expect(printRequests[0]).toContain("format=pdf");
  await expect(printRequests[1]).toContain("format=docx");
});
