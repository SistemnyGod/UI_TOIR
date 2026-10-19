import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
const itemName = "Тестовый мультиметр для обслуживания оборудования производственного участка";
test.beforeEach(async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.route("**/api/v1/**", route => route.abort());
});
async function fit(page: Page, dialog: Locator) {
  await expect.poll(async () => { const box = (await dialog.locator(".modal-shell-actions").boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect((await dialog.locator(".modal-shell-actions").boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
}
async function discard(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click();
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`custody issue, nested operations and PPE event fit ${width}px`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#inventory-custody");
    await expect(page.getByText("Актов под запись пока нет", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Добавить предмет", exact: true }).click();
    const item = page.getByRole("dialog", { name: "Добавить предмет под запись", exact: true });
    await item.getByLabel("Название предмета", { exact: true }).fill(itemName);
    await item.getByLabel("Идентификатор / инвентарный номер", { exact: true }).fill("UI-TEST-001");
    await item.getByLabel("Цена", { exact: true }).fill("1 250,50");
    await fit(page, item);
    await page.screenshot({ path: path.join(evidence, `custody-item-${width}.png`), animations: "disabled" });
    await item.getByRole("button", { name: "Добавить предмет", exact: true }).click();
    await expect(item).toHaveCount(0);
    const issueTrigger = page.getByRole("button", { name: "Новая выдача", exact: true });
    await issueTrigger.click();
    const issue = page.getByRole("dialog", { name: "Новая выдача сотруднику", exact: true });
    if (width < 768) await issue.getByRole("button", { name: /^Сотрудник:/ }).click();
    await issue.getByRole("button", { name: "Выбрать сотрудника: Иванов Иван Иванович", exact: true }).click();
    if (width < 768) {
      await expect(issue.getByRole("button", { name: /^Сотрудник:/ })).toHaveAttribute("aria-expanded", "false");
      await issue.getByRole("button", { name: /^Предмет:/ }).click();
    }
    await issue.getByRole("textbox", { name: "Поиск предметов для выдачи" }).fill("UI-TEST-001");
    await issue.getByRole("button", { name: `Выбрать предмет: ${itemName}`, exact: true }).click();
    if (width < 768) await expect(issue.getByRole("button", { name: /^Предмет:/ })).toHaveAttribute("aria-expanded", "false");
    await issue.getByLabel("Комментарий", { exact: true }).fill("Выдать для проверки оборудования. ".repeat(30));
    await fit(page, issue);
    await page.screenshot({ path: path.join(evidence, `custody-issue-${width}.png`), animations: "disabled" });
    await issue.getByRole("button", { name: "Выдать под запись", exact: true }).click();
    await expect(issue).toHaveCount(0); await expect(issueTrigger).toBeFocused();
    await page.locator(".inventory-custody-command-actions").getByRole("button", { name: "Открыть акт", exact: true }).click();
    const document = page.getByRole("dialog", { name: /^Акт под запись:/ });
    await expect(document.getByText("История акта", { exact: true })).toBeVisible();
    await fit(page, document);
    await page.screenshot({ path: path.join(evidence, `custody-document-${width}.png`), animations: "disabled" });
    const transferTrigger = document.getByRole("button", { name: "Передать", exact: true });
    await transferTrigger.click();
    const transfer = page.getByRole("dialog", { name: "Передать другому сотруднику", exact: true });
    await transfer.getByLabel("Новый сотрудник", { exact: true }).selectOption("emp-2");
    await transfer.getByRole("textbox").fill("Передача для следующей смены. ".repeat(50));
    await fit(page, transfer);
    await page.screenshot({ path: path.join(evidence, `custody-transfer-${width}.png`), animations: "disabled" });
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await transfer.getByRole("textbox").fill("Комментарий при открытой клавиатуре");
      await fit(page, transfer); await expect(transfer.getByRole("textbox")).toBeInViewport();
      await page.screenshot({ path: path.join(evidence, "custody-transfer-reduced-height.png"), animations: "disabled" });
      await page.setViewportSize({ width, height: 900 });
    }
    await discard(page); await expect(transferTrigger).toBeFocused();
    await document.getByRole("button", { name: "Списать", exact: true }).click();
    const writeOff = page.getByRole("dialog", { name: "Списать предмет", exact: true });
    await writeOff.getByRole("textbox").fill("Повреждение корпуса, требуется замена. ".repeat(15));
    await fit(page, writeOff); await discard(page);
    await document.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();

    // Enrich only browser mock data to exercise long saved names/comments.
    await page.evaluate(() => { const data = JSON.parse(localStorage.getItem("patrol360.inventory.mock.v1")!); data.ppeCards[0].lines[0].normPoint = "Развёрнутый комментарий к сохранённой операции. ".repeat(150); localStorage.setItem("patrol360.inventory.mock.v1", JSON.stringify(data)); });
    await page.goto("/#inventory-ppe-history");
    const eventTrigger = page.getByRole("button", { name: /^Открыть детали операции:/ }).first();
    await eventTrigger.click();
    const event = page.getByRole("dialog", { name: "Детали события", exact: true });
    await fit(page, event);
    await page.screenshot({ path: path.join(evidence, `ppe-history-event-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape"); await expect(eventTrigger).toBeFocused();
    expect(errors).toEqual([]); await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  });
}
