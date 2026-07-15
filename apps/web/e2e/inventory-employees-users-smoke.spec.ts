import { expect, test } from "@playwright/test";

const mojibakePattern = new RegExp("\\u0420[\\u0402\\u040e\\u045c\\u045f\\u0098\\u201d]|\\u0421\\u0453|\\u0412\\u00b7");

const adminUser = {
  id: "admin-1",
  login: "admin",
  displayName: "Администратор",
  roles: ["admin"],
  permissions: ["inventory.view", "inventory.import", "inventory.settings.manage", "inventory.users.manage"],
};

const employeesPayload = {
  rows: [
    {
      id: "00000000-0000-0000-0000-00000000e101",
      fullName: "Иванов Иван Иванович",
      personnelNo: "TAB-001",
      position: "Инженер",
      department: "Энерго-механический участок",
      employeeGroup: "ИТР",
      status: "active",
      hiredAt: "2026-01-10",
      birthDate: "1990-03-15",
    },
    {
      id: "00000000-0000-0000-0000-00000000e102",
      fullName: "Петров Петр Петрович",
      personnelNo: "TAB-002",
      position: "Слесарь",
      department: "Ремонтный участок",
      employeeGroup: "Рабочие",
      status: "archived",
      hiredAt: null,
      birthDate: null,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
  pageCount: 1,
};

const usersPayload = {
  rows: [
    {
      id: "00000000-0000-0000-0000-00000000u101",
      login: "admin",
      displayName: "Администратор",
      status: "active",
      roles: ["admin", "inventory"],
    },
    {
      id: "00000000-0000-0000-0000-00000000u102",
      login: "operator",
      displayName: "Оператор",
      status: "active",
      roles: ["operator"],
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
  pageCount: 1,
};

test("inventory employees and users use server filters and actions", async ({ page }) => {
  const requests: string[] = [];
  const actionUrls: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(adminUser) }),
  );
  await page.route("**/api/v1/inventory/employees**", (route) => {
    requests.push(route.request().url());
    if (route.request().method() === "PATCH") {
      actionUrls.push(route.request().url());
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...employeesPayload.rows[0], status: "archived" }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(employeesPayload) });
  });
  await page.route("**/api/v1/inventory/users**", (route) => {
    requests.push(route.request().url());
    if (route.request().method() === "PATCH") {
      actionUrls.push(route.request().url());
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...usersPayload.rows[1], status: "disabled" }) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(usersPayload) });
  });

  await page.goto("/#inventory-employees");
  await expect(page.getByRole("heading", { name: "Сотрудники учета" })).toBeVisible();
  await expect(page.getByRole("table").getByText("Иванов Иван Иванович")).toBeVisible();
  await page.getByPlaceholder("Поиск по ФИО, табельному, должности или подразделению").fill("Иванов");
  await expect.poll(() => requests.some((url) => url.includes("/employees") && url.includes("query=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2"))).toBeTruthy();
  await page.getByRole("button", { name: "Архив" }).first().click();
  await page.getByRole("button", { name: "Архивировать" }).click();
  await expect.poll(() => actionUrls.some((url) => url.includes("/employees/") && url.includes("/archive"))).toBeTruthy();

  const employeesText = await page.locator(".inventory-employees-screen").innerText();
  expect(employeesText).not.toMatch(mojibakePattern);

  await page.goto("/#inventory-users");
  await expect(page.getByRole("heading", { name: "Пользователи Inventory" })).toBeVisible();
  await expect(page.getByText("Оператор")).toBeVisible();
  await page.getByPlaceholder("Поиск по логину, имени или роли").fill("operator");
  await expect.poll(() => requests.some((url) => url.includes("/users") && url.includes("query=operator"))).toBeTruthy();
  await page.getByRole("button", { name: "Отключить" }).last().click();
  await expect.poll(() => actionUrls.some((url) => url.includes("/users/") && url.includes("/disable"))).toBeTruthy();

  const usersText = await page.locator(".inventory-users-screen").innerText();
  expect(usersText).not.toMatch(mojibakePattern);
});

test("inventory users screen shows permission error without users.manage", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...adminUser, permissions: ["inventory.view"] }),
    }),
  );
  await page.route("**/api/v1/inventory/users**", (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) }),
  );

  await page.goto("/#inventory-users");
  await expect(page.getByText("API пользователей не ответил")).toBeVisible();
});
