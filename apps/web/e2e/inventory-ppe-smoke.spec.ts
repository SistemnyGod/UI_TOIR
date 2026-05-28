import { expect, test } from "@playwright/test";

test("inventory PPE screen renders journal and create wizard", async ({ page }) => {
  const sessionUser = {
    id: "admin-1",
    login: "admin",
    displayName: "Администратор",
    roles: ["admin"],
    permissions: ["dashboard.read", "site_users.write"],
  };

  const ppeCards = {
    rows: [
      {
        id: "00000000-0000-0000-0000-000000000101",
        employeeId: "00000000-0000-0000-0000-000000000201",
        employeeName: "Иванов Иван Иванович",
        position: "Электромонтер",
        status: "active",
        linesCount: 2,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
    pageCount: 1,
  };

  const ppeOptions = {
    employees: [
      {
        id: "00000000-0000-0000-0000-000000000201",
        fullName: "Иванов Иван Иванович",
        personnelNo: "T-001",
        position: "Электромонтер",
        department: "Цех 1",
        status: "active",
        employeeGroup: "Производство",
        hiredAt: null,
        birthDate: null,
      },
    ],
    items: [
      {
        id: "00000000-0000-0000-0000-000000000301",
        name: "Каска защитная",
        sku: "PPE-001",
        categoryId: "00000000-0000-0000-0000-000000000401",
        category: "Голова",
        unitId: "00000000-0000-0000-0000-000000000501",
        unit: "шт.",
        balance: 10,
        stockPhysical: 10,
        stockReserved: 0,
        stockAvailable: 10,
        stockStatus: "normal",
        minStockQty: 1,
        itemKind: "ppe",
        normItemName: "Каска",
        actualItemName: "Каска защитная",
        brandName: "UVEX",
        modelName: "Фаворит",
        article: "UV-01",
        protectionClass: "",
        clothingSize: "",
        heightSize: "",
        shoeSize: "",
        headSize: "",
        gloveSize: "",
        respiratorSize: "",
        defaultLifeMonths: 12,
        defaultUnitPriceMinor: 250000,
        trackingType: "ppe",
        comment: "",
        isConsumable: false,
        trackLife: true,
        isActive: true,
        status: "active",
      },
    ],
    settings: {
      categories: [
        {
          id: "00000000-0000-0000-0000-000000000401",
          name: "Голова",
          code: "head",
          isActive: true,
        },
      ],
      units: [],
      warehouses: [
        {
          id: "00000000-0000-0000-0000-000000000601",
          name: "Основной склад",
          code: "main",
          isActive: true,
        },
      ],
      custodyCategories: [],
      returnReasons: [],
      writeOffReasons: [],
      itemSets: [],
      positionNorms: [],
      employeePositions: [],
      employeeDepartments: [],
      employeeGroups: [],
    },
    statuses: ["active", "issued", "not_issued", "returned", "written_off"],
  };

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
  await page.route("**/api/v1/inventory/ppe/cards**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(ppeCards),
    }),
  );
  await page.route("**/api/v1/inventory/ppe/options", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(ppeOptions),
    }),
  );

  await page.goto("/#inventory-ppe");

  await expect(page.getByRole("heading", { name: "СИЗ" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Иванов Иван Иванович", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать карточку" })).toBeVisible();

  await page.getByRole("button", { name: "Создать карточку" }).click();

  await expect(page.getByRole("heading", { name: "Создание карточки СИЗ" })).toBeVisible();
  await expect(page.getByText("Данные сотрудника")).toBeVisible();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();

  await page.getByRole("button", { name: "Добавить СИЗ" }).click();

  await expect(page.getByRole("heading", { name: "Добавить СИЗ к выдаче" })).toBeVisible();
  await page.getByRole("button", { name: /Каска защитная/i }).click();
  await page.getByRole("button", { name: "Добавить в карточку" }).click();

  await expect(page.getByRole("cell", { name: "Каска защитная", exact: true })).toBeVisible();
});
