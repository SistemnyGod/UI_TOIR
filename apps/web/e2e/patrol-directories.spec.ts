import { expect, test, type Page } from "@playwright/test";
import employeeSource from "../src/fixtures/accountingEmployees.json" with { type: "json" };
import type { RouteDirectoryItem } from "../src/types";

const routeFixture: RouteDirectoryItem = {
  id: "20000000-0000-0000-0000-000000000001", versionNo: 1, name: "Обход печей", territory: "Производственный участок", description: "Проверка оборудования и состояния площадок.", status: "Активен", duration: "00:30", distance: "1 км", periodicity: "По заявке",
  points: [0, 1].map(index => ({ id: `20000000-0000-0000-0000-00000000000${index + 2}`, order: index + 1, name: `Печь №${index + 1}`, zone: "Печное отделение", type: "NFC", tag: `NFC-FURNACE-${index + 1}`, description: "Контроль корпуса, привода и ограждений.", instruction: "Проверить отсутствие посторонних звуков. Приложить фотографию.", interval: "00:10", expectedTime: "00:05", status: "Активна", requiresPhoto: index === 0 })),
};
async function setup(page: Page, hash: string) {
  await page.addInitScript(({ route, ids }) => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
    localStorage.setItem("patrol360.routes.v1", JSON.stringify({ version: 2, value: [route] }));
    localStorage.setItem("patrol360.patrolEmployees.favoriteIds.v1", JSON.stringify(ids));
  }, { route: routeFixture, ids: employeeSource.slice(0, 8).map(employee => employee.id) });
  await page.route("**/api/v1/**", route => route.abort());
  await page.goto(`/#${hash}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page).toHaveTitle(/Патруль 360/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
}
async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
async function visibleFooter(page: Page, selector: string) {
  const footer = (await page.locator(selector).boundingBox())!;
  expect(footer.y).toBeGreaterThanOrEqual(0);
  expect(footer.y + footer.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}

for (const width of [1440, 390]) {
  test(`employee search, profile, filters and editing work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await setup(page, "employees");
    await expect(page.locator(".employee-roster-row")).toHaveCount(8);
    if (width === 1440) {
      const list = (await page.locator(".employee-directory-panel").boundingBox())!;
      const profile = (await page.locator(".employee-profile-drawer").boundingBox())!;
      expect(profile.x).toBeGreaterThan(list.x + list.width);
      await expect.poll(async () => {
        const list = (await page.locator(".employee-directory-panel").boundingBox())!;
        const profile = (await page.locator(".employee-profile-drawer").boundingBox())!;
        return Math.abs(profile.y - list.y);
      }).toBeLessThan(2);
    }
    await page.getByLabel("Поиск сотрудников обхода").fill("Ничего не найдено");
    await expect(page.getByText("Сотрудники не найдены", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).first().click();
    await expect(page.locator(".employee-roster-row")).toHaveCount(8);
    await page.getByRole("button", { name: `Открыть профиль: ${employeeSource[1].fullName}`, exact: true }).click();
    await expect(page.locator(".employee-profile-title h2")).toHaveText(employeeSource[1].fullName);
    await page.getByRole("button", { name: "Редактировать", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Редактировать сотрудника" });
    await expect(modal).toBeVisible();
    await visibleFooter(page, ".employee-form-modal .modal-shell-actions");
    const newName = `${employeeSource[1].fullName} (проверка)`;
    await modal.getByLabel("ФИО", { exact: true }).fill(newName);
    await modal.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator(".employee-profile-title h2")).toHaveText(newName);
    await fit(page);
    expect(errors).toEqual([]);
  });
  test(`point search, ordering, voluntary photos and editor work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await setup(page, "routes");
    await expect(page.locator(".route-point-select")).toHaveCount(2);
    await page.getByRole("button", { name: "Переместить точку «Печь №1» выше", exact: true }).isDisabled().then(disabled => expect(disabled).toBe(true));
    await page.getByRole("button", { name: "Переместить точку «Печь №1» ниже", exact: true }).click();
    await expect(page.locator(".route-point-select").first()).toHaveAttribute("aria-label", "Открыть точку: Печь №2");
    await page.getByLabel("Поиск точки", { exact: true }).fill("NFC-FURNACE-1");
    await expect(page.locator(".route-point-select")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Переместить точку «Печь №1» ниже", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Открыть точку: Печь №1", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Редактирование точки" });
    await expect(modal.getByLabel("Требовать фото при фиксации точки")).toHaveCount(0);
    await visibleFooter(page, ".route-point-modal .drawer-actions");
    await page.screenshot({ path: test.info().outputPath("point-editor-voluntary-photos.png"), animations: "disabled" });
    await modal.getByLabel("Описание оборудования", { exact: true }).fill("Дополнительно осмотреть ограждение привода.");
    await modal.getByRole("button", { name: "Сохранить точку", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page.getByRole("button", { name: "Открыть точку: Печь №1", exact: true }).click();
    await expect(modal.getByLabel("Описание оборудования", { exact: true })).toHaveValue("Дополнительно осмотреть ограждение привода.");
    await expect(modal.getByLabel("Требовать фото при фиксации точки")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Порядок обхода", exact: true }).click();
    await expect(page.locator(".route-point-list li")).toHaveCount(2);
    await fit(page);
    expect(errors).toEqual([]);
  });
  test(`route creation retains staged points and fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, "routes");
    await page.getByRole("button", { name: "Создать маршрут", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Создание маршрута" });
    await visibleFooter(page, ".route-create-modal .route-create-footer");
    await modal.getByLabel("Название маршрута", { exact: true }).fill("Контрольный маршрут");
    await modal.getByLabel("Название точки", { exact: true }).fill("Галерея 1");
    await expect(modal.getByLabel("Требовать фото при фиксации точки")).toHaveCount(0);
    await modal.getByRole("button", { name: "Добавить точку", exact: true }).click();
    await modal.getByLabel("Территория", { exact: true }).fill("Участок 2");
    await expect(modal.getByRole("button", { name: /Галерея 1/ })).toBeVisible();
    await modal.getByRole("button", { name: "Создать маршрут с точками (1)", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Открыть маршрут: Контрольный маршрут", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Открыть точку: Галерея 1", exact: true }).click();
    const point = page.getByRole("dialog", { name: "Редактирование точки" });
    await expect(point.getByLabel("Требовать фото при фиксации точки")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await fit(page);
  });
}

test("employee picker preserves multi-page choices and explicit save", async ({ page }) => {
  await setup(page, "employees");
  await page.getByRole("button", { name: "Выбрать из справочника", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Сотрудники для обходов" });
  await expect(modal.locator(".patrol-employee-picker-row")).toHaveCount(50);
  await visibleFooter(page, ".patrol-employee-picker-modal .pagination-bar");
  await modal.getByRole("button", { name: "Вперед", exact: true }).click();
  await modal.locator(".patrol-employee-picker-row").first().click();
  await expect(modal.locator(".patrol-employee-picker-row").first()).toHaveAttribute("aria-pressed", "true");
  await modal.getByLabel("Поиск", { exact: true }).fill(employeeSource[0].fullName);
  await expect(modal.locator(".patrol-employee-picker-row").first()).toHaveAttribute("aria-pressed", "true");
  await modal.getByRole("button", { name: "Сохранить список", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".employee-roster-row")).toHaveCount(9);
});

test("route archives by confirmation and can be restored through the same editor", async ({ page }) => {
  await setup(page, "routes");
  await page.getByRole("button", { name: "Редактировать", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Редактирование маршрута" });
  await modal.getByRole("button", { name: "В архив", exact: true }).click();
  await expect(modal.getByRole("button", { name: "Да, в архив", exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "Да, в архив", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole("button", { name: "Показать архив", exact: true }).click();
  await expect(page.getByRole("button", { name: "Открыть маршрут: Обход печей", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Открыть маршрут: Обход печей", exact: true }).click();
  await page.getByRole("button", { name: "Редактировать", exact: true }).click();
  await modal.getByLabel("Статус маршрута", { exact: true }).selectOption("Активен");
  await modal.getByRole("button", { name: "Сохранить маршрут", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".route-facts").getByText("Активен", { exact: true })).toBeVisible();
  await expect(page.locator(".route-point-select")).toHaveCount(2);
});

test("point API error retains input, voluntary photos and offers a successful retry", async ({ page }) => {
  let point = { ...routeFixture.points[0], sequenceNo: 1, isRequired: true, nfcCode: routeFixture.points[0].tag };
  const routeDto = () => ({ ...routeFixture, points: [point] });
  let attempts = 0;
  let saved: Record<string, unknown> | undefined;
  await page.addInitScript(() => { localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" })); localStorage.setItem("patrol360.sessionToken", "test-directories-token"); });
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") { await route.fulfill({ json: { id: "test-admin", login: "admin", displayName: "Оператор проверки", roles: ["admin"], permissions: ["routes.read", "routes.write", "employees.read", "assignments.write", "results.read"] } }); return; }
    if (path === "/api/v1/routes") { await route.fulfill({ json: [routeDto()] }); return; }
    if (path === `/api/v1/routes/${routeFixture.id}/points/${point.id}` && route.request().method() === "PUT") {
      attempts++;
      saved = route.request().postDataJSON();
      if (attempts === 1) { await route.fulfill({ status: 422, json: { title: "Контрольная ошибка сохранения", status: 422, errors: { name: ["Попробуйте снова"] } } }); return; }
      point = { ...point, ...saved };
      await route.fulfill({ json: point }); return;
    }
    await route.fulfill({ json: [] });
  });
  await page.goto("/#routes");
  await expect(page.locator(".route-point-select")).toHaveCount(1);
  await page.getByRole("button", { name: "Открыть точку: Печь №1", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Редактирование точки" });
  await modal.getByLabel("Название точки", { exact: true }).fill("Печь №1 после проверки");
  await modal.getByRole("button", { name: "Сохранить точку", exact: true }).click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await expect(modal.getByLabel("Название точки", { exact: true })).toHaveValue("Печь №1 после проверки");
  await expect(modal.getByLabel("Требовать фото при фиксации точки")).toHaveCount(0);
  expect(saved?.requiresPhoto).toBe(false);
  await modal.getByRole("button", { name: "Сохранить точку", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Открыть точку: Печь №1 после проверки", exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
