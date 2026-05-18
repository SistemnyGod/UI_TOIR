import { expect, test } from "@playwright/test";

test("dashboard shell loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Патруль 360/);
  await expect(page.getByRole("heading", { name: "Детальный дашборд обходов" })).toBeVisible();
});
