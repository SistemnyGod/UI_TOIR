import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
});

test("phone menu blocks background, traps focus and closes without a blank header", async ({ page }) => {
  await page.goto("/#dashboard");
  const trigger = page.getByRole("button", { name: "Открыть навигацию", exact: true });
  await expect(trigger).toBeVisible();
  expect((await trigger.boundingBox())!.y).toBeLessThan(30);
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Навигация по приложению" });
  await expect(menu).toBeVisible();
  expect((await menu.boundingBox())!.height).toBeGreaterThan(800);
  await expect(page.locator("main.workspace")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Закрыть меню", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await menu.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("button", { name: "Результаты обходов", exact: true }).click();
  await expect(page).toHaveURL(/#results$/);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("results retain search across resize and expose phone actions", async ({ page }) => {
  await page.goto("/#results");
  const search = page.getByRole("textbox", { name: "Поиск по результатам обходов" });
  await search.fill("Иванов");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(search).toHaveValue("Иванов");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(search).toHaveValue("Иванов");
  await expect(page.getByRole("button", { name: /Сводка ·/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Подробнее", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Открыть поиск", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Поиск по обходам" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox", { name: "Что найти" }).fill("маршрут");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Открыть поиск", exact: true })).toBeFocused();
});

test("catalog actions fit the card and an unsaved form survives rotation", async ({ page }) => {
  await page.goto("/#inventory-items");
  const row = page.locator(".inventory-items-table tbody tr").first();
  await expect(row.getByRole("button", { name: "Редактировать", exact: true })).toBeVisible();
  for (const button of await row.getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Создать позицию", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Создать позицию номенклатуры" });
  const input = dialog.getByRole("textbox", { name: "Название *", exact: true });
  await input.fill("Проверка поворота телефона");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(input).toHaveValue("Проверка поворота телефона");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(input).toHaveValue("Проверка поворота телефона");
  await expect(dialog.getByRole("button", { name: "Сохранить позицию" })).toBeInViewport();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

for (const screen of ["dashboard", "results", "inventory-items", "inventory-ppe", "users", "assign", "routes", "accounts", "emu-work-accounting"]) {
  test(`${screen} fits the phone page`, async ({ page }) => {
    await page.goto(`/#${screen}`);
    await expect(page.getByRole("button", { name: "Открыть навигацию", exact: true })).toBeVisible();
    await expect(page.locator("main.workspace h1").first()).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Loading section" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}
