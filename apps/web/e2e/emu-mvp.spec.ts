import { expect, test, type Locator, type Page } from "@playwright/test";

const emuVisualRoutes = [
  { hash: "#emu-dashboard", text: "Дашборд" },
  { hash: "#emu-work-accounting", text: "Карточки работ" },
  { hash: "#emu-completed-work-history", text: "История выполненных работ" },
];

const visualViewports = [
  { height: 768, name: "desktop", width: 1365 },
  { height: 844, name: "mobile", width: 390 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
    window.localStorage.removeItem("patrol360.emu.workspace.v1");
    window.sessionStorage.clear();
  });
});

test("EMU key routes fit desktop and mobile without API calls", async ({ page }) => {
  test.setTimeout(45_000);
  const emuApiRequests: string[] = [];
  const consoleIssues: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  await page.route("**/api/v1/emu/**", (route) => {
    emuApiRequests.push(route.request().url());
    return route.abort();
  });

  for (const viewport of visualViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    for (const route of emuVisualRoutes) {
      await page.goto(`/${route.hash}`);
      await expect(page.locator(".emu-page")).toBeVisible();
      await expect(page.locator(".emu-page")).toContainText(route.text);
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      await expectNoPageHorizontalOverflow(page, `${route.hash} ${viewport.name}`);
    }
  }

  expect(emuApiRequests).toEqual([]);
  expect(consoleIssues).toEqual([]);
});

test("EMU MVP work cycle, plan board, favorites and history smoke", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const workTitle = `Smoke ремонт ЭМУ ${suffix}`;
  const deleteTitle = `Smoke удаление ЭМУ ${suffix}`;
  const weekTitle = `Smoke неделя ЭМУ ${suffix}`;
  const rejectTitle = `Smoke отказ ЭМУ ${suffix}`;
  const planRunTitle = `Smoke план в работу ЭМУ ${suffix}`;

  await page.goto("/#emu-dashboard");
  await expect(page.getByRole("heading", { exact: true, name: "Дашборд ЭМУ" })).toBeVisible();
  await expect(page.getByRole("heading", { exact: true, name: "Инциденты и проблемы" })).toBeVisible();
  await expect(page.getByRole("heading", { exact: true, name: "Ключевые показатели" })).toBeVisible();

  await page.goto("/#emu-completed-work-history");
  await expect(page.getByRole("heading", { exact: true, name: "История выполненных работ" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Сводка/ })).toBeVisible();
  await expect(page.getByText("Трудозатраты")).toBeVisible();

  await page.goto("/#emu-work-accounting");
  await expect(page.getByRole("heading", { exact: true, name: "Карточки работ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "↗ Отправить в работу" })).toBeEnabled();

  await createWork(page, workTitle, "Сидоров А.А.");
  const workCard = page.locator(".emu-work-card").filter({ hasText: workTitle });
  await expect(workCard).toBeVisible();

  await clickWorkCardCommand(page, workCard, "Пауза");
  const pauseDialog = page.getByRole("dialog", { name: "Поставить на паузу" });
  await expect(pauseDialog).toBeVisible();
  const otherWorkCheckbox = pauseDialog.locator(".emu-checkbox input[type='checkbox']");
  await otherWorkCheckbox.check();
  await expect(otherWorkCheckbox).toBeChecked();
  await pauseDialog.getByRole("textbox", { name: "Комментарий" }).fill("Smoke пауза: другой срочный наряд");
  await pauseDialog.getByRole("button", { name: "Пауза" }).click();
  await expect(workCard.getByText("На другой работе")).toBeVisible();

  await clickWorkCardCommand(page, workCard, "Продолжить");
  const resumeDialog = page.getByRole("dialog", { name: "Продолжить работу" });
  await expect(resumeDialog).toBeVisible();
  await resumeDialog.getByRole("textbox", { name: "Комментарий" }).fill("Smoke возврат");
  await resumeDialog.getByRole("button", { name: "Продолжить" }).click();
  await expect(workCard.getByText("Работает")).toBeVisible();

  await clickWorkCardCommand(page, workCard, "Завершить");
  const completeDialog = page.getByRole("dialog", { name: "Завершить работу" });
  await expect(completeDialog).toBeVisible();
  await expect(completeDialog.getByText("Время окончания")).toBeVisible();
  await completeDialog.getByRole("textbox", { name: "Результат работы" }).fill("Smoke работа выполнена, результат зафиксирован");
  await completeDialog.getByRole("button", { name: "Завершить работу" }).click();
  await expect(workCard).toBeHidden();
  await page.goto("/#emu-completed-work-history");
  await expect(page.locator("tbody").getByText(workTitle)).toBeVisible();
  await page.goto("/#emu-work-accounting");

  await createWork(page, deleteTitle, "Кузнецов П.В.");
  const deleteCard = page.locator(".emu-work-card").filter({ hasText: deleteTitle });
  await expect(deleteCard).toBeVisible();
  await clickWorkCardCommand(page, deleteCard, "Удалить");
  const deleteDialog = page.getByRole("dialog", { name: "Удалить работу" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("textbox", { name: "Причина удаления" }).fill("Smoke проверка soft-delete");
  await deleteDialog.getByRole("button", { name: "Удалить" }).click();
  await expect(deleteCard).toBeHidden();

  await openPlanBoard(page);
  await createPlanTask(page, weekTitle, "Сидоров А.А.");
  await page.getByRole("button", { name: /Согласовать неделю \(/ }).click();
  const weekConfirm = page.locator(".emu-nested-confirm").filter({ hasText: "Согласовать неделю" });
  await expect(weekConfirm).toContainText("Будет согласовано задач");
  await weekConfirm.getByRole("button", { name: "Согласовать неделю" }).click();
  await expect(page.locator(".emu-plan-card").filter({ hasText: weekTitle })).toBeVisible();

  await createPlanTask(page, rejectTitle, "Петров М.Д.");
  const rejectCard = page.locator(".emu-plan-card").filter({ hasText: rejectTitle });
  await rejectCard.getByRole("button", { name: "Отклонить" }).click();
  const rejectConfirm = page.locator(".emu-nested-confirm").filter({ hasText: rejectTitle });
  await rejectConfirm.getByRole("textbox", { name: "Комментарий" }).fill("Smoke причина отклонения");
  await rejectConfirm.getByRole("button", { name: "Отклонить" }).click();
  await expect(rejectConfirm).toBeHidden();

  await createPlanTask(page, planRunTitle, "Пакулин Д.А.");
  const planRunCard = page.locator(".emu-plan-card").filter({ hasText: planRunTitle });
  await planRunCard.getByRole("button", { name: "Согласовать" }).click();
  await planRunCard.getByRole("button", { name: "Отправить в работу" }).click();
  await page.getByRole("dialog", { name: "Доска задач / план на неделю" }).getByRole("button", { name: "×" }).click();
  await expect(page.locator(".emu-work-card").filter({ hasText: planRunTitle })).toBeVisible();

  await page.getByRole("button", { name: "Избранные" }).click();
  const favoritesDialog = page.getByRole("dialog", { name: "Избранные сотрудники ЭМУ" });
  await expect(favoritesDialog).toBeVisible();
  await favoritesDialog.getByRole("button", { name: "Убрать" }).first().click();
  await expect(favoritesDialog.getByText("История работ и общий справочник сотрудников не изменятся.")).toBeVisible();
  await favoritesDialog.getByRole("button", { name: "Отмена" }).click();
  await favoritesDialog.getByRole("button", { name: "Убрать" }).first().click();
  await favoritesDialog.getByRole("button", { name: "Убрать из избранных" }).click();
  await favoritesDialog.getByRole("button", { name: "×" }).click();

  await page.goto("/#emu-completed-work-history");
  const historyFilters = page.locator(".emu-history-filter-card");
  await historyFilters.getByRole("button", { name: "Применить" }).click();
  await expect(page.locator("tbody").getByText(workTitle)).toBeVisible();
  await page.getByRole("row").filter({ hasText: workTitle }).click();
  await expect(page.getByText("Корректировка времени окончания", { exact: true })).toBeVisible();
  await page.getByLabel("Удаленные").check();
  await historyFilters.getByRole("button", { name: "Применить" }).click();
  const deletedHistoryRow = page.getByRole("row").filter({ hasText: deleteTitle });
  await expect(deletedHistoryRow).toBeVisible();
  await expect(deletedHistoryRow.getByText("Удалено", { exact: true })).toBeVisible();
});

async function createWork(page: Page, title: string, _employeeName: string) {
  await page.getByRole("button", { name: "↗ Отправить в работу" }).click();
  const dialog = page.getByRole("dialog", { name: "Отправить в работу / Новая работа" });
  await expect(dialog).toBeVisible();
  const employeeButtons = dialog.locator(".emu-picker button");
  await expect(employeeButtons.first()).toBeVisible();
  const count = Math.min(await employeeButtons.count(), 8);
  for (let index = 0; index < count; index += 1) {
    await employeeButtons.nth(index).click();
    const selected = await dialog.locator(".emu-selected-strip span").count();
    if (selected > 0) break;
  }
  await expect(dialog.locator(".emu-selected-strip span")).toHaveCount(1);
  await dialog.getByRole("textbox", { name: "Задача / ожидаемый результат" }).fill(title);
  await expect(dialog.getByRole("button", { name: "Отправить в работу" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Отправить в работу" }).click();
}

async function clickWorkCardCommand(page: Page, card: Locator, actionName: string) {
  const directButton = card.getByRole("button", { name: actionName });
  if ((await directButton.count()) > 0) {
    try {
      await directButton.first().click({ timeout: 750 });
      return;
    } catch {
      // The current compact card keeps actions in the quick-command menu.
    }
  }

  await card.getByRole("button", { name: "Команды" }).click();
  const menu = page.locator(".emu-quick-menu").last();
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: actionName }).click();
}

async function openPlanBoard(page: Page) {
  await page.goto("/#emu-work-accounting");
  await page.getByRole("button", { name: "Доска задач" }).click();
  await expect(page.getByRole("dialog", { name: "Доска задач / план на неделю" })).toBeVisible();
}

async function createPlanTask(page: Page, title: string, _employeeName: string) {
  const dialog = page.getByRole("dialog", { name: "Доска задач / план на неделю" });
  await dialog.getByPlaceholder("Новая плановая задача").fill(title);
  await dialog.getByRole("textbox", { name: "Описание" }).fill(`${title}: описание`);
  const employeeCheckbox = dialog.locator(".emu-check-list.compact input[type='checkbox']").first();
  await expect(employeeCheckbox).toBeVisible();
  await employeeCheckbox.check();
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.locator(".emu-plan-card").filter({ hasText: title })).toBeVisible();
}

async function expectNoPageHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const bodyWidth = document.body?.scrollWidth ?? 0;
    const documentWidth = document.documentElement.scrollWidth;
    return Math.max(bodyWidth, documentWidth) - window.innerWidth;
  });

  expect(overflow, `${label} should not create page-level horizontal overflow`).toBeLessThanOrEqual(1);
}
