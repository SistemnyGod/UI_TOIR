import { expect, test } from "@playwright/test";

const adminUser = {
  id: "admin-1",
  login: "admin",
  displayName: "Администратор",
  roles: ["admin"],
  permissions: ["inventory.view", "inventory.settings.manage", "inventory.audit.view"],
};

const settingsPayload = {
  categories: [
    { id: "cat-ppe", name: "СИЗ", code: "ppe", isActive: true },
    { id: "cat-tools", name: "Инструмент", code: "tools", isActive: true },
  ],
  units: [
    { id: "unit-pcs", name: "Штука", code: "шт", isActive: true },
  ],
  warehouses: [
    { id: "wh-main", name: "Основной склад", code: "default", isActive: true },
  ],
  custodyCategories: [
    { id: "cust-tool", name: "Инструмент под запись", code: "tool", isActive: true },
  ],
  returnReasons: [
    { id: "return-normal", name: "Возврат после использования", code: "normal", isActive: true },
  ],
  writeOffReasons: [
    { id: "write-worn", name: "Износ", code: "worn", isActive: true },
  ],
  itemSets: [
    { id: "set-winter", name: "Зимний комплект", itemsCount: 2, isActive: true },
  ],
  positionNorms: [
    { id: "norm-driver", positionName: "Водитель погрузчика", itemId: "item-helmet", itemName: "Каска защитная", quantity: 1, lifeMonths: 12 },
  ],
  employeePositions: [
    { id: "pos-driver", name: "Водитель погрузчика", code: "driver", isActive: true },
  ],
  employeeDepartments: [
    { id: "dep-energy", name: "Энерго-механический участок", code: "energy", isActive: true },
  ],
  employeeGroups: [
    { id: "group-atom", name: "АТО", code: "atom", isActive: true },
  ],
};

const itemsPayload = {
  rows: [
    {
      id: "item-helmet",
      name: "Каска защитная",
      sku: "PPE-001",
      categoryId: "cat-ppe",
      category: "СИЗ",
      unitId: "unit-pcs",
      unit: "шт",
      balance: 10,
      stockPhysical: 10,
      stockReserved: 0,
      stockAvailable: 10,
      stockStatus: "normal",
      minStockQty: 1,
      itemKind: "ppe",
      normItemName: "Каска",
      actualItemName: "Каска защитная",
      brandName: "",
      modelName: "",
      article: "PPE-001",
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
    },
  ],
  total: 1,
  page: 1,
  pageSize: 2000,
  pageCount: 1,
};

test("inventory settings loads clean UTF-8 references and lazy-loads editor items", async ({ page }) => {
  const requests: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "test-token");
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(adminUser) }),
  );
  await page.route("**/api/v1/inventory/settings", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(settingsPayload) });
  });
  await page.route("**/api/v1/inventory/items**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(itemsPayload) });
  });
  await page.route("**/db-health**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        createdAt: "2026-05-23T08:00:00Z",
        issueCount: 0,
        criticalCount: 0,
        warningCount: 0,
        issues: [],
      }),
    });
  });

  await page.goto("/#inventory-settings");

  await expect(page.getByRole("heading", { name: "Настройки учета" })).toBeVisible();
  await expect(page.getByText("Группы номенклатуры")).toBeVisible();
  await expect(page.getByText("Энерго-механический участок")).toBeVisible();
  expect(requests.some((url) => url.includes("/inventory/items"))).toBeFalsy();

  await page.getByRole("button", { name: "Нормы СИЗ" }).click();
  await expect(page.getByText("Водитель погрузчика")).toBeVisible();
  await page.getByRole("button", { name: "Добавить норму" }).click();
  await expect(page.getByRole("dialog", { name: "Норма СИЗ" })).toBeVisible();
  await expect.poll(() => requests.some((url) => url.includes("/inventory/items") && url.includes("pageSize=2000"))).toBeTruthy();
  await expect(page.getByLabel("\u041F\u043E\u0437\u0438\u0446\u0438\u044F \u043D\u043E\u043C\u0435\u043D\u043A\u043B\u0430\u0442\u0443\u0440\u044B")).toContainText("\u041A\u0430\u0441\u043A\u0430 \u0437\u0430\u0449\u0438\u0442\u043D\u0430\u044F");

  await page.getByRole("button", { name: "Отмена" }).click();
  await page.getByRole("button", { name: "Состояние базы" }).click();
  await expect(page.getByText("Критичных проблем не найдено")).toBeVisible();

  const screenText = await page.locator(".inventory-settings-screen").innerText();
  expect(screenText).not.toMatch(/Рџ|РЎ|Рќ|Рђ|Р”|Р|СЃ|пїЅ/);
});
