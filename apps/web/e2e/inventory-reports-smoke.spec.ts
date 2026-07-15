import { expect, test } from "@playwright/test";

test("inventory reports screen filters reports and downloads export files", async ({ page }) => {
  const sessionUser = {
    id: "admin-1",
    login: "admin",
    displayName: "Admin",
    roles: ["admin"],
    permissions: ["inventory.view", "inventory.reports.view", "inventory.reports.export", "inventory.audit.view"],
  };
  const reports = {
    rows: [
      {
        id: "stock",
        title: "Stock report",
        description: "Current stock by warehouses and items",
        format: "xlsx",
      },
      {
        id: "custody",
        title: "Custody report",
        description: "Custody documents and records",
        format: "pdf/docx/xlsx",
      },
      {
        id: "system_log",
        title: "System log",
        description: "Audit journal",
        format: "xlsx",
      },
    ],
    total: 3,
    page: 1,
    pageSize: 100,
    pageCount: 1,
  };
  const exportUrls: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionUser) }),
  );
  await page.route("**/api/v1/inventory/reports**", async (route) => {
    if (route.request().url().includes("/export")) {
      exportUrls.push(route.request().url());
      return route.fulfill({
        body: "report-file",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers: { "content-disposition": "attachment; filename=\"inventory-stock.xlsx\"" },
      });
    }

    return route.fulfill({ contentType: "application/json", body: JSON.stringify(reports) });
  });
  for (const endpoint of ["documents", "custody/records", "history", "items"]) {
    await page.route(`**/api/v1/inventory/${endpoint}**`, (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ rows: [], total: 0, page: 1, pageSize: 500, pageCount: 0 }) }),
    );
  }

  await page.goto("/#inventory-reports");

  await expect(page.locator(".inventory-reports-screen")).toBeVisible();
  await expect(page.locator(".inventory-reports-kpis")).toContainText("Всего выдано0");
  await expect(page.getByRole("heading", { name: "Stock report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Custody report" })).toBeVisible();

  await page.getByPlaceholder("Поиск отчета по названию или описанию").fill("custody");
  await expect(page.getByRole("heading", { name: "Custody report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stock report" })).toBeHidden();

  await page.getByPlaceholder("Поиск отчета по названию или описанию").fill("");
  await page.locator(".inventory-reports-card").filter({ hasText: "Stock report" }).getByRole("button", { name: "XLSX" }).click();

  await expect.poll(() => exportUrls.length).toBe(1);
  await expect(exportUrls[0]).toContain("/api/v1/inventory/reports/stock/export");
  await expect(exportUrls[0]).toContain("format=xlsx");
});
