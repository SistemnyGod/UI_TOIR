import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installPpeOperationsFixture, openPpeOperations, openPpeOperation } from "./fixtures/ppeOperations.mjs";
const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
async function fit(page: Page, dialog: Locator) {
  const height = page.viewportSize()!.height, footer = dialog.locator(".modal-shell-actions");
  await expect.poll(async () => { const rect = (await footer.boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(height + 1);
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(0); expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`PPE operation editors preserve input and distinguish accepted writes from refresh failure at ${width}px`, async ({ page }) => {
  await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (["error", "warning"].includes(message.type()) && !/^Failed to load resource:.*(?:409|503)/.test(message.text())) errors.push(message.type() + ": " + message.text()); });
  const fixture = await installPpeOperationsFixture(page, { delayAction: true, failActionOnce: true, failRefreshOnce: true });
  await openPpeOperations(page); await expect(page).toHaveTitle("Патруль 360");
  for (const [name, key] of [["Оформить списание", "writeoff"], ["Отметить неисправным", "defective"]]) {
    await openPpeOperation(page, name); const editor = page.getByRole("dialog", { name, exact: true });
    await expect(editor.getByRole("button", { name, exact: true })).toBeDisabled();
    await editor.getByRole("textbox", { name: /Причина/ }).fill("Обнаружено повреждение защитного элемента. " + "Подробный комментарий для истории и проверки ответственным. ".repeat(12));
    if (key === "writeoff") await editor.getByRole("textbox", { name: "Номер акта", exact: true }).fill("АКТ-2026/104");
    await fit(page, editor); await page.screenshot({ path: path.join(evidence, `ppe-operation-${key}-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape"); const guard = page.getByRole("dialog", { name: "Несохранённые изменения", exact: true }); await expect(guard).toBeVisible(); await guard.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click();
  }
  await openPpeOperation(page, "Оформить возврат"); const editor = page.getByRole("dialog", { name: "Оформить возврат", exact: true });
  await editor.getByRole("textbox", { name: /Количество возврата/ }).fill("1,5"); await editor.getByRole("textbox", { name: /Причина/ }).fill("Комментарий частичного возврата сохраняется при ошибке.");
  await fit(page, editor); await page.screenshot({ path: path.join(evidence, `ppe-operation-return-${width}.png`), animations: "disabled" });
  if (width === 390) { await page.setViewportSize({ width, height: 420 }); await fit(page, editor); await page.screenshot({ path: path.join(evidence, "ppe-operation-reduced-height.png"), animations: "disabled" }); await page.setViewportSize({ width, height: 900 }); }
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click(); await expect(editor.getByRole("textbox", { name: /Количество/ })).toHaveValue("1,5");
  await editor.getByRole("button", { name: "Оформить возврат", exact: true }).click(); await expect(editor).toHaveAttribute("aria-busy", "true"); await expect(editor.getByRole("textbox", { name: /Причина/ })).toBeDisabled(); await page.keyboard.press("Escape"); await expect(editor).toBeVisible(); expect(fixture.mutations).toHaveLength(1);
  fixture.releaseAction(); await expect(editor.getByRole("alert")).toContainText("Операция отклонена"); await expect(editor.getByRole("textbox", { name: /Причина/ })).toHaveValue("Комментарий частичного возврата сохраняется при ошибке."); await page.screenshot({ path: path.join(evidence, `ppe-operation-error-${width}.png`), animations: "disabled" });
  await editor.getByRole("button", { name: "Оформить возврат", exact: true }).click(); await expect(editor).toHaveCount(0); await expect(page.getByRole("alert")).toContainText("Операция сохранена в истории СИЗ"); await expect(page.getByRole("heading", { name: "Что сотрудник получил", exact: true })).toBeVisible(); await expect(page.locator(".ppe-v2-row-menu").getByRole("button", { name: "Оформить возврат", exact: true })).toBeDisabled();
  await page.screenshot({ path: path.join(evidence, `ppe-operation-refresh-error-${width}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "Обновить карточку", exact: true }).click(); await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.locator(".ppe-v2-row-menu").getByRole("button", { name: "Оформить возврат", exact: true })).toBeEnabled(); expect(fixture.mutations).toHaveLength(2); expect(fixture.mutations[1]).toMatchObject({ quantity: 1.5, expectedVersion: 7, comment: "Комментарий частичного возврата сохраняется при ошибке." }); expect(errors).toEqual([]);
});
