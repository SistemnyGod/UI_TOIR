import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test("phone user filters and list-detail focus preserve search", async ({ page }) => {
  const user = { id: "test-admin", login: "phone-test", displayName: "Тестовый пользователь", roles: ["admin"], permissions: ["site_users.write", "dashboard.read"], status: "active", createdAt: "2026-09-01T00:00:00Z" };
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    localStorage.setItem("patrol360.sessionToken", "isolated-test-token");
  });
  // All API traffic stays inside the fixture; no working server is involved.
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/auth/me") ? user : path.endsWith("/site-users") ? [user] : path.endsWith("/emu/settings") ? { sections: [] } : [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#users");
  const search = page.getByRole("textbox", { name: "Поиск пользователей" });
  await search.fill("phone-test");
  const filters = page.getByRole("button", { name: "Фильтры пользователей", exact: true });
  await expect(page.getByRole("combobox", { name: "Роль", exact: true })).toBeHidden();
  await filters.click();
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("combobox", { name: "Роль", exact: true }).selectOption({ label: "Администратор" });
  await filters.click();
  const row = page.locator(".site-user-directory-row").filter({ hasText: "phone-test" });
  await expect(page.getByRole("status").filter({ hasText: "Фильтры: Администратор" })).toBeVisible();
  await row.click();
  const back = page.getByRole("button", { name: "← К списку пользователей", exact: true });
  await expect(back).toBeFocused();
  await expect(search).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(search).toHaveValue("phone-test");
  await expect(page.getByRole("combobox", { name: "Роль", exact: true })).toBeVisible();
  await expect(filters).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await back.click();
  await expect(row).toBeFocused();
  await expect(search).toHaveValue("phone-test");
  await filters.click();
  await expect(page.getByRole("combobox", { name: "Роль", exact: true })).toHaveValue("Администратор");
  await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  await expect(search).toHaveValue("phone-test");
  await expect(page.getByRole("combobox", { name: "Роль", exact: true })).toHaveValue("all");
});
