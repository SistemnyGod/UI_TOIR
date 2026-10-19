import { expect, test } from "@playwright/test";

test("PPE workspace stays readable on phone, tablet and desktop", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.goto("/#inventory-ppe");
  await page.getByRole("button", { name: "Нормы и личные карточки" }).click();
  await expect(page.locator(".ppe-v2-employee-identity h2")).toBeVisible();
  for (const [width, height] of [[390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/ppe-design-${width}.png`, animations: "disabled" });
  }
  await page.getByRole("tab", { name: /Фактическая выдача/ }).click();
  await expect(page.getByRole("tab", { name: /Фактическая выдача/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /Печать/ }).click();
  await expect(page.locator(".ppe-v2-print-grid")).toBeVisible();
});
