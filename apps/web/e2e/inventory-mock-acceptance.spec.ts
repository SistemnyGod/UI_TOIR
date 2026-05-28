import { expect, test, type Page } from "@playwright/test";

const inventoryVisualRoutes = [
  { hash: "#inventory-overview", text: "Обзор учета" },
  { hash: "#inventory-employees", text: "Сотрудники учета" },
  { hash: "#inventory-items", text: "Номенклатура" },
  { hash: "#inventory-issue", text: "Выдача" },
  { hash: "#inventory-operations", text: "Операции" },
  { hash: "#inventory-custody", text: "Под запись" },
  { hash: "#inventory-ppe", text: "СИЗ" },
  { hash: "#inventory-history", text: "История" },
  { hash: "#inventory-reports", text: "Отчеты" },
  { hash: "#inventory-settings", text: "Настройки учета" },
];

const visualViewports = [
  { height: 768, name: "desktop", width: 1365 },
  { height: 844, name: "mobile", width: 390 },
];

test("inventory mock acceptance runs without Inventory API requests", async ({ page }) => {
  const inventoryApiRequests: string[] = [];

  await enableInventoryMock(page);

  await page.route("**/api/v1/inventory/**", (route) => {
    inventoryApiRequests.push(route.request().url());
    throw new Error(`Inventory API request is not allowed in mock acceptance: ${route.request().url()}`);
  });

  await page.goto("/#inventory-overview");
  await expect(page.getByRole("heading", { name: "Обзор учета" })).toBeVisible();
  await expect(page.getByText("Остатки, операции, СИЗ, под запись")).toBeVisible();

  await page.goto("/#inventory-items");
  await expect(page.getByRole("heading", { name: "Номенклатура" })).toBeVisible();
  await expect(page.getByText("Каска защитная").first()).toBeVisible();

  await page.goto("/#inventory-employees");
  await expect(page.getByRole("heading", { name: "Сотрудники учета" })).toBeVisible();
  await page.locator("input[type='file']").setInputFiles({
    name: "mock-employees.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "ФИО;Табель;Должность;Подразделение;Группа;Дата приема;Дата рождения",
        "Смирнов Дмитрий Андреевич;M-101;Электромонтер;Энергоучасток;Атом Экология;2025-03-10;1991-02-03",
      ].join("\n"),
      "utf8",
    ),
  });
  await expect(page.getByRole("dialog", { name: "Предпросмотр импорта сотрудников" })).toBeVisible();
  await expect(page.locator(".inventory-employees-import-summary")).toContainText("Новые");
  await page.getByRole("button", { name: "Импортировать" }).click();
  const importResultDialog = page.getByRole("dialog", { name: "Результат импорта сотрудников" });
  await expect(importResultDialog).toBeVisible();
  await importResultDialog.getByRole("button", { name: "Закрыть" }).last().click();
  await expect(page.getByText("Смирнов Дмитрий Андреевич")).toBeVisible();

  await page.goto("/#inventory-issue");
  await expect(page.getByRole("heading", { name: "Выдача" })).toBeVisible();
  await page.getByRole("button", { name: "В черновик" }).first().click();
  await page.getByLabel("Сотрудник").selectOption("emp-1");
  await page.getByLabel("Комментарий").fill("Mock acceptance issue");
  await page.getByRole("button", { name: "Провести выдачу" }).last().click();
  await expect(page.locator(".inventory-issue-journal")).toContainText("MOCK-INV");

  await page.goto("/#inventory-ppe");
  await expect(page.getByRole("heading", { name: "СИЗ", exact: true })).toBeVisible();
  await expect(page.getByText("Журнал карточек СИЗ")).toBeVisible();
  await expect(page.getByText("Иванов Иван Иванович").first()).toBeVisible();

  await page.goto("/#inventory-custody");
  await expect(page.getByRole("heading", { name: "Под запись" })).toBeVisible();
  await expect(page.getByText("Актов под запись пока нет")).toBeVisible();

  await page.goto("/#inventory-settings");
  await expect(page.getByRole("heading", { name: "Настройки учета" })).toBeVisible();
  await expect(page.getByText("Группы номенклатуры")).toBeVisible();
  await expect(page.getByText("Атом Экология", { exact: true })).toBeVisible();

  await page.goto("/#inventory-history");
  await expect(page.getByRole("heading", { name: "История" })).toBeVisible();
  await expect(page.locator(".inventory-history-screen")).toContainText("Каска защитная");

  expect(inventoryApiRequests).toEqual([]);
});

test("inventory mock key routes fit desktop and mobile without API calls", async ({ page }) => {
  test.setTimeout(60_000);
  const inventoryApiRequests: string[] = [];
  const consoleIssues: string[] = [];

  await enableInventoryMock(page);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  await page.route("**/api/v1/inventory/**", (route) => {
    inventoryApiRequests.push(route.request().url());
    return route.abort();
  });

  for (const viewport of visualViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    for (const route of inventoryVisualRoutes) {
      await page.goto(`/${route.hash}`);
      await expect(page.locator(".inventory-web-workspace")).toBeVisible();
      await expect(page.locator(".inventory-web-workspace")).toContainText(route.text);
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      await expectNoPageHorizontalOverflow(page, `${route.hash} ${viewport.name}`);
    }
  }

  expect(inventoryApiRequests).toEqual([]);
  expect(consoleIssues).toEqual([]);
});

async function enableInventoryMock(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
  });
}

async function expectNoPageHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const bodyWidth = document.body?.scrollWidth ?? 0;
    const documentWidth = document.documentElement.scrollWidth;
    return Math.max(bodyWidth, documentWidth) - window.innerWidth;
  });

  expect(overflow, `${label} should not create page-level horizontal overflow`).toBeLessThanOrEqual(1);
}
