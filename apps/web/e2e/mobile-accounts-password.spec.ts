import { expect, test } from "@playwright/test";

test("mobile account password operations use one-time panel without password toast", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
    localStorage.removeItem("patrol360.mobileAccounts.v2");
  });
  await page.goto("/#accounts");

  await page.getByRole("button", { name: "Создать аккаунт" }).first().click();
  const createForm = page.getByRole("dialog", { name: "Создание мобильного аккаунта" });
  const login = `local-smoke-${Date.now()}`;
  const chosenPassword = "SmokePass123!";
  await createForm.getByPlaceholder(/Введите логин/).fill(login);
  await createForm.getByPlaceholder("Введите пароль").fill(chosenPassword);
  await createForm.getByPlaceholder("Повторите пароль").fill(chosenPassword);
  await createForm.getByRole("combobox").first().selectOption({ label: "Оператор" });
  await createForm.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(createForm).toBeHidden();

  const panel = page.locator(".secure-password-panel");
  await expect(page.locator(".toast")).toContainText("Мобильный аккаунт");
  await expect(panel).toBeHidden();
  await expect(page.locator(".toast")).not.toContainText(chosenPassword);

  await page.getByRole("button", { name: "Изменить пароль" }).click();
  const passwordForm = page.getByRole("dialog", { name: "Изменение пароля мобильного аккаунта" });
  await passwordForm.getByRole("button", { name: "Сбросить пароль" }).click();
  await expect(passwordForm).toBeHidden();

  await expect(panel).toBeVisible();
  await expect(panel.getByText("Временный пароль после локального сброса")).toBeVisible();

  const resetPassword = await panel.locator("code").innerText();
  expect(resetPassword).toMatch(/^[A-Za-z0-9]{10}$/);

  await expect(page.locator(".toast")).toContainText("Пароль обновлен");
  await expect(page.locator(".toast")).not.toContainText(resetPassword);

  await panel.getByRole("button", { name: "Скрыть" }).click();
  await expect(panel).toBeHidden();
});
