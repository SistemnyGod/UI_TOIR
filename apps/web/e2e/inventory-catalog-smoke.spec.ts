import { expect, test } from "@playwright/test";

test("inventory catalog screen renders imported items and filters", async ({ page }) => {
  const sessionUser = {
    id: "admin-1",
    login: "admin",
    displayName: "Admin",
    roles: ["admin"],
    permissions: ["dashboard.read", "site_users.write"],
  };

  const settings = {
    categories: [
      { id: "cat-tools", name: "Tools", code: "tools", isActive: true },
      { id: "cat-ppe", name: "PPE Smoke", code: "ppe-smoke", isActive: true },
    ],
    units: [
      { id: "unit-pcs", name: "pcs", code: "pcs", isActive: true },
      { id: "unit-set", name: "set", code: "set", isActive: true },
    ],
    warehouses: [],
    custodyCategories: [],
    returnReasons: [],
    writeOffReasons: [],
    itemSets: [],
    positionNorms: [],
    employeePositions: [],
    employeeDepartments: [],
    employeeGroups: [],
  };

  const facets = {
    total: 1347,
    active: 1324,
    inactive: 23,
    categories: [
      { id: "cat-tools", name: "Tools", count: 995 },
      { id: "cat-ppe", name: "PPE Smoke", count: 1 },
    ],
    units: [
      { id: "unit-pcs", name: "pcs", count: 1320 },
      { id: "unit-set", name: "set", count: 27 },
    ],
    trackingTypes: [{ id: "quantity", name: "Quantity", count: 1347 }],
    itemKinds: [{ id: "tool", name: "Tool", count: 995 }],
  };

  const items = {
    rows: [
      {
        id: "item-1",
        name: "Berger BG Long Socket Set",
        sku: "",
        categoryId: "cat-tools",
        category: "Tools",
        unitId: "unit-pcs",
        unit: "pcs",
        balance: 0,
        stockPhysical: 0,
        stockReserved: 0,
        stockAvailable: 0,
        stockStatus: "normal",
        minStockQty: null,
        itemKind: "tool",
        normItemName: "",
        actualItemName: "",
        brandName: "Berger",
        modelName: "",
        article: "",
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
      },
      {
        id: "item-2",
        name: "PPE Release Smoke Gloves",
        sku: "PPE-RELEASE-SMOKE",
        categoryId: "cat-ppe",
        category: "PPE Smoke",
        unitId: "unit-pcs",
        unit: "pcs",
        balance: 117,
        stockPhysical: 117,
        stockReserved: 0,
        stockAvailable: 117,
        stockStatus: "normal",
        minStockQty: 1,
        itemKind: "Gloves",
        normItemName: "Protective gloves",
        actualItemName: "PPE Release Smoke Gloves",
        brandName: "",
        modelName: "",
        article: "PPE-RELEASE-SMOKE",
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
        comment: "Protective gloves",
        isConsumable: false,
        trackLife: true,
        isActive: true,
        status: "active",
      },
    ],
    total: 1324,
    page: 1,
    pageSize: 20,
    pageCount: 67,
  };

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(sessionUser) }),
  );
  await page.route("**/api/v1/inventory/items**", (route) => {
    const url = route.request().url();
    if (url.includes("/items/facets")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(facets) });
    }

    return route.fulfill({ contentType: "application/json", body: JSON.stringify(items) });
  });
  await page.route("**/api/v1/inventory/settings", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(settings) }),
  );

  await page.goto("/#inventory-items");

  await expect(page.locator(".inventory-items-screen")).toBeVisible();
  await expect(page.locator(".inventory-items-kpis")).toContainText("1347");
  await expect(page.locator(".inventory-items-kpis")).toContainText("1324");
  await expect(page.getByRole("table").getByText("Berger BG Long Socket Set", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("PPE Release Smoke Gloves", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "PPE Smoke" })).toBeVisible();
  await expect(page.locator(".inventory-items-table .inventory-row-actions .inventory-icon-btn").first()).toBeVisible();
});
