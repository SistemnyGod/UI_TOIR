import { expect, test } from "@playwright/test";

test("mobile accounts API mode shows reloadable error state", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "operator-1",
        login: "operator",
        displayName: "Operator",
        roles: ["admin"],
        permissions: ["mobile_accounts.write"],
      }),
    }),
  );
  await page.route("**/api/v1/mobile-accounts", (route) => route.abort());

  await page.goto("/#accounts");

  const errorState = page.getByText("Мобильные аккаунты API не загружены");
  await expect(errorState).toBeVisible();

  await page.getByRole("button", { name: "Повторить загрузку" }).click();

  await expect(errorState).toBeVisible();
});
