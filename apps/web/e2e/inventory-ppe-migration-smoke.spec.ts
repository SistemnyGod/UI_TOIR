import { expect, test } from "@playwright/test";

test("inventory PPE wizard supports employee search and set-based picking", async ({ page }) => {
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
      {
        id: "00000000-0000-0000-0000-000000000202",
        fullName: "Петров Петр Петрович",
        personnelNo: "T-002",
        position: "Слесарь",
        department: "РМЦ",
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
      itemSets: [
        {
          id: "00000000-0000-0000-0000-000000000701",
          name: "Базовый набор электромонтера",
          itemsCount: 1,
          isActive: true,
        },
      ],
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
  await page.route("**/api/v1/inventory/settings/item-sets/00000000-0000-0000-0000-000000000701/items", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "00000000-0000-0000-0000-000000000801",
          quantity: 1,
          item: ppeOptions.items[0],
        },
      ]),
    }),
  );

  await page.goto("/#inventory-ppe");

  await expect(page.getByRole("heading", { name: "Иванов Иван Иванович" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Выдать СИЗ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сопоставить" }).first()).toBeVisible();
});

test("inventory PPE preview uses detail payload and DOCX export endpoints", async ({ page }) => {
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
        linesCount: 1,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
    pageCount: 1,
  };

  const ppeOptions = {
    employees: [],
    items: [],
    settings: {
      categories: [],
      units: [],
      warehouses: [],
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

  const detailPayload = {
    id: "00000000-0000-0000-0000-000000000101",
    employeeId: "00000000-0000-0000-0000-000000000201",
    employeeName: "Иванов Иван Иванович",
    employeePersonnelNo: "001245",
    employeeDepartment: "Электромонтажный участок",
    position: "Электромонтер",
    status: "active",
    createdAt: "2026-05-22T08:00:00.000Z",
    lines: [
      {
        id: "00000000-0000-0000-0000-000000000901",
        itemId: "00000000-0000-0000-0000-000000000301",
        itemName: "Каска защитная",
        warehouseId: "00000000-0000-0000-0000-000000000601",
        warehouseName: "Основной склад",
        quantity: 1,
        unit: "шт.",
        status: "issued",
        issuedAt: "2026-05-22T08:00:00.000Z",
        dueAt: "2027-05-22T08:00:00.000Z",
        modelDescription: "РОСОМЗ / СОМЗ-55 / 78214 / 2 класс",
        normPoint: "Типовые нормы",
      },
    ],
  };

  const printRequests: string[] = [];

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
  await page.route("**/api/v1/inventory/ppe/cards/00000000-0000-0000-0000-000000000101", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(detailPayload),
    }),
  );
  await page.route("**/api/v1/inventory/ppe/cards/00000000-0000-0000-0000-000000000101/print**", async (route) => {
    printRequests.push(route.request().url());
    await route.fulfill({
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      headers: {
        "content-disposition": "attachment; filename=\"ppe.docx\"",
      },
      body: "docx",
    });
  });

  await page.goto("/#inventory-ppe");

  await page.getByRole("button", { name: "Личная карточка" }).first().click();
  await expect(page.locator(".inventory-ppe-print-modal")).toBeVisible();
  await expect(page.getByText("Каска защитная")).toBeVisible();
  await expect(page.getByText("001245")).toBeVisible();
  await expect(page.getByText("Электромонтажный участок")).toBeVisible();
  await expect(page.getByText("Типовые нормы")).toBeVisible();
  await page.locator(".inventory-ppe-print-modal").getByRole("button", { name: "Лист подписи" }).click();
  await expect(page.getByText("РОСОМЗ / СОМЗ-55 / 78214 / 2 класс")).toBeVisible();
  await page.locator(".inventory-ppe-print-modal .inventory-ppe-icon-button").click();
  await page.locator(".inventory-ppe-row-actions .button").first().click();
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.locator(".inventory-ppe-drawer-toolbar")).toBeVisible();
  await page.locator(".inventory-ppe-drawer-toolbar .button").nth(4).click();
  await page.locator(".inventory-ppe-drawer-toolbar .button").nth(5).click();

  await expect.poll(() => printRequests.length).toBe(2);
  await expect(printRequests[0]).toContain("type=card");
  await expect(printRequests[0]).toContain("format=docx");
  await expect(printRequests[1]).toContain("type=sheet");
  await expect(printRequests[1]).toContain("format=docx");
});
