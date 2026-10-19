import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
test.beforeEach(async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.route("**/api/v1/**", route => route.abort());
});

async function actionsFit(page: Page, footer: Locator) {
  await expect.poll(async () => (await footer.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => { const box = (await footer.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
async function discard(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click();
}

for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`account, employee and plan forms keep drafts and visible actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#accounts");
    await expect(page.locator(".workspace > .topbar")).toHaveCount(1);
    await page.locator(".aui-page-head").getByRole("button", { name: "Создать аккаунт", exact: true }).click();
    const account = page.getByRole("dialog", { name: "Создание мобильного аккаунта", exact: true });
    await account.getByRole("textbox", { name: "Логин", exact: true }).fill("long.account.draft");
    await account.getByRole("radio", { name: "Задать вручную", exact: true }).check();
    await account.getByLabel("Пароль", { exact: true }).fill("UI-test-password");
    await actionsFit(page, account.locator(".account-create-actions"));
    await page.screenshot({ path: path.join(evidence, `account-create-${width}.png`), animations: "disabled" });
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await account.getByLabel("Подтвердите пароль", { exact: true }).fill("UI-test-password");
      await actionsFit(page, account.locator(".account-create-actions"));
      await expect(account.getByLabel("Подтвердите пароль", { exact: true })).toBeInViewport();
      await page.screenshot({ path: path.join(evidence, "account-create-reduced-height.png"), animations: "disabled" });
    }
    await discard(page);
    await expect(account).toHaveCount(0);
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/#employees");
    await expect(page.locator(".workspace > .topbar")).toHaveCount(1);
    await page.getByRole("button", { name: "Создать сотрудника", exact: true }).first().click();
    const employee = page.getByRole("dialog", { name: "Создать сотрудника", exact: true });
    await employee.getByLabel("ФИО", { exact: true }).fill("Тестовый сотрудник с длинным именем для проверки формы");
    await employee.getByRole("combobox", { name: "Смена", exact: true }).selectOption("Ночь");
    await actionsFit(page, employee.locator(".modal-shell-actions"));
    await page.screenshot({ path: path.join(evidence, `employee-create-${width}.png`), animations: "disabled" });
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await employee.getByLabel("Участок", { exact: true }).fill("Участок при уменьшенной высоте окна");
      await expect(employee.getByLabel("Участок", { exact: true })).toBeInViewport();
      await actionsFit(page, employee.locator(".modal-shell-actions"));
      await page.screenshot({ path: path.join(evidence, "employee-create-reduced-height.png"), animations: "disabled" });
    }
    await discard(page);
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/#schedule");
    await page.getByRole("button", { name: "Создать обход", exact: true }).click();
    const plan = page.getByRole("dialog", { name: "Создание планового обхода", exact: true });
    await plan.getByLabel("Комментарий к обходу", { exact: true }).fill("Длинное пояснение к плану. ".repeat(12));
    await actionsFit(page, plan.locator(".modal-shell-actions"));
    await page.screenshot({ path: path.join(evidence, `plan-create-${width}.png`), animations: "disabled" });
    await discard(page);
    await expect(plan).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1366]) {
  test(`request modal keeps its draft and action bar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#results");
    await expect(page.locator(".workspace > .topbar")).toHaveCount(1);
    await page.getByRole("button", { name: "Открыть", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Создать заявку", exact: true }).click();
    const request = page.getByRole("dialog", { name: "Заявка на проведение обхода", exact: true });
    await request.getByRole("textbox", { name: "Комментарий к заявке", exact: true }).fill("Повторная проверка оборудования. ".repeat(30));
    await actionsFit(page, request.locator(".modal-shell-actions"));
    await page.screenshot({ path: path.join(evidence, `request-create-${width}.png`), animations: "disabled" });
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await request.getByLabel("Время старта", { exact: false }).fill("12:00");
      await expect(request.getByLabel("Время старта", { exact: false })).toBeInViewport();
      await actionsFit(page, request.locator(".modal-shell-actions"));
      await page.screenshot({ path: path.join(evidence, "request-create-reduced-height.png"), animations: "disabled" });
    }
    await discard(page);
    await expect(request).toHaveCount(0);
  });
}
