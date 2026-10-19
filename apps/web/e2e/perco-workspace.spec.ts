import { expect, test, type Page, type Route } from "@playwright/test";
import { percoDiagnostics, percoLogs, percoSettings, percoUnmatched } from "./fixtures/perco";

test.use({ timezoneId: "Asia/Yekaterinburg" });
async function setup(page: Page, override?: (route: Route, name: string) => Promise<boolean>) {
  await page.clock.setFixedTime(new Date("2026-10-13T10:24:00+05:00"));
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.route("**/api/v1/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    if (override && await override(route, name)) return;
    const data: Record<string, unknown> = { settings: percoSettings, diagnostics: percoDiagnostics, logs: percoLogs, "unmatched-employees": percoUnmatched };
    await route.fulfill({ status: route.request().method() === "GET" && data[name] ? 200 : 501, json: data[name] ?? {} });
  });
  await page.goto("/#perco-integration");
  await expect(page.getByRole("heading", { name: "Кто сейчас на территории", exact: true })).toBeVisible();
}

for (const width of [1440, 390]) {
  test(`PERCo overview, tabs, analytics and dialogs work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await setup(page);
    await expect(page).toHaveTitle(/Патруль 360/);
    await expect(page.getByRole("heading", { name: "PERCo-Web", exact: true })).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.locator(".perco-analytics-disclosure > summary").click();
    await expect(page.getByRole("heading", { name: "Входы и выходы по часам" })).toBeVisible();
    await page.getByRole("button", { name: "Все проходы и смены", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Проходы и смены", exact: true })).toHaveAttribute("aria-selected", "true");
    const intervals = page.locator("section").filter({ has: page.getByRole("heading", { name: "Открытые и спорные интервалы", exact: true }) }).last();
    await expect(intervals.getByText("Соколов Алексей Михайлович", { exact: true })).toHaveCount(1);
    await intervals.getByRole("button", { name: "Закрыть вручную", exact: true }).first().click();
    const modal = page.getByRole("dialog", { name: "Закрыть присутствие вручную", exact: true });
    await expect(modal).toBeVisible();
    const rect = (await modal.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width + 1);
    await expect(modal.getByRole("button", { name: "Закрыть интервал", exact: true })).toBeDisabled();
    await modal.getByLabel("Причина", { exact: true }).fill("Проверено оператором");
    await expect(modal.getByRole("button", { name: "Закрыть интервал", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page.getByRole("button", { name: "Настройки подключения", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Подключение", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Адрес сервера PERCo", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("refresh keeps settings input and manual matching choice; zero tolerances save as zero", async ({ page }) => {
  let saved: Record<string, unknown> | undefined;
  await setup(page, async (route, name) => {
    if (name !== "settings" || route.request().method() !== "PUT") return false;
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { ...percoSettings, ...saved } }); return true;
  });
  await page.getByRole("button", { name: "Настройки подключения", exact: true }).click();
  await page.getByLabel("Адрес сервера PERCo", { exact: true }).fill("http://changed.example.test");
  await page.getByRole("button", { name: "Обновить данные", exact: true }).click();
  await expect(page.getByRole("button", { name: "Обновить данные", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Адрес сервера PERCo", { exact: true })).toHaveValue("http://changed.example.test");
  await page.locator(".perco-connection-advanced > summary").click();
  await page.getByLabel("Допуск начала смены, мин", { exact: true }).fill("0");
  await page.getByLabel("Допуск конца смены, мин", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
  await expect(page.getByText(/Есть несохранённые изменения/)).toHaveCount(0);
  expect(saved).toMatchObject({ baseUrl: "http://changed.example.test", shiftStartToleranceMinutes: 0, shiftEndToleranceMinutes: 0 });
  expect(saved).not.toHaveProperty("password"); expect(saved).not.toHaveProperty("token");
  await page.getByRole("tab", { name: "Сопоставление", exact: true }).click();
  const candidate = page.getByRole("combobox", { name: "Сотрудник проекта для Иванов Иван Иванович" });
  await candidate.selectOption("");
  await page.getByRole("button", { name: "Обновить данные", exact: true }).click();
  await expect(page.getByRole("button", { name: "Обновить данные", exact: true })).toBeEnabled();
  await expect(candidate).toHaveValue("");
  await page.getByRole("button", { name: "Игнорировать", exact: true }).first().click();
  const modal = page.getByRole("dialog", { name: "Игнорировать сотрудника PERCO?", exact: true });
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0);
});

test("diagnostic refresh preserves page, search and scroll instead of returning to the first page", async ({ page }) => {
  const diagnostics = { ...percoDiagnostics, recentEvents: [], presenceIntervals: Array.from({ length: 35 }, (_, i) => ({ ...percoDiagnostics.presenceIntervals[0], id: `interval-${i}`, employeeId: `employee-${i}`, employeeName: `Сотрудник ${String(i).padStart(2, "0")}` })) };
  await setup(page, async (route, name) => {
    if (name !== "diagnostics") return false;
    await route.fulfill({ json: diagnostics }); return true;
  });
  await page.getByRole("tab", { name: "Проходы и смены", exact: true }).click();
  const active = page.locator("section").filter({ has: page.getByRole("heading", { name: "Сейчас на заводе", exact: true }) }).last();
  await active.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(active.getByText("Страница 2 из 4", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0,0));
  const before = await active.boundingBox();
  await page.getByRole("button", { name: "Обновить данные", exact: true }).click();
  await expect(page.getByRole("button", { name: "Обновить данные", exact: true })).toBeEnabled();
  await expect(active.getByText("Страница 2 из 4", { exact: true })).toBeVisible();
  expect(Math.abs((await active.boundingBox())!.y - before!.y)).toBeLessThanOrEqual(1);
  await page.getByRole("searchbox", { name: "Поиск сотрудника", exact: true }).fill("Сотрудник 23");
  await expect(active.getByText("Страница 1 из 1", { exact: true })).toBeVisible();
  await expect(active.getByText("Сотрудник 23", { exact: true })).toBeVisible();
});

test("failed refresh retains the overview and explains that data could not be updated", async ({ page }) => {
  let fail = false;
  await setup(page, async (route, name) => {
    if (name !== "diagnostics" || !fail) return false;
    await route.fulfill({ status: 503, json: { title: "Test outage" } }); return true;
  });
  fail = true;
  await page.getByRole("button", { name: "Обновить данные", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Часть данных");
  await expect(page.getByRole("heading", { name: "Кто сейчас на территории", exact: true })).toBeVisible();
  await expect(page.locator(".perco-dashboard-employee-list article")).toHaveCount(3);
});

for (const failure of ["business", "transport"]) {
  test(`closing rejection (${failure}) keeps the dialog input and shows the error in the dialog`, async ({ page }) => {
    let attempts = 0;
    await setup(page, async (route, name) => {
      if (name !== "close" || route.request().method() !== "PATCH") return false;
      attempts++;
      await route.fulfill({ status: failure === "business" ? 200 : 503, json: { success: false, status: "validation_error", message: "Интервал уже закрыт", loaded: 0, created: 0, updated: 0, inserted: 0, duplicates: 0, unmatched: 0, errors: 1, lastSyncAt: null } });
      return true;
    });
    await page.getByRole("button", { name: "Закрыть вручную", exact: true }).first().click();
    const modal = page.getByRole("dialog", { name: "Закрыть присутствие вручную", exact: true });
    await modal.getByLabel("Причина", { exact: true }).fill("Проверено оператором, выход не зарегистрирован");
    await modal.getByRole("button", { name: "Закрыть интервал", exact: true }).click();
    await expect(modal.getByRole("alert")).toContainText(failure === "business" ? "Интервал уже закрыт" : "временно недоступен");
    await expect(modal.getByRole("textbox", { name: "Причина", exact: true })).toHaveValue("Проверено оператором, выход не зарегистрирован");
    await expect(modal.getByRole("button", { name: "Закрыть интервал", exact: true })).toBeEnabled();
    expect(attempts).toBe(1);
  });
}
