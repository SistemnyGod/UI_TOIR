import { expect, test } from "@playwright/test";

test("inventory issue screen uses dedicated options and posts issue documents", async ({ page }) => {
  const sessionUser = {
    id: "admin-1",
    login: "admin",
    displayName: "Администратор",
    roles: ["admin"],
    permissions: ["inventory.view", "inventory.issue.manage"],
  };
  const employeeId = "00000000-0000-0000-0000-00000000e401";
  const itemId = "00000000-0000-0000-0000-00000000a401";
  const warehouseId = "00000000-0000-0000-0000-00000000b401";
  const settings = {
    categories: [{ id: "cat-ppe", name: "СИЗ", code: "ppe", isActive: true }],
    units: [{ id: "unit-pcs", name: "Штука", code: "шт", isActive: true }],
    warehouses: [{ id: warehouseId, name: "Основной склад", code: "MAIN", isActive: true }],
    custodyCategories: [],
    returnReasons: [],
    writeOffReasons: [],
    itemSets: [],
    positionNorms: [],
    employeePositions: [],
    employeeDepartments: [],
    employeeGroups: [],
  };
  const item = {
    id: itemId,
    name: "Каска для issue smoke",
    sku: "ISSUE-001",
    categoryId: "cat-ppe",
    category: "СИЗ",
    unitId: "unit-pcs",
    unit: "шт",
    balance: 8,
    stockPhysical: 8,
    stockReserved: 0,
    stockAvailable: 8,
    stockStatus: "normal",
    minStockQty: 1,
    itemKind: "ppe",
    normItemName: "Каска",
    actualItemName: "Каска для issue smoke",
    brandName: "",
    modelName: "",
    article: "ISSUE-001",
    protectionClass: "",
    clothingSize: "",
    heightSize: "",
    shoeSize: "",
    headSize: "",
    gloveSize: "",
    respiratorSize: "",
    defaultLifeMonths: 12,
    defaultUnitPriceMinor: 0,
    trackingType: "quantity",
    comment: "",
    isConsumable: false,
    trackLife: true,
    isActive: true,
    status: "active",
  };
  const employee = {
    id: employeeId,
    fullName: "Иванов Иван Иванович",
    personnelNo: "ISS-EMP",
    position: "Оператор",
    department: "Склад",
    employeeGroup: "АТО",
    status: "active",
    birthDate: null,
    hiredAt: null,
  };
  const stockRow = {
    itemId,
    itemName: item.name,
    warehouseId,
    warehouseName: "Основной склад",
    balance: 8,
    stockPhysical: 8,
    stockReserved: 0,
    stockAvailable: 8,
    unit: "шт",
    status: "normal",
  };
  const documents = {
    rows: [
      {
        id: "00000000-0000-0000-0000-00000000d401",
        number: "INV-ISSUE-001",
        type: "issue",
        employeeName: employee.fullName,
        status: "posted",
        createdAt: "2026-05-23T08:00:00.000Z",
        itemName: item.name,
        warehouseName: "Основной склад",
        quantity: -1,
        unit: "шт",
        comment: "existing issue",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
    pageCount: 1,
  };
  let postedPayload: unknown = null;
  const requests: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionUser) }),
  );
  await page.route("**/api/v1/inventory/issues**", (route) => {
    requests.push(route.request().url());
    if (route.request().url().includes("/options")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          employees: [employee],
          items: [item],
          settings,
          stock: [stockRow],
          operationTypes: ["issue"],
        }),
      });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(documents) });
  });
  await page.route("**/api/v1/inventory/documents", async (route) => {
    requests.push(route.request().url());
    postedPayload = await route.request().postDataJSON();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...documents.rows[0],
        id: "00000000-0000-0000-0000-00000000d402",
        number: "INV-ISSUE-002",
        comment: "Smoke issue",
        quantity: -2,
      }),
    });
  });

  await page.goto("/#inventory-issue");

  await expect(page.getByRole("heading", { name: "Выдача" })).toBeVisible();
  await expect(page.locator(".inventory-issue-kpis")).toContainText("1");
  await expect(page.locator(".inventory-issue-item-grid").getByText("Каска для issue smoke")).toBeVisible();
  await expect(page.getByText("INV-ISSUE-001")).toBeVisible();
  expect(requests.some((url) => url.includes("/inventory/employees"))).toBeFalsy();
  expect(requests.some((url) => url.includes("/inventory/items?"))).toBeFalsy();
  expect(requests.some((url) => url.includes("/inventory/settings"))).toBeFalsy();

  await page.getByRole("button", { name: "В черновик" }).click();
  await page.getByLabel("Сотрудник").selectOption(employeeId);
  await page.locator(".inventory-issue-draft-lines article").getByLabel("Кол-во").fill("2");
  await page.getByLabel("Комментарий").fill("Smoke issue");
  await page.getByRole("button", { name: "Провести выдачу" }).last().click();

  await expect.poll(() => postedPayload).toMatchObject({
    comment: "Smoke issue",
    employeeId,
    itemId,
    quantity: 2,
    type: "issue",
    warehouseId,
  });

  const screenText = await page.locator(".inventory-issue-screen").innerText();
  expect(screenText).not.toMatch(/Рџ|РЎ|Рќ|Рђ|Р”|Р|СЃ|пїЅ/);
});
