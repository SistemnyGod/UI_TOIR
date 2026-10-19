import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installPpeNavigationFixture, openNavigationKit, makeUnsavedPpeInput } from "./fixtures/ppeNavigation.mjs";
const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
const decision = (page: Page) => page.getByRole("dialog", { name: "Несохранённые изменения", exact: true });
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; pageErrors.set(page, errors); page.on("pageerror", error => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
async function sidebarItems(page: Page) {
  const open = page.getByRole("button", { name: "Открыть навигацию", exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole("button", { name: "Номенклатура", exact: true }).click();
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`page leave dialog preserves PPE input at ${width}px`, async ({ page }) => {
  await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 }); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await installPpeNavigationFixture(page); await openNavigationKit(page); const price = await makeUnsavedPpeInput(page); const length = await page.evaluate(() => history.length); await sidebarItems(page);
  await expect(decision(page)).toBeVisible(); await expect(page).toHaveURL(/#inventory-ppe-create$/); await expect(price).toHaveValue("12,,50"); expect(await page.evaluate(() => history.length)).toBe(length);
  const footer = decision(page).locator(".modal-shell-actions"); const rect = (await footer.boundingBox())!; expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(901);
  expect(await decision(page).evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); await page.screenshot({ path: path.join(evidence, `page-navigation-guard-${width}.png`), animations: "disabled" });
  if (width === 390) { await page.setViewportSize({ width, height: 420 }); await expect(decision(page)).toBeVisible(); await expect.poll(async () => { const small = (await footer.boundingBox())!; return small.y + small.height; }).toBeLessThanOrEqual(421); await page.screenshot({ path: path.join(evidence, "page-navigation-guard-reduced-height.png"), animations: "disabled" }); await page.setViewportSize({ width, height: 900 }); }
  await page.keyboard.press("Escape"); await expect(decision(page)).toBeHidden(); await expect(price).toHaveValue("12,,50"); await sidebarItems(page); await expect(decision(page)).toBeVisible(); await decision(page).getByRole("button", { name: "Закрыть без сохранения", exact: true }).click(); await expect(page).toHaveURL(/#inventory-items$/); await expect(decision(page)).toHaveCount(0); expect(errors).toEqual([]);
});
test("Back cancellation preserves history and approval retains Forward", async ({ page }) => {
  await installPpeNavigationFixture(page); await openNavigationKit(page); const price = await makeUnsavedPpeInput(page), length = await page.evaluate(() => history.length);
  await page.goBack(); await expect(decision(page)).toBeVisible(); await expect(page).toHaveURL(/#inventory-ppe-create$/); await decision(page).getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(price).toHaveValue("12,,50"); expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack(); await expect(decision(page)).toBeVisible(); await decision(page).getByRole("button", { name: "Закрыть без сохранения", exact: true }).click(); await expect(page).toHaveURL(/#inventory-ppe$/); await page.goForward(); await expect(page).toHaveURL(/#inventory-ppe-create$/); await expect(page.getByRole("heading", { name: "Проверка данных", exact: true })).toBeVisible(); expect(await page.evaluate(() => history.length)).toBe(length);
});
test("Forward cancellation and a burst of Back retain the selected editor", async ({ page }) => {
  await installPpeNavigationFixture(page); await openNavigationKit(page); await sidebarItems(page); await expect(page).toHaveURL(/#inventory-items$/); await page.getByRole("button", { name: "СИЗ", exact: true }).click(); await page.evaluate(() => { location.hash = "inventory-ppe-create"; }); await expect(page.getByRole("heading", { name: "Проверка данных", exact: true })).toBeVisible(); await sidebarItems(page); await expect(page).toHaveURL(/#inventory-items$/); await page.goBack(); await expect(page.getByRole("heading", { name: "Проверка данных", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Далее", exact: true }).click(); const price = await makeUnsavedPpeInput(page);
  await page.goForward(); await expect(decision(page)).toBeVisible(); await decision(page).getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(page).toHaveURL(/#inventory-ppe-create$/); await expect(price).toHaveValue("12,,50");
  await page.evaluate(() => { history.back(); history.back(); }); await expect(decision(page)).toBeVisible(); await expect(page).toHaveURL(/#inventory-ppe-create$/); expect(await decision(page).count()).toBe(1); await decision(page).getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(price).toHaveValue("12,,50");
});
test("direct hash changes and ordinary links share the same decision", async ({ page }) => {
  await installPpeNavigationFixture(page); await openNavigationKit(page); const price = await makeUnsavedPpeInput(page);
  await page.evaluate(() => { location.hash = "inventory-items"; }); await expect(decision(page)).toBeVisible(); await expect(page).toHaveURL(/#inventory-ppe-create$/); await decision(page).getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(price).toHaveValue("12,,50");
  await page.locator(".ppe-document-head").evaluate(el => { const link = document.createElement("a"); link.href = "#inventory-items"; link.textContent = "Тестовая ссылка в номенклатуру"; el.append(link); }); await page.getByRole("link", { name: "Тестовая ссылка в номенклатуру", exact: true }).click(); await expect(decision(page)).toBeVisible(); await expect(page).toHaveURL(/#inventory-ppe-create$/); await decision(page).getByRole("button", { name: "Закрыть без сохранения", exact: true }).click(); await expect(page).toHaveURL(/#inventory-items$/);
});
test("pending saves block leaving until the accepted write is applied", async ({ page }) => {
  const fixture = await installPpeNavigationFixture(page, { delaySave: true }); await openNavigationKit(page); const price = page.getByLabel("Цена, руб.", { exact: true }).first(); await price.fill("2222"); await expect.poll(() => fixture.saves.length).toBe(1);
  await sidebarItems(page); await expect(page).toHaveURL(/#inventory-ppe-create$/); await expect(decision(page)).toHaveCount(0); await page.goBack(); await expect(page).toHaveURL(/#inventory-ppe-create$/); await expect(price).toHaveValue("2222.00"); expect(fixture.saves[0].lines[0].unitPriceMinor).toBe(222200); fixture.releaseSave(); await expect(page.locator(".ppe-document-save-state")).toHaveText(""); await sidebarItems(page); await expect(page).toHaveURL(/#inventory-items$/); await expect(decision(page)).toHaveCount(0);
});
test("refresh uses native beforeunload and cancelling retains typed input", async ({ page }) => {
  await installPpeNavigationFixture(page); await openNavigationKit(page); const price = await makeUnsavedPpeInput(page); const dialogEvent = page.waitForEvent("dialog", { timeout: 5000 }); const refresh = page.evaluate(() => location.reload()).catch(() => null); const dialog = await dialogEvent; expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss(); await refresh; await expect(price).toHaveValue("12,,50"); await expect(page).toHaveURL(/#inventory-ppe-create$/);
});
test("explicit logout asks once and cancelling sends no logout request", async ({ page }) => {
  const fixture = await installPpeNavigationFixture(page); await openNavigationKit(page); const price = await makeUnsavedPpeInput(page); await page.getByRole("button", { name: "Профиль пользователя", exact: true }).click(); await page.getByRole("dialog", { name: "Профиль пользователя", exact: true }).getByRole("button", { name: "Выйти из аккаунта", exact: true }).click(); await expect(decision(page)).toBeVisible(); await decision(page).getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(price).toHaveValue("12,,50"); expect(fixture.requests.filter((request: { endpoint: string }) => /\/auth\/logout$/.test(request.endpoint))).toEqual([]);
  await page.getByRole("button", { name: "Выйти из аккаунта", exact: true }).click(); await decision(page).getByRole("button", { name: "Закрыть без сохранения", exact: true }).click(); await expect.poll(() => fixture.requests.filter((request: { endpoint: string }) => /\/auth\/logout$/.test(request.endpoint)).length).toBe(1); await expect(decision(page)).toHaveCount(0);
});
test("cancelling Back retains the scroll position and all 54 rows of the editor", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 }); await installPpeNavigationFixture(page, { positions: 54 }); await openNavigationKit(page); await page.getByRole("button", { name: "Заполнить по норме", exact: true }).click();
  const prices = page.getByLabel("Цена, руб.", { exact: true }); await expect(prices).toHaveCount(54); await prices.last().fill("12,,50"); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200); const before = await page.evaluate(() => scrollY);
  await page.goBack(); await expect(decision(page)).toBeVisible(); await decision(page).getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(prices.last()).toHaveValue("12,,50"); await expect(prices.last()).toBeFocused(); await expect(prices).toHaveCount(54); await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
});
