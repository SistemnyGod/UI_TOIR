import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import employeeSource from "../src/fixtures/accountingEmployees.json" with { type: "json" };
import type { ActivePatrol, RouteDirectoryItem } from "../src/types";

const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
const route: RouteDirectoryItem = { id: "ui-test-route", name: "Тестовый обход производственного участка с длинным названием", status: "Активен", versionNo: 1, territory: "Контрольный участок", description: "Демонстрационные данные для UI", duration: "00:45", distance: "1 км", periodicity: "По заявке",
  points: Array.from({ length: 12 }, (_, index) => ({ id: `ui-point-${index}`, order: index + 1, name: `Контрольная точка ${index + 1} — оборудование и ограждение`, zone: "Участок", type: "NFC", tag: `TEST-${index}`, description: "Проверить оборудование", instruction: "Фотографии добровольны", interval: "00:10", expectedTime: "00:05", status: "Активна", requiresPhoto: false })) };
const employees = Array.from({ length: 120 }, (_, index) => ({ ...employeeSource[0], id: `ui-employee-${index}`, fullName: `Тестовый сотрудник ${index} с длинным именем`, position: "Маршрутный обходчик", shift: "День", status: "Активен" }));
const assignment: ActivePatrol = { id: "ui-assignment", employee: employees[0].fullName, employeeId: employees[0].id, routeId: route.id, route: route.name, zone: "Участок", shift: "День", currentPoint: "Контрольная точка", status: "В пути", progress: 25, eta: "00:30", deviation: "—", plannedAt: "16.10.2026, 10:00", startedAtIso: "2026-10-16T05:00:00Z" };
test.beforeEach(async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.addInitScript(({ route, employees, assignment }) => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
    localStorage.setItem("patrol360.routes.v1", JSON.stringify({ version: 2, value: [route] }));
    localStorage.setItem("patrol360.employees.v1", JSON.stringify({ version: 2, value: employees }));
    localStorage.setItem("patrol360.activePatrols.v1", JSON.stringify({ version: 2, value: [assignment] }));
    localStorage.setItem("patrol360.patrolEmployees.favoriteIds.v1", JSON.stringify([employees[0].id]));
  }, { route, employees, assignment });
  await page.route("**/api/v1/**", route => route.abort());
});
async function fit(page: Page, dialog: Locator) {
  const footer = dialog.locator(".modal-shell-actions");
  await expect.poll(async () => { const box = (await footer.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
async function discard(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click();
}

for (const width of [360, 390, 768, 1280, 1366, 1920]) {
  test(`assignment editors retain drafts, photos and accessible actions at ${width}px`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/#assign");
    await page.getByRole("button", { name: "Создать заявку", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Создание заявки на обход", exact: true });
    if (width < 768) {
      await expect(create.getByRole("button", { name: /^Маршрут:/ })).toHaveAttribute("aria-expanded", "false");
      await expect(create.getByRole("button", { name: "Сообщение сотруднику", exact: true })).toHaveAttribute("aria-expanded", "false");
    }
    await create.getByPlaceholder("Особенности обхода и зоны внимания…").fill("Проверить ограждения и состояние оборудования. ".repeat(5));
    await fit(page, create);
    await page.screenshot({ path: path.join(evidence, `assignment-create-${width}.png`), animations: "disabled" });
    await discard(page);

    await page.getByRole("button", { name: "Настроить избранных", exact: true }).first().click();
    const picker = page.getByRole("dialog", { name: "Избранные сотрудники для назначений", exact: true });
    await picker.getByRole("textbox", { name: "Поиск сотрудников в избранном" }).fill("Тестовый сотрудник 110 ");
    await picker.getByRole("button", { name: /Тестовый сотрудник 110 с/ }).click();
    await fit(page, picker);
    await page.screenshot({ path: path.join(evidence, `assignment-employees-${width}.png`), animations: "disabled" });
    await discard(page);
    await expect(page.getByRole("button", { name: "Настроить избранных", exact: true }).first()).toBeFocused();

    await page.getByRole("button", { name: "Смены", exact: true }).click();
    const shifts = page.getByRole("dialog", { name: "Настройка смен", exact: true });
    await shifts.getByLabel("Начало дневной смены", { exact: true }).fill("07:15");
    await fit(page, shifts);
    await page.screenshot({ path: path.join(evidence, `assignment-shifts-${width}.png`), animations: "disabled" });
    await discard(page);

    const command = page.getByRole("button", { name: `Действия по маршруту: ${route.name}`, exact: true });
    await command.click();
    await page.getByRole("menuitem", { name: "Завершить обход", exact: true }).click();
    const complete = page.getByRole("dialog", { name: "Завершить обход", exact: true });
    await complete.getByPlaceholder("Что проверили, что обнаружили, итог обхода").fill("Ограждения проверены. ".repeat(50));
    await expect(complete.locator("details.assignment-complete-point")).toHaveCount(12);
    await expect(complete.locator("details.assignment-complete-point[open]")).toHaveCount(1);
    const photo = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 1920; canvas.height = 1080;
      const context = canvas.getContext("2d")!; context.fillStyle = "#d8e4f2"; context.fillRect(0, 0, 1920, 1080);
      context.fillStyle = "#1769ff"; context.fillRect(100, 100, 1720, 880); context.fillStyle = "white"; context.font = "70px sans-serif"; context.fillText("ТЕСТОВАЯ ФОТОГРАФИЯ 1920 × 1080", 180, 530);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await complete.locator('input[type="file"]').first().setInputFiles([1, 2, 3].map(index => ({ name: `inspection-${index}.png`, mimeType: "image/png", buffer: Buffer.from(photo, "base64") })));
    await expect(complete.getByRole("button", { name: "Убрать фото inspection-1.png", exact: true })).toBeVisible();
    await complete.getByRole("button", { name: "Убрать фото inspection-3.png", exact: true }).click();
    await expect(complete.getByRole("button", { name: /^Убрать фото/ })).toHaveCount(2);
    await fit(page, complete);
    await page.screenshot({ path: path.join(evidence, `assignment-complete-${width}.png`), animations: "disabled" });
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 });
      await complete.getByPlaceholder("Что проверили, что обнаружили, итог обхода").fill("Комментарий при уменьшенной высоте");
      await fit(page, complete);
      await expect(complete.getByPlaceholder("Что проверили, что обнаружили, итог обхода")).toBeInViewport();
      await page.screenshot({ path: path.join(evidence, "assignment-complete-reduced-height.png"), animations: "disabled" });
    }
    await discard(page);
    await expect(command).toBeFocused();
    await page.setViewportSize({ width, height: 900 });

    await command.click();
    await page.getByRole("menuitem", { name: "Отменить назначение", exact: true }).click();
    const cancel = page.getByRole("dialog", { name: "Отмена заявки на обход", exact: true });
    await cancel.getByRole("combobox", { name: "Причина отмены", exact: true }).selectOption("other");
    await cancel.getByRole("textbox").fill("Развёрнутый комментарий к отмене назначения. ".repeat(12));
    await fit(page, cancel);
    await page.screenshot({ path: path.join(evidence, `assignment-cancel-${width}.png`), animations: "disabled" });
    await discard(page);
    await expect(command).toBeFocused();
    expect(errors).toEqual([]);
  });
}
