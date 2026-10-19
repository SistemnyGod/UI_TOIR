import { expect, test } from "@playwright/test";

test("full PPE journal paginates and opens employee history on desktop and phone", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    localStorage.setItem("patrol360.sessionToken", "synthetic-journal");
  });
  await page.route("**/api/**", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "fixture", login: "pilot", displayName: "Оператор", roles: ["admin"], permissions: ["inventory.view", "inventory.ppe.manage", "inventory.reports.export"] } }));
  await page.route("**/issue-documents/capabilities", route => route.fulfill({ json: { enabled: true } }));
  const requests: URL[] = [];
  await page.route("**/issue-documents/journal?*", route => {
    const url = new URL(route.request().url()); requests.push(url);
    const size = Number(url.searchParams.get("pageSize")); const current = Number(url.searchParams.get("page"));
    return route.fulfill({ json: { items: [{ id: "doc", employeeId: "exact-id", employeeName: "Иванов Иван Иванович", personnelNo: "001", department: "Очень длинное название производственного подразделения", status: "confirmed", version: 1, linesCount: 0, totalMinor: 0, documentDate: "2026-09-14" }], total: 230, page: current, pageSize: size, pageCount: Math.ceil(230 / size), departments: ["Цех"], summary: { total: 230, confirmed: 200, draft: 30, overdue: 0, cancelled: 0 } } });
  });
  await page.route("**/issue-documents/doc", route => route.fulfill({ json: { id: "doc", status: "confirmed", content: { employee: { id: "exact-id", fullName: "Иванов Иван Иванович", personnelNo: "001" }, documentDate: "2026-09-14", normRows: [], lines: [] } } }));
  await page.goto("/#inventory-ppe");
  await expect(page.getByText("1 / 23")).toBeVisible();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.getByText("2 / 23")).toBeVisible();
  await page.getByLabel("На странице").selectOption("100");
  await expect(page.getByText("1 / 3")).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 1200) {
      await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
      await expect.poll(() => page.locator(".sidebar").evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
    }
    await expect(page.getByRole("button", { name: "Иванов Иван Иванович" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/ppe-journal-${width}.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Иванов Иван Иванович" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: `test-results/ppe-journal-detail-${width}.png`, fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "История сотрудника" }).click();
    await expect.poll(() => requests.at(-1)?.searchParams.get("employeeId")).toBe("exact-id");
  }
});
