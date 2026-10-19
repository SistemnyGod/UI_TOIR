import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
test.beforeEach(async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.route("**/api/v1/**", route => route.abort());
});
async function fit(page: Page, dialog: Locator) {
  const footer = dialog.locator(".modal-shell-actions");
  await expect.poll(async () => { const box = (await footer.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`inventory employee editors, import and history fit ${width}px`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#inventory-employees");
    await expect(page.getByRole("heading", { name: "Сотрудники учета", exact: true })).toBeVisible();
    await expect(page.locator(".inventory-employees-table tbody tr").first()).toBeVisible();
    if (width < 768) expect(await page.locator(".inventory-employees-table-wrap").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const create = page.getByRole("button", { name: "Создать сотрудника", exact: true });
    await create.click();
    const editor = page.getByRole("dialog", { name: "Создание сотрудника", exact: true });
    await editor.getByLabel("ФИО", { exact: true }).fill("Тестовый сотрудник с длинным именем для проверки интерфейса");
    await editor.getByLabel("Подразделение", { exact: true }).fill("Энерго-механический участок и обслуживание оборудования");
    await fit(page, editor);
    await page.screenshot({ path: path.join(evidence, `inventory-employee-editor-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
    await expect(editor.getByLabel("ФИО", { exact: true })).toHaveValue("Тестовый сотрудник с длинным именем для проверки интерфейса");
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await editor.getByLabel("Дата рождения", { exact: true }).fill("1990-03-15");
      await fit(page, editor);
      await expect(editor.getByLabel("Дата рождения", { exact: true })).toBeInViewport();
      await page.screenshot({ path: path.join(evidence, "inventory-employee-reduced-height.png"), animations: "disabled" });
      await page.setViewportSize({ width, height: 900 });
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click();
    await expect(create).toBeFocused();

    await page.locator('input[type="file"]').setInputFiles({ name: "employees-120.csv", mimeType: "text/csv", buffer: Buffer.from(["ФИО;Табель;Должность;Подразделение;Группа", ...Array.from({ length: 120 }, (_, index) => `Сотрудник тестового импорта ${index + 1};TEST-${index};Слесарь;Энерго-механический участок;Атом`)].join("\n")) });
    const preview = page.getByRole("dialog", { name: "Предпросмотр импорта сотрудников", exact: true });
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Вперед", exact: true }).click();
    await preview.getByRole("button", { name: "Вперед", exact: true }).click();
    await expect(preview.getByText("Сотрудник тестового импорта 120", { exact: true })).toBeVisible();
    await fit(page, preview);
    expect(await preview.locator(".inventory-employee-import-table-wrap").evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    if (width < 768) expect(await preview.locator(".inventory-employee-import-table-wrap").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(evidence, `inventory-employee-import-${width}.png`), animations: "disabled" });
    await preview.getByRole("button", { name: "Отмена", exact: true }).click();

    const history = page.locator(".inventory-employees-row-actions").first().getByRole("button", { name: "История", exact: true });
    await history.click();
    const historyDialog = page.getByRole("dialog", { name: "История СИЗ сотрудника", exact: true });
    await fit(page, historyDialog);
    await page.screenshot({ path: path.join(evidence, `inventory-employee-history-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape"); await expect(history).toBeFocused();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
