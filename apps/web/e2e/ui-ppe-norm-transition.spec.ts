import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installPpeKitFixture, ppeKitIds, ppeKitAlternateNormId } from "./fixtures/ppeKit.mjs";
const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
async function fit(page: Page, dialog: Locator) {
  const viewport = page.viewportSize()!, footer = dialog.locator(".modal-shell-actions");
  await expect.poll(async () => { const bounds = (await footer.boundingBox())!; return bounds.y + bounds.height; }).toBeLessThanOrEqual(viewport.height + 1);
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`PPE norm transition keeps input and verifies 49 removed positions at ${width}px`, async ({ page }) => {
    test.setTimeout(40_000); await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (["error", "warning"].includes(message.type()) && !/^Failed to load resource:.*503/.test(message.text())) errors.push(`${message.type()}: ${message.text()}`); });
    const fixture = await installPpeKitFixture(page, { positions: 54, includeAlternateNorm: true, delayAlternateNorm: true, failAlternateOnce: true });
    await page.goto("/#inventory-ppe-create"); await expect(page).toHaveTitle("Патруль 360"); await page.getByRole("button", { name: "Уточнить характеристики", exact: true }).click();
    const select = page.getByRole("combobox", { name: "Нормативный набор", exact: true }); await expect(select).toBeEnabled();
    await select.selectOption(ppeKitAlternateNormId); await expect(page.getByText(/Загружаем состав выбранной нормы/)).toBeVisible();
    await page.getByRole("textbox", { name: "Основание", exact: true }).fill("Комментарий, введённый во время загрузки новой нормы");
    await page.waitForTimeout(550); expect(fixture.requests.filter((entry: { method: string }) => entry.method === "PUT")).toHaveLength(0);
    fixture.releaseAlternateNorm(); await expect(page.getByRole("alert").filter({ hasText: "Состав нормы временно недоступен. Выбор сохранён." })).toBeVisible(); await expect(select).toHaveValue(ppeKitIds.norm);
    await page.screenshot({ path: path.join(evidence, `ppe-norm-load-error-${width}.png`), animations: "disabled" });
    await page.getByRole("button", { name: "Повторить состав нормы", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Изменить нормативный набор?", exact: true }); await expect(dialog.locator(".ppe-norm-change-lines li")).toHaveCount(49); await fit(page, dialog);
    await page.screenshot({ path: path.join(evidence, `ppe-norm-change-${width}.png`), animations: "disabled" });
    if (width === 390) { await page.setViewportSize({ width, height: 420 }); await fit(page, dialog); await page.screenshot({ path: path.join(evidence, "ppe-norm-change-reduced-height.png"), animations: "disabled" }); await page.setViewportSize({ width, height: 900 }); }
    await page.keyboard.press("Escape"); await expect(select).toHaveValue(ppeKitIds.norm); await expect(page.getByRole("textbox", { name: "Основание", exact: true })).toHaveValue("Комментарий, введённый во время загрузки новой нормы");
    expect(fixture.requests.some((entry: { method: string; body?: { normSetId?: string } }) => entry.method === "PUT" && entry.body?.normSetId === ppeKitAlternateNormId)).toBe(false);
    await select.selectOption(ppeKitAlternateNormId); await expect(dialog).toBeVisible(); await dialog.getByRole("button", { name: "Применить норму", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => fixture.requests.filter((entry: { method: string; body?: { normSetId?: string } }) => entry.method === "PUT" && entry.body?.normSetId === ppeKitAlternateNormId).length).toBe(1);
    const saved = fixture.requests.find((entry: { method: string; body?: { normSetId?: string } }) => entry.method === "PUT" && entry.body?.normSetId === ppeKitAlternateNormId)!.body;
    expect(saved.lines).toHaveLength(5); expect(saved.acceptNormChange).toBe(true); expect(saved.basis).toBe("Комментарий, введённый во время загрузки новой нормы"); expect(saved.lines[0]).toEqual(expect.objectContaining({ id: "line-0", quantity: 1, sizeText: "58", unitPriceMinor: 125050 }));
    await page.getByRole("button", { name: "Далее", exact: true }).click(); await page.getByRole("button", { name: "Далее", exact: true }).click(); await expect(page.locator(".ppe-document-lines article")).toHaveCount(5);
    expect(errors).toEqual([]);
  });
}

