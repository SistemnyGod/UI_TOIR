import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installPpeKitFixture, openPpeKit } from "./fixtures/ppeKit.mjs";
const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
async function fit(page: Page, dialog: Locator) {
  const viewport = page.viewportSize()!, footer = dialog.locator(".modal-shell-actions");
  await expect.poll(async () => { const rect = (await footer.boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(viewport.height + 1);
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`PPE document actions, confirmation and 54-position print fit ${width}px`, async ({ page }) => {
    test.setTimeout(45_000); await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (["error", "warning"].includes(message.type()) && !/^Failed to load resource:.*409/.test(message.text())) errors.push(`${message.type()}: ${message.text()}`); });
    const fixture = await installPpeKitFixture(page, { positions: 54, delayCancel: true, failCancelOnce: true, delayConfirm: true, failConfirmOnce: true });
    await openPpeKit(page); await expect(page).toHaveTitle("Патруль 360");
    const actionTrigger = page.getByRole("button", { name: "Действия", exact: true }); await actionTrigger.click();
    const actions = page.getByRole("dialog", { name: "Действия с выдачей", exact: true });
    await actions.locator("summary").click(); await actions.getByLabel("Идентификатор карточки", { exact: true }).fill("00000000-0000-0000-0000-000000000999");
    await fit(page, actions); await page.screenshot({ path: path.join(evidence, `ppe-document-actions-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
    await actions.getByRole("button", { name: "Отменить черновик", exact: true }).click();
    const cancellation = page.getByRole("dialog", { name: "Отменить черновик выдачи?", exact: true });
    await fit(page, cancellation); await cancellation.getByRole("button", { name: "Отменить черновик", exact: true }).click();
    await expect(cancellation.getByRole("button", { name: "Закрыть", exact: true })).toBeDisabled(); await page.keyboard.press("Escape"); await expect(cancellation).toBeVisible();
    fixture.releaseCancel(); await expect(cancellation.getByRole("alert")).toContainText("Версия черновика изменена");
    expect(fixture.requests.filter((entry: { endpoint: string }) => entry.endpoint.endsWith("/cancel"))).toHaveLength(1);
    await fit(page, cancellation); await page.screenshot({ path: path.join(evidence, `ppe-document-cancel-error-${width}.png`), animations: "disabled" });
    await cancellation.getByRole("button", { name: "Вернуться", exact: true }).click();
    await expect(actions.getByLabel("Идентификатор карточки", { exact: true })).toHaveValue("00000000-0000-0000-0000-000000000999");
    await actions.getByRole("button", { name: "Закрыть просмотр", exact: true }).click(); await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click(); await expect(actionTrigger).toBeFocused();
    await page.getByRole("button", { name: "Предпросмотр документов", exact: true }).click(); await expect(page.getByRole("heading", { name: "Предпросмотр и печать", exact: true })).toBeVisible();
    const printTrigger = page.getByRole("button", { name: "Развернуть документ", exact: true }); await printTrigger.click();
    const print = page.getByRole("dialog", { name: "Просмотр печатной формы", exact: true });
    await expect(print.locator(".ppe-print-grid tbody tr")).toHaveCount(54); await fit(page, print);
    expect(await print.locator(".ppe-print-paper").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(evidence, `ppe-document-print-${width}.png`), animations: "disabled" });
    await print.getByRole("combobox", { name: "Форма", exact: true }).selectOption("signature"); await expect(print.locator(".ppe-print-grid tbody tr")).toHaveCount(54);
    expect(await print.locator(".ppe-print-paper").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await print.getByRole("combobox", { name: "Масштаб просмотра", exact: true }).selectOption("100");
    const canvas = print.locator(".ppe-document-print-canvas");
    expect(await canvas.locator(".ppe-print-paper").evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(1123, 0);
    if (width < 1000) expect(await canvas.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await print.locator(".ppe-print-grid tbody tr").last().scrollIntoViewIfNeeded(); await fit(page, print);
    await page.screenshot({ path: path.join(evidence, `ppe-document-print-signature-${width}.png`), animations: "disabled" });
    if (width === 390) { await page.setViewportSize({ width, height: 420 }); await fit(page, print); await page.screenshot({ path: path.join(evidence, "ppe-document-print-reduced-height.png"), animations: "disabled" }); await page.setViewportSize({ width, height: 900 }); }
    await print.getByRole("button", { name: "Закрыть просмотр", exact: true }).click(); await expect(printTrigger).toBeFocused();
    await page.getByRole("button", { name: "Подтвердить выдачу", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Подтвердить выдачу СИЗ?", exact: true }); await fit(page, confirmation);
    await page.screenshot({ path: path.join(evidence, `ppe-document-confirm-${width}.png`), animations: "disabled" });
    await confirmation.getByRole("button", { name: "Подтвердить выдачу", exact: true }).click(); await expect(confirmation.getByRole("button", { name: "Вернуться", exact: true })).toBeDisabled();
    fixture.releaseConfirm(); await expect(confirmation.getByRole("alert")).toContainText("Подтверждение не выполнено");
    await confirmation.getByRole("button", { name: "Подтвердить выдачу", exact: true }).click(); await expect(confirmation).toHaveCount(0);
    await expect(page.locator('.ppe-document-saved[data-status="confirmed"]')).toBeVisible();
    await expect(page.locator(".ppe-document-alert.is-error")).toHaveCount(0);
    const confirmations = fixture.requests.filter((entry: { endpoint: string }) => entry.endpoint.endsWith("/confirm")); expect(confirmations).toHaveLength(2); expect(confirmations[0].body).toEqual(confirmations[1].body);
    expect(errors).toEqual([]);
  });
}
