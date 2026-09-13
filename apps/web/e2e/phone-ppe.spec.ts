import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.goto("/#inventory-ppe");
});

test("PPE warning does not overlap its action and issue draft survives rotation", async ({ page }) => {
  await expect(page.locator("tr.is-mapped").getByText("Связь с товаром ещё не задана", { exact: true })).toHaveCount(0);
  const warning = page.locator(".ppe-v2-norm-context > div");
  await expect(warning).toBeVisible();
  const action = page.getByRole("button", { name: "Найти и проверить норму", exact: true });
  const copyBox = (await warning.boundingBox())!;
  expect((await action.boundingBox())!.y).toBeGreaterThanOrEqual(copyBox.y + copyBox.height);
  await page.getByRole("button", { name: "Выдать", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Выдать СИЗ", exact: true });
  const size = dialog.getByRole("textbox", { name: "Размер", exact: true });
  await size.fill("48–50");
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(size).toHaveValue("48–50");
    await expect(dialog.getByRole("button", { name: "Подтвердить выдачу" })).toBeInViewport();
  }
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("PPE navigation stays compact and employee selection returns focus", async ({ page }) => {
  const nav = page.locator(".ppe-v2-module-nav");
  await expect(nav).toBeVisible();
  expect((await nav.boundingBox())!.height).toBeLessThan(90);
  const toggle = page.getByRole("button", { name: "Показать список сотрудников", exact: true });
  await toggle.click();
  const employees = page.locator(".ppe-v2-employee-list button");
  await expect(employees.first()).toBeVisible();
  await employees.first().click();
  await expect(toggle).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Поиск сотрудников" })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(employees.first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const tabs = page.getByRole("tablist", { name: "Рабочие разделы карточки СИЗ" });
  expect((await tabs.boundingBox())!.height).toBeLessThan(100);
  for (const button of await tabs.getByRole("tab").all()) {
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
