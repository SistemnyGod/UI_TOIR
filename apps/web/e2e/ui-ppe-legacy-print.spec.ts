import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installPpeLegacyFixture, openPpeLegacyPrint } from "./fixtures/ppeLegacyWorkspace.mjs";
const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
async function fit(page: Page, dialog: Locator) {
  const height = page.viewportSize()!.height, footer = dialog.locator(".modal-shell-actions");
  await expect.poll(async () => { const rect = (await footer.boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(height + 1);
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`legacy PPE print and local fields fit at ${width}px`, async ({ page }) => {
  await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  await installPpeLegacyFixture(page); await openPpeLegacyPrint(page); await expect(page).toHaveTitle("Патруль 360");
  const preview = page.getByRole("dialog", { name: "Предпросмотр печати", exact: true }), canvas = preview.getByRole("region", { name: "Печатный лист", exact: true });
  for (const [mode, name] of [["card", "Личная карточка"], ["sheet", "Лист подписи"]]) {
    await preview.getByRole("button", { name, exact: true }).click(); await fit(page, preview);
    await expect.poll(() => canvas.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await expect(canvas.locator("tbody tr")).toHaveCount(54);
    const paper = canvas.locator(".inventory-ppe-print-paper");
    expect(await paper.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    expect(await canvas.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    const lastRow = canvas.locator("tbody tr").last(); await lastRow.scrollIntoViewIfNeeded(); await expect(lastRow).toBeInViewport();
    await preview.locator(".modal-shell-body").evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(evidence, `ppe-legacy-print-${mode}-${width}.png`), animations: "disabled" });
  }
  await preview.getByRole("button", { name: "Личная карточка", exact: true }).click(); await preview.getByRole("button", { name: "Правки для печати", exact: true }).click();
  const fields = page.getByRole("dialog", { name: "Правки для печати", exact: true }); await fields.getByRole("textbox", { name: "Наименование СИЗ · строка 1", exact: true }).fill("Уточнённое наименование защитного средства для печати");
  await fit(page, fields); await page.screenshot({ path: path.join(evidence, `ppe-legacy-print-fields-${width}.png`), animations: "disabled" });
  if (width === 390) { await page.setViewportSize({ width, height: 420 }); await fit(page, fields); await page.screenshot({ path: path.join(evidence, "ppe-legacy-print-fields-reduced-height.png"), animations: "disabled" }); await page.setViewportSize({ width, height: 900 }); }
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(fields.getByRole("textbox", { name: "Наименование СИЗ · строка 1", exact: true })).toHaveValue("Уточнённое наименование защитного средства для печати");
  await fields.getByRole("button", { name: "Далее", exact: true }).click(); await fields.getByRole("button", { name: "Назад", exact: true }).click(); await expect(fields.getByRole("textbox", { name: "Наименование СИЗ · строка 1", exact: true })).toHaveValue("Уточнённое наименование защитного средства для печати");
  await fields.getByRole("button", { name: "Применить к предпросмотру", exact: true }).click(); await expect(canvas.getByText("Уточнённое наименование защитного средства для печати", { exact: true })).toBeAttached();
  await preview.getByRole("button", { name: "Лист подписи", exact: true }).click(); await preview.getByRole("button", { name: "Личная карточка", exact: true }).click(); await expect(canvas.getByText("Уточнённое наименование защитного средства для печати", { exact: true })).toBeAttached();
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click(); await expect(preview).toBeHidden();
  expect(errors).toEqual([]);
});
test("legacy PPE employee search reaches the third page and restores a selection outside the search", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); const fixture = await installPpeLegacyFixture(page);
  await page.goto("/#inventory-ppe"); await page.getByRole("button", { name: "Нормы и личные карточки", exact: true }).click();
  await page.getByRole("button", { name: "Показать список сотрудников", exact: true }).click(); const pane = page.locator(".ppe-v2-employee-pane");
  await expect(pane.getByText("В поиске: 50 из 121", { exact: true })).toBeVisible(); await pane.getByRole("button", { name: "Показать ещё сотрудников", exact: true }).click(); await expect(pane.getByText("В поиске: 100 из 121", { exact: true })).toBeVisible(); await pane.getByRole("button", { name: "Показать ещё сотрудников", exact: true }).click();
  await expect(pane.getByText("В поиске: 121 из 121", { exact: true })).toBeVisible(); await pane.getByRole("button", { name: /Сотрудник 121/ }).click(); await expect(page.getByRole("heading", { name: fixture.employees[120].fullName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Показать список сотрудников", exact: true }).click(); await pane.getByRole("textbox", { name: "Поиск сотрудников", exact: true }).fill("UI-001"); await expect(pane.getByText("В поиске: 1 из 1", { exact: true })).toBeVisible(); await expect(pane.getByRole("button", { name: /Сотрудник 121/ })).toBeVisible(); await expect(page.getByRole("heading", { name: fixture.employees[120].fullName, exact: true })).toBeVisible();
});
test("legacy PPE print explains a blocked popup and keeps the preview usable", async ({ page }) => {
  await page.addInitScript(() => { window.open = () => null; }); await installPpeLegacyFixture(page); await openPpeLegacyPrint(page);
  const preview = page.getByRole("dialog", { name: "Предпросмотр печати", exact: true }); await preview.getByRole("button", { name: "Печать", exact: true }).click(); await expect(preview.getByRole("alert")).toContainText("Браузер заблокировал окно печати"); await expect(preview.getByRole("button", { name: "Правки для печати", exact: true })).toBeEnabled();
});
