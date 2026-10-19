import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installPpeKitFixture, openPpeKit, ppeKitItemName } from "./fixtures/ppeKit.mjs";

const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
async function fit(page: Page, dialog: Locator) {
  const viewport = page.viewportSize()!;
  await expect.poll(async () => { const rect = (await dialog.locator(".modal-shell-actions").boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(viewport.height + 1);
  const rect = (await dialog.boundingBox())!;
  expect((await dialog.locator(".modal-shell-actions").boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(rect.x).toBeGreaterThanOrEqual(-1); expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`PPE kit, nested templates and line control fit ${width}px`, async ({ page }) => {
    test.setTimeout(45_000);
    await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (["warning", "error"].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`); });
    const fixture = await installPpeKitFixture(page, { delayApply: true });
    await openPpeKit(page);
    await expect(page).toHaveTitle("Патруль 360");
    await page.getByRole("button", { name: "Добавить СИЗ", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Выберите СИЗ", exact: true });
    await fit(page, picker);
    await page.screenshot({ path: path.join(evidence, `ppe-kit-catalog-${width}.png`), animations: "disabled" });
    await picker.getByRole("button", { name: `Выбрать СИЗ: ${ppeKitItemName}`, exact: true }).click();
    await picker.getByRole("button", { name: "Вперёд", exact: true }).click();
    await picker.getByRole("button", { name: "Выбрать СИЗ: СИЗ 29 — защита при обслуживании оборудования", exact: true }).click();
    await picker.getByRole("button", { name: "Из шаблона", exact: true }).click();
    const templates = page.getByRole("dialog", { name: "Готовые комплекты", exact: true });
    await templates.locator("summary").filter({ hasText: "Защита при обслуживании оборудования" }).click();
    await templates.getByLabel("Название шаблона", { exact: true }).fill("Комплект для производственного участка");
    expect(fixture.requests.filter((entry: { method: string }) => entry.method === "PATCH")).toHaveLength(0);
    await fit(page, templates);
    await page.screenshot({ path: path.join(evidence, `ppe-kit-templates-${width}.png`), animations: "disabled" });
    await templates.getByRole("button", { name: "Сохранить имя", exact: true }).click();
    await expect(templates.locator("summary").filter({ hasText: "Комплект для производственного участка" })).toBeVisible();
    await templates.getByRole("button", { name: "Применить шаблон", exact: true }).click();
    await expect(templates.getByRole("button", { name: "Закрыть", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(templates).toBeVisible();
    fixture.releaseApply(); await expect(templates).toHaveCount(0);
    if (width <= 900) await expect(picker.getByRole("button", { name: "Выбрано (2)", exact: true })).toHaveAttribute("aria-pressed", "true");
    const selected = picker.locator(".ppe-kit-picker-selected article").first();
    const price = selected.getByLabel("Цена, руб.", { exact: true });
    await price.fill("1250,,50"); await selected.getByLabel("Количество", { exact: true }).focus();
    await expect(price).toHaveValue("1250,,50"); await expect(price).toHaveAttribute("aria-invalid", "true");
    await picker.getByRole("button", { name: "Добавить выбранное", exact: true }).click();
    await expect(picker.getByRole("alert").filter({ hasText: "корректную цену" })).toBeVisible();
    await price.fill("1250,50"); await selected.getByLabel("Размер", { exact: true }).fill("58");
    await fit(page, picker);
    await page.screenshot({ path: path.join(evidence, `ppe-kit-selected-${width}.png`), animations: "disabled" });
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 }); await price.focus(); await fit(page, picker);
      await page.screenshot({ path: path.join(evidence, "ppe-kit-reduced-height.png"), animations: "disabled" }); await page.setViewportSize({ width, height: 900 });
    }
    await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
    await expect(price).toHaveValue("1250.50");
    await picker.getByRole("button", { name: "Добавить выбранное", exact: true }).click(); await expect(picker).toHaveCount(0);
    await expect(page.locator(".ppe-document-lines article")).toHaveCount(3);
    await page.getByRole("button", { name: `Контроль: ${ppeKitItemName}`, exact: true }).first().click();
    const control = page.getByRole("dialog", { name: "Исключение и ручной контроль", exact: true });
    await control.getByLabel("Ручной контроль", { exact: true }).check();
    await control.getByLabel("Причина исключения", { exact: true }).fill("Проверка комплекта комиссией и уточнение срока носки. ".repeat(10));
    await fit(page, control); await page.screenshot({ path: path.join(evidence, `ppe-kit-control-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
    await control.getByRole("button", { name: "Применить к строке", exact: true }).click(); await expect(control).toHaveCount(0);
    await expect.poll(() => fixture.requests.filter((entry: { method: string }) => entry.method === "PUT").length).toBeGreaterThan(0);
    for (const entry of fixture.requests.filter((entry: { method: string }) => entry.method === "PUT")) expect(JSON.stringify(entry.body)).not.toContain("priceInput");
    expect(errors).toEqual([]);
  });
}
