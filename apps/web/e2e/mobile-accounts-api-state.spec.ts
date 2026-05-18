import { expect, test } from "@playwright/test";

test("mobile accounts API mode shows reloadable error state", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
  });
  await page.route("**/api/v1/mobile-accounts", (route) => route.abort());

  await page.goto("/#accounts");

  const errorState = page.getByText("Мобильные аккаунты API не загружены");
  await expect(errorState).toBeVisible();

  await page.getByRole("button", { name: "Повторить загрузку" }).click();

  await expect(errorState).toBeVisible();
});
