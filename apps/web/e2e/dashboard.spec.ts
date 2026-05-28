import { expect, test } from "@playwright/test";

test("dashboard shell loads", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
  });

  await page.goto("/");

  await expect(page).toHaveTitle(/Патруль 360/);
  await expect(page.getByRole("heading", { name: "Оперативная сводка" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Активные обходы" })).toBeVisible();
});
