import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { percoDiagnostics, percoLogs, percoSettings, percoUnmatched } from "./fixtures/perco";

const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
test.beforeEach(async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.route("**/api/v1/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (route.request().url().includes("/emu/shift-reports")) {
      await route.fulfill({ json: { rows: [{ id: "demo-shift-report", reportDate: "2026-10-16", shiftType: "day", workerCategory: "mechanic", employeeId: "demo-worker", employeeName: "Тестовый сотрудник с длинным именем для проверки интерфейса", personnelNo: "001", position: "Слесарь", department: "Производственный участок", status: "submitted", workCount: 2, totalDurationMinutes: 120, createdByUserId: null, createdByName: "Оператор", submittedAt: "2026-10-16T12:00:00+05:00" }], total: 1, page: 1, pageSize: 24, pageCount: 1 } });
      return;
    }
    const fixtures: Record<string, unknown> = { settings: percoSettings, diagnostics: percoDiagnostics, logs: percoLogs, "unmatched-employees": percoUnmatched };
    await route.fulfill({ status: fixtures[name] ? 200 : 501, json: fixtures[name] ?? {} });
  });
});

for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`reference editor: focus, draft protection and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#inventory-settings");
    await expect(page.getByRole("heading", { name: "Настройки учета", exact: true })).toBeVisible();
    const trigger = page.getByRole("button", { name: "Добавить", exact: true }).first();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Новая запись справочника" });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    const name = dialog.getByLabel("Название", { exact: true });
    await name.fill("Длинное название справочника для проверки читаемости и сохранения введённого текста");
    await expect(dialog.getByRole("button", { name: "Сохранить", exact: true })).toBeInViewport();
    expect(await dialog.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    await page.screenshot({ path: path.join(evidence, `settings-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    const confirmation = page.getByRole("dialog", { name: "Несохранённые изменения" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Продолжить редактирование" }).click();
    await expect(name).toHaveValue(/Длинное название/);
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("button", { name: "Закрыть без сохранения" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

for (const width of [390, 1366]) {
  test(`user editor retains the draft and its actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#users");
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Новый пользователь", exact: true });
    expect((await dialog.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect((await dialog.getByRole("checkbox").first().boundingBox())!.height).toBeLessThanOrEqual(24);
    await dialog.getByLabel("Логин *", { exact: true }).fill("temporary-ui-draft");
    await dialog.getByLabel("ФИО *", { exact: true }).fill("Тестовое длинное имя пользователя для проверки формы");
    await expect(dialog.getByRole("button", { name: "Создать пользователя", exact: true })).toBeInViewport();
    await page.screenshot({ path: path.join(evidence, `user-editor-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Продолжить редактирование" }).click();
    await expect(dialog.getByLabel("Логин *", { exact: true })).toHaveValue("temporary-ui-draft");
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await dialog.getByLabel("ФИО *", { exact: true }).fill("Черновик при уменьшении доступной высоты");
      await expect(dialog.getByLabel("ФИО *", { exact: true })).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Создать пользователя", exact: true })).toBeInViewport();
      await page.screenshot({ path: path.join(evidence, "user-editor-reduced-height.png"), animations: "disabled" });
    }
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("button", { name: "Закрыть без сохранения" }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test("route draft retains its point and ordering after cancelling dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/#routes");
  await page.getByRole("button", { name: "Создать маршрут", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Создание маршрута" });
  await dialog.getByLabel("Название маршрута", { exact: true }).fill("Проверка черновика");
  await dialog.getByLabel("Название точки", { exact: true }).fill("Первая точка");
  await dialog.getByRole("button", { name: "Добавить точку", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Продолжить редактирование" }).click();
  await expect(dialog.getByRole("button", { name: /Первая точка/ })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "route-draft-preserved.png") });
});

for (const width of [360, 390, 768, 1366, 1920]) {
  test(`module screens and account panel fit at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    for (const screen of ["dashboard", "results", "assign", "schedule", "employees", "routes", "accounts", "inventory-items", "inventory-ppe", "inventory-settings", "emu-work-accounting", "emu-completed-work-history", "emu-shift-report-history", "perco-integration", "users"]) {
      await page.goto(`/#${screen}`);
      await expect(page.locator("main.workspace h1").first(), screen).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "Loading section" })).toHaveCount(0);
      if (screen === "emu-shift-report-history") await expect(page.getByText("Тестовый сотрудник с длинным именем для проверки интерфейса", { exact: true })).toBeVisible();
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), screen).toBeLessThanOrEqual(1);
      if ([390, 1366].includes(width)) await page.screenshot({ path: path.join(evidence, `${screen}-${width}.png`), animations: "disabled" });
    }
    await page.getByRole("button", { name: "Профиль пользователя", exact: true }).click();
    const profile = page.getByRole("dialog", { name: "Профиль пользователя", exact: true });
    await expect(profile.getByText("Оператор", { exact: true }).first()).toBeVisible();
    await expect(profile.getByRole("button", { name: "Изменить пароль", exact: true })).toBeDisabled();
    await expect(profile.getByRole("button", { name: "Управление пользователями", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(evidence, `user-profile-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Профиль пользователя", exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1366]) {
  test(`results keep comments, media and point navigation readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#results");
    await page.getByRole("button", { name: "Открыть", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Обход «Периметр северный»" });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: path.join(evidence, `result-details-${width}.png`), animations: "disabled" });
    if (width === 390) {
      const points = dialog.getByRole("button", { name: /Выбрать точку/ });
      await expect(points).toHaveAttribute("aria-expanded", "false");
      await expect(dialog.getByRole("heading", { name: "КПП-1", exact: true })).toBeVisible();
      await points.click();
      await dialog.getByRole("button", { name: /2 Склад ГСМ/ }).click();
      await expect(points).toHaveAttribute("aria-expanded", "false");
    }
    await dialog.getByRole("button", { name: /Все комментарии/ }).click();
    await expect(dialog.getByText("Поврежден замок, нужна заявка на ремонт", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(evidence, `result-comments-${width}.png`), animations: "disabled" });
    if (width === 390) expect(await dialog.locator(".patrol-detail-point-list").count()).toBe(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
