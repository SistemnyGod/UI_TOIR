import { expect, test } from "@playwright/test";

test("inventory operations screen posts stock operations from dedicated options", async ({ page }) => {
  const sessionUser = {
    id: "admin-1",
    login: "admin",
    displayName: "Admin",
    roles: ["admin"],
    permissions: ["dashboard.read", "site_users.write"],
  };
  const employeeId = "00000000-0000-0000-0000-00000000e301";
  const itemId = "00000000-0000-0000-0000-00000000a301";
  const warehouseId = "00000000-0000-0000-0000-00000000b301";
  const settings = {
    categories: [{ id: "cat-tools", name: "Tools", code: "tools", isActive: true }],
    units: [{ id: "unit-pcs", name: "pcs", code: "pcs", isActive: true }],
    warehouses: [{ id: warehouseId, name: "Main Warehouse", code: "MAIN", isActive: true }],
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
    name: "Operations Smoke Wrench",
    sku: "OPS-001",
    categoryId: "cat-tools",
    category: "Tools",
    unitId: "unit-pcs",
    unit: "pcs",
    balance: 12,
    stockPhysical: 12,
    stockReserved: 0,
    stockAvailable: 12,
    stockStatus: "normal",
    minStockQty: 1,
    itemKind: "tool",
    normItemName: "",
    actualItemName: "",
    brandName: "",
    modelName: "",
    article: "OPS-001",
    protectionClass: "",
    clothingSize: "",
    heightSize: "",
    shoeSize: "",
    headSize: "",
    gloveSize: "",
    respiratorSize: "",
    defaultLifeMonths: null,
    defaultUnitPriceMinor: 0,
    trackingType: "quantity",
    comment: "",
    isConsumable: false,
    trackLife: false,
    isActive: true,
    status: "active",
  };
  const employee = {
    id: employeeId,
    fullName: "Operations Smoke Employee",
    personnelNo: "OPS-EMP",
    position: "Operator",
    department: "QA",
    employeeGroup: "QA",
    status: "active",
    birthDate: null,
    hiredAt: null,
  };
  const stockRow = {
    itemId,
    itemName: item.name,
    warehouseId,
    warehouseName: "Main Warehouse",
    balance: 12,
    stockPhysical: 12,
    stockReserved: 0,
    stockAvailable: 12,
    unit: "pcs",
    status: "normal",
  };
  const documents = {
    rows: [
      {
        id: "00000000-0000-0000-0000-00000000d301",
        number: "INV-OPS-001",
        type: "receipt",
        employeeName: "",
        status: "posted",
        createdAt: "2026-05-22T08:00:00.000Z",
        itemName: item.name,
        warehouseName: "Main Warehouse",
        quantity: 12,
        unit: "pcs",
        comment: "inventory_operation",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
    pageCount: 1,
  };
  let postedPayload: unknown = null;
  const cardId = "00000000-0000-0000-0000-00000000c301";
  const lineId = "00000000-0000-0000-0000-00000000c302";

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionUser) }),
  );
  await page.route("**/api/v1/inventory/documents**", async (route) => {
    if (route.request().method() === "POST") {
      postedPayload = await route.request().postDataJSON();
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...documents.rows[0],
          id: "00000000-0000-0000-0000-00000000d302",
          number: "INV-OPS-002",
          quantity: 2,
          comment: "Smoke operation",
        }),
      });
    }

    return route.fulfill({ contentType: "application/json", body: JSON.stringify(documents) });
  });
  await page.route("**/api/v1/inventory/operations/options", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        employees: [employee],
        items: [item],
        settings,
        stock: [stockRow],
        operationTypes: ["receipt", "return", "write_off", "issue"],
      }),
    }),
  );
  await page.route("**/api/v1/inventory/ppe/movements**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        rows: [{
          cardId,
          lineId,
          employeeId,
          employeeName: employee.fullName,
          itemId,
          itemName: item.name,
          quantity: 1,
          unit: "pcs",
          status: "issued",
          issuedAt: "2026-05-22T08:00:00.000Z",
          dueAt: null,
          comment: "Smoke movement",
        }],
        total: 1,
        page: 1,
        pageSize: 200,
        pageCount: 1,
      }),
    }),
  );
  await page.route(`**/api/v1/inventory/ppe/cards/${cardId}/lines/${lineId}/status`, async (route) => {
    postedPayload = await route.request().postDataJSON();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: lineId, status: "returned" }) });
  });

  await page.goto("/#inventory-operations");

  await expect(page.locator(".inventory-operations-screen")).toBeVisible();
  await page.getByRole("button", { name: /Operations Smoke Employee/ }).click();
  await expect(page.locator(".inventory-operations-kpis")).toContainText("Можно вернуть/списать1");
  await expect(page.getByRole("button", { name: /Operations Smoke Wrench/ })).toBeVisible();
  await page.getByText("Комментарий / основание").locator("..").getByRole("textbox").fill("Smoke operation");
  await page.getByRole("button", { name: "Провести возврат" }).click();

  await expect.poll(() => postedPayload).toMatchObject({
    comment: "Smoke operation",
    status: "returned",
  });
});
