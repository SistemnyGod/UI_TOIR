import { expect, test } from "@playwright/test";

const sessionUser = {
  id: "admin-1",
  login: "admin",
  displayName: "Администратор",
  roles: ["admin"],
  permissions: ["inventory.view", "inventory.audit.view"],
};

const historyPayload = {
  rows: [
    {
      id: "00000000-0000-0000-0000-00000000a101",
      entityType: "custody_record",
      action: "created",
      description: "Создана строка акта CUST-001",
      actor: "admin",
      createdAt: "2026-05-22T08:05:00.000Z",
    },
    {
      id: "00000000-0000-0000-0000-00000000a102",
      entityType: "ppe_card_line",
      action: "issued",
      description: "Выдана каска защитная",
      actor: "operator",
      createdAt: "2026-05-22T09:15:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
  pageCount: 1,
};

const systemLogPayload = {
  rows: [
    {
      id: "00000000-0000-0000-0000-00000000b101",
      entityType: "export_job",
      entityId: "00000000-0000-0000-0000-00000000c101",
      action: "pdf_exported",
      details: "Сформирован PDF отчета под запись",
      actor: "admin",
      createdAt: "2026-05-22T10:30:00.000Z",
    },
    {
      id: "00000000-0000-0000-0000-00000000b102",
      entityType: "site_user",
      entityId: "00000000-0000-0000-0000-00000000c102",
      action: "disabled",
      details: "Пользователь отключен",
      actor: "admin",
      createdAt: "2026-05-22T11:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
  pageCount: 1,
};

test("inventory history and system log use server filters and show clean text", async ({ page }) => {
  const requests: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionUser) }),
  );
  await page.route("**/api/v1/inventory/history**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(historyPayload) });
  });
  await page.route("**/api/v1/inventory/system-log**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(systemLogPayload) });
  });

  await page.goto("/#inventory-history");
  await expect(page.getByRole("heading", { name: "История" })).toBeVisible();
  await expect(page.getByText("Создана строка акта CUST-001")).toBeVisible();
  await page.getByPlaceholder("Поиск по описанию, пользователю или действию").fill("каска");
  await expect.poll(() => requests.some((url) => url.includes("/history") && url.includes("query=%D0%BA%D0%B0%D1%81%D0%BA%D0%B0"))).toBeTruthy();
  await page.getByRole("button", { name: "Открыть" }).first().click();
  await expect(page.locator(".inventory-history-drawer")).toContainText("Описание");

  const historyText = await page.locator(".inventory-history-screen").innerText();
  expect(historyText).not.toMatch(/Рџ|РЎ|Рќ|Рђ|Р”|Р|СЃ|В·/);

  await page.goto("/#inventory-system-log");
  await expect(page.getByRole("heading", { name: "Системный журнал" })).toBeVisible();
  await expect(page.getByText("Сформирован PDF отчета под запись")).toBeVisible();
  await page.getByPlaceholder("Поиск по деталям, сущности, действию или пользователю").fill("PDF");
  await expect.poll(() => requests.some((url) => url.includes("/system-log") && url.includes("query=PDF"))).toBeTruthy();
  await page.getByRole("button", { name: "Открыть" }).first().click();
  await expect(page.locator(".inventory-system-log-drawer")).toContainText("Детали");

  const systemLogText = await page.locator(".inventory-system-log-screen").innerText();
  expect(systemLogText).not.toMatch(/Рџ|РЎ|Рќ|Рђ|Р”|Р|СЃ|В·/);
});

test("inventory audit endpoints are not available without audit permission", async ({ page }) => {
  const deniedUser = {
    ...sessionUser,
    permissions: ["inventory.view"],
  };
  const deniedUrls: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(deniedUser) }),
  );
  await page.route("**/api/v1/inventory/history**", (route) => {
    deniedUrls.push(route.request().url());
    return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) });
  });
  await page.route("**/api/v1/inventory/system-log**", (route) => {
    deniedUrls.push(route.request().url());
    return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) });
  });

  await page.goto("/#inventory-history");
  await expect(page.getByText("API истории не ответил")).toBeVisible();

  await page.goto("/#inventory-system-log");
  await expect(page.getByText("API журнала не ответил")).toBeVisible();
  await expect.poll(() => deniedUrls.length).toBeGreaterThanOrEqual(2);
});
