import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { workAccountingNow, workAccountingSessions, workAccountingSettings, workAccountingStore } from "./fixtures/workAccounting";

test.use({ timezoneId: "Asia/Yekaterinburg" });
async function mockBoard(page: Page, store = workAccountingStore) {
  await page.clock.setFixedTime(new Date(workAccountingNow));
  await page.addInitScript(store => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
    localStorage.setItem("patrol360.emu.workspace.v1", JSON.stringify(store));
    sessionStorage.clear();
  }, store);
  await page.route("**/api/v1/**", route => route.abort());
  await page.goto("/#emu-work-accounting");
  await expect(page.locator(".emu-work-card")).toHaveCount(5);
}
async function fit(page: Page, dialog?: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  if (dialog) {
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect((await dialog.getByRole("heading", { level: 2 }).first().boundingBox())!.x).toBeGreaterThanOrEqual(box.x + 12);
    const footer = (await dialog.locator(".modal-shell-actions").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }
}
async function command(page: Page, card: Locator, name: string) {
  await card.getByRole("button", { name: "Команды", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

for (const width of [1440, 390]) {
  test(`work board, employee availability and details fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await mockBoard(page);
    await expect(page).toHaveTitle(/Патруль 360/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Учет работ ЭМУ");
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await fit(page);
    expect((await page.locator(".emu-work-filters").boundingBox())!.height).toBeLessThan(110);
    await page.getByRole("combobox", { name: "Участок", exact: true }).selectOption("section-energy");
    await expect(page.locator(".emu-work-card")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /Иванов Андрей Сергеевич.*Статус: В работе/ })).toBeVisible();
    await page.getByRole("combobox", { name: "Участок", exact: true }).selectOption("");
    await page.getByRole("tab", { name: "Подробно", exact: true }).click();
    await expect(page.locator(".emu-work-card.density-comfortable")).toHaveCount(5);
    await page.getByRole("tab", { name: "Компактно", exact: true }).click();
    const card = page.getByRole("article", { name: "Работа ЭМУ-2026-0001", exact: true });
    await card.getByRole("button", { name: "Открыть карточку ЭМУ-2026-0001" }).click();
    const details = page.getByRole("dialog", { name: "Карточка работы", exact: true });
    await expect(details.getByText("Иванов Андрей Сергеевич", { exact: true })).toBeVisible();
    await fit(page, details);
    await details.getByRole("tab", { name: /Вложения/ }).click();
    await expect(details.getByText("К этой работе вложения не добавлены.")).toBeVisible();
    await details.getByRole("tab", { name: "История", exact: true }).click();
    await expect(details.getByText("В журнале нет событий этой карточки.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await page.getByRole("button", { name: "Обновить доску", exact: true }).click();
    await expect(page.locator(".emu-work-card")).toHaveCount(5);
    expect(errors).toEqual([]);
  });
  test(`create, pause, resume and complete a work at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await mockBoard(page);
    await page.getByRole("button", { name: "Создать работу", exact: true }).first().click();
    const create = page.getByRole("dialog", { name: "Создать работу", exact: true });
    await fit(page, create);
    await create.getByRole("button", { name: /Морозов Сергей Петрович/ }).click();
    await create.getByLabel("Задача / ожидаемый результат", { exact: true }).fill("Контрольный осмотр привода\nПроверить муфту и ограждение.");
    await create.getByRole("button", { name: "Создать работу", exact: true }).click();
    await expect(create).toHaveCount(0);
    const card = page.locator(".emu-work-card").filter({ hasText: "Контрольный осмотр привода" });
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: "Создать работу", exact: true }).first().click();
    await expect(create.getByLabel("Задача / ожидаемый результат", { exact: true })).toHaveValue("");
    await expect(create.locator(".emu-selected-strip")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.clock.setFixedTime(new Date("2026-10-13T14:00:00+05:00"));
    await command(page, card, "Пауза");
    const pause = page.getByRole("dialog", { name: "Поставить на паузу" });
    await fit(page, pause);
    await pause.getByLabel("Комментарий к паузе", { exact: true }).fill("Ожидаем материал");
    await pause.getByRole("button", { name: "Пауза", exact: true }).click();
    await expect(pause).toHaveCount(0);
    await expect(card).toHaveClass(/status-paused/);
    await page.clock.setFixedTime(new Date("2026-10-13T14:15:00+05:00"));
    await command(page, card, "Продолжить");
    const resume = page.getByRole("dialog", { name: "Продолжить работу", exact: true });
    await fit(page, resume);
    await resume.getByLabel("Комментарий", { exact: true }).fill("Материал получен");
    await resume.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(resume).toHaveCount(0);
    await expect(card).toHaveClass(/status-working/);
    await page.clock.setFixedTime(new Date("2026-10-13T15:00:00+05:00"));
    await command(page, card, "Завершить работу");
    const complete = page.getByRole("dialog", { name: "Завершить работу", exact: true });
    await fit(page, complete);
    await complete.getByLabel("Дата окончания", { exact: true }).fill("");
    await expect(complete.getByRole("button", { name: "Завершить работу", exact: true })).toBeDisabled();
    await complete.getByRole("button", { name: "Сейчас", exact: true }).click();
    await complete.getByLabel("Результат и описание выполненной работы", { exact: true }).fill("Привод осмотрен. Замечаний нет.");
    await complete.getByRole("button", { name: "Завершить работу", exact: true }).click();
    await expect(complete).toHaveCount(0);
    await expect(card).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("patrol360.emu.workspace.v1")!).sessions.find((row: { taskDescription: string }) => row.taskDescription.startsWith("Контрольный осмотр")));
    expect(saved).toMatchObject({ resultStatus: "Выполнено", resultComment: "Привод осмотрен. Замечаний нет." });
    await fit(page);
  });
  test(`manage a participant inside the work viewer at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await mockBoard(page);
    await page.getByRole("button", { name: "Открыть карточку ЭМУ-2026-0003", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Карточка работы", exact: true });
    await fit(page, details);
    await details.getByRole("button", { name: "Пауза — Соколов Дмитрий Викторович", exact: true }).click();
    const pause = page.getByRole("dialog", { name: "Поставить на паузу", exact: true });
    await pause.getByRole("button", { name: "Пауза", exact: true }).click();
    await expect(details).toBeVisible();
    const sokolov = details.getByRole("row").filter({ hasText: "Соколов Дмитрий Викторович" });
    const orlova = details.getByRole("row").filter({ hasText: "Орлова Анна Павловна" });
    await expect(sokolov.getByText("На паузе", { exact: true })).toBeVisible();
    await expect(orlova.getByText("На другой работе", { exact: true })).toBeVisible();
    await sokolov.getByRole("button", { name: "Продолжить — Соколов Дмитрий Викторович", exact: true }).click();
    const resume = page.getByRole("dialog", { name: "Продолжить работу", exact: true });
    await expect(resume.getByRole("checkbox", { name: /Соколов/ })).toBeChecked();
    await expect(resume.getByRole("checkbox", { name: /Орлова/ })).not.toBeChecked();
    await resume.getByRole("button", { name: "Отмена", exact: true }).click();
    await expect(details).toBeVisible();
    await sokolov.getByRole("button", { name: "Продолжить — Соколов Дмитрий Викторович", exact: true }).click();
    await resume.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(details).toBeVisible();
    await expect(sokolov.getByText("Работает", { exact: true })).toBeVisible();
    await expect(orlova.getByText("На другой работе", { exact: true })).toBeVisible();
    await details.getByRole("button", { name: "Добавить сотрудника", exact: true }).click();
    const add = page.getByRole("dialog", { name: "Добавить сотрудника в работу", exact: true });
    await fit(page, add);
    await add.getByLabel("Поиск сотрудника", { exact: true }).fill("Морозов");
    await add.getByRole("button", { name: /Морозов Сергей Петрович/ }).click();
    await add.getByLabel("Поиск сотрудника", { exact: true }).fill("Волков");
    await expect(add.locator('.emu-selected-strip [title="Морозов Сергей Петрович"]')).toBeVisible();
    await add.getByRole("textbox", { name: "Комментарий", exact: true }).fill("Помощь при осмотре конвейера");
    await add.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(details).toBeVisible();
    const morozov = details.getByRole("row").filter({ hasText: "Морозов Сергей Петрович" });
    await expect(morozov).toBeVisible();
    await morozov.getByRole("button", { name: "Завершить участие — Морозов Сергей Петрович", exact: true }).click();
    const finish = page.getByRole("dialog", { name: "Завершить участие сотрудника", exact: true });
    await finish.getByRole("textbox", { name: "Причина / комментарий", exact: true }).fill("Контроль оборудования окончен");
    await finish.getByRole("button", { name: "Завершить участие", exact: true }).click();
    await expect(details).toBeVisible();
    await expect(morozov.getByText("Завершил", { exact: true })).toBeVisible();
    await expect(morozov.getByRole("group", { name: /Действия:/ })).toHaveCount(0);
    await details.getByRole("button", { name: "Завершить работу", exact: true }).click();
    const complete = page.getByRole("dialog", { name: "Завершить работу", exact: true });
    await complete.getByRole("textbox", { name: "Результат и описание выполненной работы", exact: true }).fill("Конвейер проверен. Работа завершена.");
    await complete.getByRole("button", { name: "Завершить работу", exact: true }).click();
    await expect(details).toBeVisible();
    await expect(details.getByText("Конвейер проверен. Работа завершена.", { exact: true })).toBeVisible();
    await expect(details.getByRole("button", { name: "Завершить работу", exact: true })).toHaveCount(0);
    await fit(page, details);
    await details.getByRole("button", { name: "Закрыть карточку", exact: true }).click();
    await expect(page.getByRole("article", { name: "Работа ЭМУ-2026-0003", exact: true })).toHaveCount(0);
  });
}

test("employee filters survive inspector navigation and refreshing the board", async ({ page }) => {
  await mockBoard(page);
  await page.getByLabel("Поиск сотрудников", { exact: true }).fill("Иванов");
  await page.getByLabel("Фильтр занятости", { exact: true }).selectOption("working");
  await page.getByRole("button", { name: /Иванов Андрей Сергеевич.*Статус: В работе/ }).click();
  await page.getByRole("button", { name: /Сотрудники$/ }).click();
  await expect(page.getByLabel("Поиск сотрудников", { exact: true })).toHaveValue("Иванов");
  await expect(page.getByLabel("Фильтр занятости", { exact: true })).toHaveValue("working");
  await page.getByRole("button", { name: "Обновить доску", exact: true }).click();
  await expect(page.getByLabel("Поиск сотрудников", { exact: true })).toHaveValue("Иванов");
  await expect(page.getByLabel("Фильтр занятости", { exact: true })).toHaveValue("working");
});

test("commands support keyboard navigation and employee inspector can be closed", async ({ page }) => {
  await mockBoard(page);
  const card = page.getByRole("article", { name: "Работа ЭМУ-2026-0001", exact: true });
  const trigger = card.getByRole("button", { name: "Команды", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Просмотр", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Удалить", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: /Иванов Андрей Сергеевич.*Статус: В работе/ }).click();
  await expect(card).toHaveClass(/is-selected/);
  await page.getByRole("button", { name: /Сотрудники$/ }).click();
  await expect(card).not.toHaveClass(/is-selected/);
});

test("employee picker reaches later pages and keeps the selection when searching", async ({ page }) => {
  const favorites = Array.from({ length: 60 }, (_, index) => ({ ...workAccountingSettings.favoriteEmployees[0], id: `large-favorite-${index}`, employeeId: `large-employee-${index}`, fullName: `Работник ${String(index).padStart(2, "0")} Иванович`, personnelNo: `large-${index}` }));
  await mockBoard(page, { ...workAccountingStore, settings: { ...workAccountingSettings, favoriteEmployees: favorites } });
  await page.getByRole("button", { name: "Создать работу", exact: true }).first().click();
  const create = page.getByRole("dialog", { name: "Создать работу", exact: true });
  await create.getByRole("button", { name: "Вперед", exact: true }).click();
  await create.getByRole("button", { name: "Вперед", exact: true }).click();
  await create.getByRole("button", { name: /^Работник 55 Иванович/ }).click();
  await create.getByLabel("Поиск сотрудника", { exact: true }).fill("Работник 00");
  await expect(create.locator('.emu-selected-strip [title="Работник 55 Иванович"]')).toBeVisible();
  await expect(create.getByRole("button", { name: "Снять выбор", exact: true })).toBeVisible();
});

const apiUser = { id: "work-operator", login: "operator", displayName: "Оператор ЭМУ", roles: ["admin"], permissions: [] };
async function apiBoard(page: Page, override?: (route: Route, path: string) => Promise<boolean>, permissions?: string[]) {
  await page.clock.setFixedTime(new Date(workAccountingNow));
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "api" }));
    localStorage.setItem("patrol360.sessionToken", "work-test-token");
  });
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (override && await override(route, path)) return;
    let json: unknown = [];
    if (path === "/api/v1/auth/me") json = permissions ? { ...apiUser, roles: [], permissions } : apiUser;
    else if (path === "/api/v1/emu/settings") json = workAccountingSettings;
    else if (path === "/api/v1/emu/dashboard") json = { metrics: [], recentEvents: [], workBySection: [], incidents: [] };
    else if (path === "/api/v1/emu/work-sessions") json = { rows: workAccountingSessions, total: 5, page: 1, pageSize: 500 };
    else if (path === "/api/v1/emu/work-sessions/changes") json = { serverTime: workAccountingNow, changedSessions: [], deletedSessionIds: [] };
    else if (path === "/api/v1/emu/plan-tasks/changes") json = { serverTime: workAccountingNow, changedTasks: [], deletedTaskIds: [] };
    else if (path === "/api/v1/emu/shift-remarks" || path === "/api/v1/emu/plan-tasks") json = { rows: [], total: 0, page: 1, pageSize: 100 };
    else if (path.endsWith("/shift-summary")) json = { effectiveShift: null, workRows: [], totalWorkMinutes: 0, totalPauseMinutes: 0, decisions: [] };
    else if (path.includes("dashboard")) json = {};
    await route.fulfill({ json });
  });
  await page.goto("/#emu-work-accounting");
  await expect(page.locator(".emu-work-card")).toHaveCount(5);
}
test("API edit keeps the form on conflict, retries once and blocks repeated submission", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  let release!: () => void;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await apiBoard(page, async (route, path) => {
    if (path !== "/api/v1/emu/work-sessions/work-1" || route.request().method() !== "PATCH") return false;
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) { await route.fulfill({ status: 409, json: { title: "Карточка изменена другим оператором" } }); return true; }
    await responseGate;
    await route.fulfill({ json: { ...workAccountingSessions[0], ...requests[1], rowVersion: 2 } });
    return true;
  });
  await command(page, page.getByRole("article", { name: "Работа ЭМУ-2026-0001", exact: true }), "Изменить");
  const edit = page.getByRole("dialog", { name: "Изменить карточку работы", exact: true });
  await edit.getByRole("textbox", { name: "Задача", exact: true }).fill("Изменённая задача оператора");
  await edit.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(edit.getByRole("alert")).toContainText("Карточка изменена другим оператором");
  await expect(edit.getByRole("textbox", { name: "Задача", exact: true })).toHaveValue("Изменённая задача оператора");
  await edit.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(edit.getByRole("button", { name: /Сохранить/ })).toBeDisabled();
  await expect(edit.getByRole("textbox", { name: "Задача", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(edit).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ rowVersion: 1, taskDescription: "Изменённая задача оператора" });
  release();
  await expect(edit).toHaveCount(0);
});
test("API history loads the selected work with paging and retry", async ({ page }) => {
  let unavailable = true;
  const queries: string[] = [];
  await apiBoard(page, async (route, path) => {
    if (!path.endsWith("/audit")) return false;
    const pageNumber = new URL(route.request().url()).searchParams.get("page");
    queries.push(`${path}:${pageNumber}`);
    if (unavailable) { await route.fulfill({ status: 503, json: { title: "Журнал временно недоступен" } }); return true; }
    await route.fulfill({ json: { rows: [{ id: `event-${pageNumber}`, workSessionId: "work-1", planTaskId: null, eventType: pageNumber === "2" ? "paused" : "created", actor: "Оператор смены", createdAt: workAccountingNow, comment: "Осмотр оборудования\nКонтроль ограждения", fromStatus: "", toStatus: "В работе" }], total: 51, page: Number(pageNumber), pageSize: 50 } });
    return true;
  });
  await page.getByRole("button", { name: "Открыть карточку ЭМУ-2026-0001" }).click();
  const details = page.getByRole("dialog", { name: "Карточка работы", exact: true });
  await details.getByRole("tab", { name: "История", exact: true }).click();
  await expect(details.getByRole("alert")).toContainText("Журнал временно недоступен");
  unavailable = false;
  await details.getByRole("button", { name: "Повторить загрузку", exact: true }).click();
  await expect(details.getByText("Создание карточки", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Вперед", exact: true }).click();
  await expect(details.getByText("Пауза", { exact: true })).toBeVisible();
  expect(queries.length).toBeGreaterThanOrEqual(3);
  expect(queries.slice(0, -1).every(query => query === "/api/v1/emu/work-sessions/work-1/audit:1")).toBe(true);
  expect(queries.at(-1)).toBe("/api/v1/emu/work-sessions/work-1/audit:2");
});
test("read-only API role cannot mutate a work or request its private audit", async ({ page }) => {
  const auditRequests: string[] = [];
  await apiBoard(page, async (route, path) => { if (path.endsWith("/audit")) { auditRequests.push(path); await route.fulfill({ json: {} }); return true; } return false; }, ["emu.work-accounting.view"]);
  await expect(page.getByRole("button", { name: "Создать работу", exact: true })).toHaveCount(0);
  const card = page.getByRole("article", { name: "Работа ЭМУ-2026-0001", exact: true });
  await card.getByRole("button", { name: "Команды", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await page.getByRole("menuitem", { name: "Просмотр", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("tab", { name: "История", exact: true })).toHaveCount(0);
  expect(auditRequests).toEqual([]);
});

test("viewer sends only the selected participant to the existing API pause endpoint", async ({ page }) => {
  let rows = structuredClone(workAccountingSessions);
  const posted: Record<string, unknown>[] = [];
  await apiBoard(page, async (route, path) => {
    if (path === "/api/v1/emu/work-sessions/work-3/pause" && route.request().method() === "POST") {
      posted.push(route.request().postDataJSON());
      rows = rows.map(work => work.id !== "work-3" ? work : { ...work, rowVersion: 2, employees: work.employees.map(employee => employee.employeeId !== "employee-3" ? employee : { ...employee, status: "В ожидании", participationStatus: "На паузе", currentPauseReason: "Ожидание материалов" }) });
      await route.fulfill({ json: rows.find(work => work.id === "work-3") }); return true;
    }
    if (path === "/api/v1/emu/work-sessions") { await route.fulfill({ json: { rows, total: rows.length, page: 1, pageSize: 500, pageCount: 1 } }); return true; }
    return false;
  }, ["emu.work-accounting.view", "emu.work.pause"]);
  await page.getByRole("button", { name: "Открыть карточку ЭМУ-2026-0003", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Карточка работы", exact: true });
  await expect(details.getByRole("button", { name: "Добавить сотрудника", exact: true })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Завершить работу", exact: true })).toHaveCount(0);
  await details.getByRole("button", { name: "Пауза — Соколов Дмитрий Викторович", exact: true }).click();
  await page.getByRole("dialog", { name: "Поставить на паузу", exact: true }).getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(details).toBeVisible();
  await expect(details.getByRole("row").filter({ hasText: "Соколов Дмитрий Викторович" }).getByText("На паузе", { exact: true })).toBeVisible();
  await expect(details.getByRole("row").filter({ hasText: "Орлова Анна Павловна" }).getByText("На другой работе", { exact: true })).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ rowVersion: 1, employeeIds: ["employee-3"], waitReasonId: "reason-material" });
});
