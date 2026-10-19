import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("retired browser draft exports only its owner and creates no issue", async ({ page }) => {
  const mutations: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    localStorage.setItem("patrol360.sessionToken", "fixture-token");
    localStorage.setItem("patrol360.inventory.ppe.issue-workflow.v3.fixture-user.draft", "{old-draft-with-invalid-json");
    localStorage.setItem("patrol360.inventory.ppe.issue-workflow.v3.other-user.draft", "private-other-draft");
  });
  await page.route("**/api/**", route => {
    if (route.request().method() !== "GET") mutations.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: {
    id: "fixture-user", login: "pilot", displayName: "Тест", roles: ["admin"],
    permissions: ["inventory.view", "inventory.ppe.manage"],
  } }));
  await page.route("**/issue-documents/capabilities", route => route.fulfill({ json: { enabled: false } }));
  await page.route("**/api/v1/system-notifications**", route => route.fulfill({ json: [] }));
  await page.goto("/#inventory-ppe-create");
  await expect(page.getByRole("heading", { name: "Новые выдачи СИЗ выключены" })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать прежний черновик" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("ppe-legacy-drafts.json");
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported).toEqual({ userId: "fixture-user", drafts: {
    "patrol360.inventory.ppe.issue-workflow.v3.fixture-user.draft": "{old-draft-with-invalid-json",
  } });
  expect(await page.evaluate(() => localStorage.getItem("patrol360.inventory.ppe.issue-workflow.v3.fixture-user.draft"))).toBe("{old-draft-with-invalid-json");
  expect(mutations).toEqual([]);
});

test("historical personal card still previews and exports both DOCX forms", async ({ page }) => {
  const employee = { id: "employee", fullName: "Иванов Иван Иванович", personnelNo: "001245", position: "Электромонтер", department: "Электромонтажный участок", status: "active" };
  const norm = { id: "row", rowType: "item", normItemName: "Каска защитная", quantity: 1, quantityText: "1 шт.", unit: "шт.", issuePeriodText: "1 год", normPoint: "Типовые нормы", mappedItemId: "item", brandModelArticle: "РОСОМЗ / СОМЗ-55", coverageStatus: "issued", mappings: [] };
  const card = { id: "card", employeeId: employee.id, employeeName: employee.fullName, employeePersonnelNo: employee.personnelNo, employeeDepartment: employee.department, position: employee.position, status: "active", version: 1, createdAt: "2026-05-22T08:00:00Z", normRows: [norm], lines: [{ id: "line", cardNormRowId: norm.id, itemId: "item", itemName: norm.normItemName, quantity: 1, unit: "шт.", status: "issued", issuedAt: "2026-05-22T08:00:00Z", dueAt: "2027-05-22T08:00:00Z", modelDescription: norm.brandModelArticle, normPoint: norm.normPoint }] };
  const printRequests: URL[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    localStorage.setItem("patrol360.sessionToken", "fixture-token");
  });
  await page.route("**/api/**", route => route.abort());
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: "fixture-user", login: "pilot", displayName: "Тест", roles: ["admin"], permissions: ["inventory.view", "inventory.reports.export"] } }));
  await page.route("**/api/v1/system-notifications**", route => route.fulfill({ json: [] }));
  await page.route("**/issue-documents/capabilities", route => route.fulfill({ json: { enabled: false } }));
  await page.route("**/issue-documents/journal?*", route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 10, pageCount: 1, summary: { total: 0, confirmed: 0, draft: 0, cancelled: 0, overdue: 0 }, departments: [] } }));
  await page.route("**/api/v1/inventory/employees?*", route => route.fulfill({ json: { rows: [employee], total: 1, page: 1, pageSize: 40, pageCount: 1 } }));
  await page.route("**/api/v1/inventory/ppe/employees/employee/workspace", route => route.fulfill({ json: { employee, card, normRows: [norm], activeNormSet: null, normsTotal: 1, issued: 1, notIssued: 0, overdue: 0, partial: 0, errors: 0, recentHistory: [] } }));
  await page.route("**/api/v1/inventory/ppe/cards/card/print?*", route => {
    printRequests.push(new URL(route.request().url()));
    return route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "content-disposition": "attachment; filename=ppe.docx" }, body: "fixture-docx" });
  });
  await page.goto("/#inventory-ppe");
  await page.getByRole("button", { name: "Нормы и личные карточки" }).click();
  await expect(page.getByRole("heading", { name: employee.fullName })).toBeVisible();
  await page.getByRole("tab", { name: /Печать/ }).click();
  const forms = page.locator(".ppe-v2-print-grid > article");
  await forms.first().getByRole("button", { name: "Предпросмотр", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Предпросмотр печати" });
  await expect(preview.getByText("001245", { exact: true })).toBeVisible();
  await expect(preview.getByText(employee.department, { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Лист подписи" }).click();
  await expect(preview.getByText(norm.normItemName, { exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  for (const form of await forms.all()) {
    const download = page.waitForEvent("download");
    await form.getByRole("button", { name: "DOCX", exact: true }).click();
    await download;
  }
  expect(printRequests.map(url => url.searchParams.get("type"))).toEqual(["card", "sheet"]);
  expect(printRequests.every(url => url.searchParams.get("format") === "docx")).toBe(true);
});
