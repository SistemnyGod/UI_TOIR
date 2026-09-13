import { expect, test } from "@playwright/test";

test("catalog switches from phone cards to desktop table and back", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#inventory-items");
  const table = page.locator(".inventory-items-table");
  await expect(table).toBeVisible();
  for (const width of [390, 768, 1280, 1366, 1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width >= 1200) {
      await expect(page.locator(".sidebar")).not.toHaveAttribute("inert", "");
      await expect(page.getByRole("button", { name: "Открыть навигацию", exact: true })).toBeHidden();
      expect(await table.locator("td.inventory-table-main-cell").first().evaluate(e => getComputedStyle(e).display)).toBe("table-cell");
      const copy = table.locator("td.inventory-table-main-cell > span:last-child").first();
      expect((await copy.boundingBox())!.width).toBeGreaterThan(120);
      await expect(page.getByRole("button", { name: "Сводка номенклатуры", exact: true })).toHaveCount(0);
    } else if (width === 390) {
      await expect(page.getByRole("button", { name: "Сводка номенклатуры", exact: true })).toBeVisible();
      expect(await table.locator("tbody tr").first().evaluate(e => getComputedStyle(e).display)).toBe("grid");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("grouped navigation preserves pages and opens modules from collapsed desktop rail", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/#inventory-items");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar.getByText("Справочники", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Номенклатура", exact: true })).toHaveAttribute("aria-current", "page");
  for (const name of ["Под запись", "Права Inventory", "Системный журнал"]) {
    await expect(sidebar.getByRole("button", { name, exact: true })).toHaveCount(1);
  }
  await sidebar.getByRole("button", { name: "Свернуть меню", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await sidebar.getByRole("button", { name: "Бухгалтерия", exact: true }).click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/sidebar-collapsed/);
  await sidebar.getByRole("button", { name: "СИЗ", exact: true }).click();
  await expect(page).toHaveURL(/#inventory-ppe$/);
});
