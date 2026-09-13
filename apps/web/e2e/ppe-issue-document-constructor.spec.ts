import { expect, test, type Page, type Route } from "@playwright/test";

const employeeId = "00000000-0000-0000-0000-000000000201";
const normSetId = "00000000-0000-0000-0000-000000000301";
const normRowId = "00000000-0000-0000-0000-000000000401";
const itemId = "00000000-0000-0000-0000-000000000501";
const documentId = "00000000-0000-0000-0000-000000000601";

test("PPE issue document constructor persists, reopens, confirms, and fits desktop/mobile", async ({ page }) => {
  const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
  let storedDocument: ReturnType<typeof draftDocument> = draftDocument();

  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("ppe-issue-document-e2e-initialized")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("ppe-issue-document-e2e-initialized", "true");
    }
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    window.localStorage.setItem("patrol360.sessionToken", "fixture-token");
  });

  page.on("request", (request) => {
    if (request.url().includes("/api/") && !request.url().startsWith("http://127.0.0.1")) {
      throw new Error(`Unexpected non-local API request: ${request.url()}`);
    }
  });

  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/api/v1/auth/me", (route) => fulfill(route, {
    id: "fixture-user",
    login: "pilot",
    displayName: "Оператор пилота",
    roles: ["admin"],
    permissions: ["inventory.view", "inventory.ppe.manage", "inventory.ppe.norms.manage"],
  }));
  await page.route("**/api/v1/inventory/employees**", (route) => fulfill(route, {
    rows: [{
      id: employeeId,
      fullName: "Иванов Иван Иванович",
      personnelNo: "P-001",
      position: "Электромонтер",
      department: "Энергоучасток",
      status: "active",
      employeeGroup: "Производство",
      hiredAt: null,
      birthDate: null,
    }],
    total: 1,
    page: 1,
    pageSize: 200,
    pageCount: 1,
  }));
  await page.route("**/api/v1/inventory/ppe/issue-documents**", async (route) => {
    recordRequest(requests, route);
    if (route.request().method() === "GET") return fulfill(route, []);
    storedDocument = documentFromPayload(route.request().postDataJSON());
    return fulfill(route, storedDocument);
  });
  await page.route("**/api/v1/inventory/ppe/issue-documents/capabilities", (route) => fulfill(route, { enabled: true }));
  await page.route("**/api/v1/inventory/ppe/issue-documents/norms**", (route) => fulfill(route, [normSet()]));
  await page.route(`**/api/v1/inventory/ppe/norm-sets/${normSetId}`, (route) => fulfill(route, normDetail()));
  await page.route(`**/api/v1/inventory/ppe/issue-documents/${documentId}`, async (route) => {
    recordRequest(requests, route);
    if (route.request().method() === "GET") return fulfill(route, storedDocument);
    storedDocument = documentFromPayload(route.request().postDataJSON(), storedDocument);
    return fulfill(route, storedDocument);
  });
  await page.route(`**/api/v1/inventory/ppe/issue-documents/${documentId}/validate`, async (route) => {
    recordRequest(requests, route);
    storedDocument = { ...storedDocument, validation: cleanValidation() };
    return fulfill(route, storedDocument);
  });
  await page.route(`**/api/v1/inventory/ppe/issue-documents/${documentId}/confirm`, async (route) => {
    recordRequest(requests, route);
    storedDocument = { ...storedDocument, status: "confirmed", version: storedDocument.version + 1, confirmedAt: "2026-09-08T10:00:00Z" };
    return fulfill(route, storedDocument);
  });

  await page.goto("/#inventory-ppe-create");
  await expect(page.getByRole("heading", { name: "Документ выдачи СИЗ" })).toBeVisible();
  await captureStep(page, "step-1-employee");

  await page.getByLabel("Сотрудник").selectOption(employeeId);
  await page.getByLabel("Дата документа").fill("2026-09-08");
  await page.getByLabel("Нормативный набор").selectOption(normSetId);
  await page.getByLabel("Ответственный").fill("Петров Петр Петрович");
  await page.getByLabel("Основание").fill("Приказ № 42");
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.locator(".ppe-document-steps .is-active")).toContainText("Подбор");
  await captureStep(page, "step-2-selection");

  await page.getByRole("button", { name: "Каска защитная UVEX Air", exact: true }).click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.locator(".ppe-document-steps .is-active")).toContainText("Параметры строк");
  await expect(page.locator(".ppe-document-lines article").first().getByText("Каска защитная", { exact: true })).toBeVisible();

  const line = page.locator(".ppe-document-lines article").first();
  await line.getByLabel("Дата").fill("2026-09-07");
  await line.getByLabel("Количество").fill("2");
  await line.getByLabel("Цена, руб.").fill("1250.50");
  await captureStep(page, "step-3-lines");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByRole("heading", { name: "Проверка документа" })).toBeVisible();
  await captureStep(page, "step-4-review");

  const putsBeforeReopen = requests.filter((entry) => entry.method === "PUT" && entry.url.endsWith(documentId)).length;
  await page.reload();
  await expect(page.locator(".ppe-document-steps .is-active")).toContainText("Подбор");
  await page.waitForTimeout(700);
  expect(requests.filter((entry) => entry.method === "PUT" && entry.url.endsWith(documentId))).toHaveLength(putsBeforeReopen);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.locator(".ppe-document-steps .is-active")).toContainText("Параметры строк");
  await expect(page.locator(".ppe-document-lines article").first().getByLabel("Количество")).toHaveValue("2");
  await expect(page.locator(".ppe-document-lines article").first().getByLabel("Цена, руб.")).toHaveValue("1250.50");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByRole("heading", { name: "Проверка документа" })).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.locator('.ppe-document-saved[data-status="confirmed"]')).toBeVisible();

  const updatePayloads = requests.filter((entry) => entry.method === "PUT" && entry.url.endsWith(documentId));
  const updatePayload = updatePayloads[updatePayloads.length - 1]?.body;
  expect(updatePayload).toEqual(expect.objectContaining({ employeeId, normSetId, documentDate: "2026-09-08" }));
  expect(updatePayload?.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ normRowId, itemId, issueDate: "2026-09-07", quantity: 2, unitPriceMinor: 125050 }),
  ]));
  expect(requests.some((entry) => entry.method === "POST" && entry.url.endsWith("/confirm"))).toBe(true);
});

async function captureStep(page: Page, name: string) {
  for (const viewport of [{ width: 1365, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page, `${name} ${viewport.width}px`);
    await page.locator(".ppe-document-screen").screenshot({ path: `test-results/ppe-issue-document-${name}-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1365, height: 768 });
}

function normSet() {
  return { id: normSetId, positionName: "Электромонтер", versionName: "2026", effectiveFrom: "2026-01-01", effectiveTo: null, sourceName: "Fixture", status: "active", requiresReview: false, version: 1, rowsCount: 1, departmentName: "Энергоучасток", positionAliases: ["Электромонтер"], scopeConfirmed: true };
}

function normDetail() {
  return { normSet: normSet(), rows: [{ id: normRowId, parentRowId: null, rowType: "item", sortOrder: 1, normItemName: "Каска защитная", normPoint: "п. 1", issuePeriodText: "1 год", quantity: 2, quantityText: "2 шт.", lifeMonths: 12, unitSymbol: "шт.", periodMonths: null, requirementKey: "00000000-0000-0000-0000-000000000701", alternativeGroup: "", mappings: [{ id: "00000000-0000-0000-0000-000000000801", normRowId, itemId, itemName: "Каска защитная", itemSku: "PPE-001", brandModelArticle: "UVEX Air", defaultUnitPriceMinor: 100000, isDefault: true, comment: "", isApproved: true, normUnitsPerItem: 1, approvalEvidence: "fixture" }] }], itemRowsCount: 1, mappedItemRowsCount: 1, unmappedItemRowsCount: 0 };
}

function cleanValidation() {
  return { errors: [], warnings: [], entitlements: [], totalMinor: 250100 };
}

function draftDocument() {
  return { id: documentId, version: 1, status: "draft", createdAt: "2026-09-08T09:00:00Z", confirmedAt: null, content: { employee: { id: employeeId, fullName: "Иванов Иван Иванович", personnelNo: "P-001", department: "Энергоучасток", position: "Электромонтер", details: { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" } }, normSetId, normSetVersion: 1, normVersionName: "2026", normSourceName: "Fixture", documentDate: "2026-09-08", responsibleName: "Петров Петр Петрович", basis: "Приказ № 42", normRows: normDetail().rows, lines: [] }, validation: cleanValidation() };
}

function documentFromPayload(payload: any, previous = draftDocument()) {
  const line = payload.lines?.[0];
  return { ...previous, version: previous.version + 1, content: { ...previous.content, documentDate: payload.documentDate, responsibleName: payload.responsibleName, basis: payload.basis, lines: line ? [{ ...line, itemName: "Каска защитная", unitSymbol: "шт.", brandModelArticle: "UVEX Air", normUnitsPerItem: 1, totalMinor: line.quantity * line.unitPriceMinor }] : [] } };
}

function recordRequest(requests: Array<{ method: string; url: string; body?: Record<string, unknown> }>, route: Route) {
  requests.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
}

async function fulfill(route: Route, body: unknown) {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth);
  expect(overflow, `${label} should not horizontally overflow`).toBeLessThanOrEqual(1);
}
