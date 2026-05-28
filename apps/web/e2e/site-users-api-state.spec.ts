import { expect, test } from "@playwright/test";

test("site users API mode renders users and creates temporary password panel", async ({ page }) => {
  const sessionUser = {
    id: "admin-1",
    login: "admin",
    displayName: "Администратор",
    roles: ["admin"],
    permissions: ["site_users.write"],
  };
  const users = [
    {
      id: "admin-1",
      login: "admin",
      displayName: "Администратор",
      roles: ["admin"],
      status: "active",
      createdAt: "2026-05-18T12:00:00Z",
      lastLoginAt: "2026-05-18T12:30:00Z",
      permissions: ["dashboard.read", "site_users.write"],
    },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(sessionUser),
    }),
  );
  await page.route("**/api/v1/site-users", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(users),
      });
    }

    return route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        user: {
          id: "operator-1",
          login: "operator1",
          displayName: "Иванов Иван",
          roles: ["operator"],
          status: "active",
          createdAt: "2026-05-18T13:00:00Z",
          lastLoginAt: null,
          permissions: ["dashboard.read"],
        },
        temporaryPassword: "Patrol-123456!",
      }),
    });
  });

  await page.goto("/#users");

  await expect(page.getByRole("heading", { name: "Пользователи сайта" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "admin" })).toBeVisible();

  await page.getByPlaceholder("Введите логин").fill("operator1");
  await page.getByPlaceholder("Введите ФИО сотрудника").fill("Иванов Иван");
  await page.getByRole("button", { name: "Сохранить" }).click();

  await expect(page.getByText("Patrol-123456!")).toBeVisible();
});
