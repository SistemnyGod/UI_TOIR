import { expect, test } from "@playwright/test";

test("dashboard shell loads", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
  });

  await page.goto("/");

  await expect(page).toHaveTitle(/Патруль 360/);
  await expect(page.getByRole("heading", { name: "Дашборд", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Самые проблемные точки" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Последние результаты" })).toBeVisible();
  await page.getByRole("button", { name: "Месяц", exact: true }).click();
  await expect(page.getByRole("button", { name: "Месяц", exact: true })).toHaveAttribute("aria-pressed", "true");
});

for (const width of [1440, 390]) {
  test(`dashboard result actions fit ${width}px and open the shared report`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-06-29T20:00:00+05:00"));
    await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#dashboard");
    await expect(page.getByRole("heading", { name: "Дашборд", exact: true })).toBeVisible();
    const points = page.getByRole("table", { name: "Проблемные точки за выбранный период" });
    const recent = page.getByRole("table", { name: "Последние результаты обходов" });
    for (const table of [points, recent]) {
      await expect(table).toBeVisible();
      expect(await table.evaluate(element => element.parentElement!.scrollWidth - element.parentElement!.clientWidth)).toBeLessThanOrEqual(1);
      const action = table.getByRole("button").first();
      const box = (await action.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    await points.getByRole("button", { name: "Результаты точки Склад ГСМ" }).click();
    await expect(page).toHaveURL(/#results$/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole("heading", { name: /^Обход «/ })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Склад ГСМ", exact: true })).toBeVisible();
    if (width === 390) await dialog.getByRole("button", { name: /Выбрать точку/ }).click();
    await expect(dialog.getByRole("button", { name: /Склад ГСМ/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("dashboard opens planning and a fresh quick assignment form", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.goto("/#dashboard");
  await page.getByRole("button", { name: "Открыть плановый обход", exact: true }).click();
  await expect(page).toHaveURL(/#schedule$/);
  await expect(page.getByRole("heading", { name: "Плановый обход", exact: true })).toBeVisible();
  await page.goto("/#dashboard");
  await page.getByRole("button", { name: "Быстрое назначение", exact: true }).click();
  await expect(page).toHaveURL(/#assign$/);
  await expect(page.getByRole("dialog", { name: "Создание заявки на обход", exact: true })).toBeVisible();
});
