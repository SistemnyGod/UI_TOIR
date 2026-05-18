import { expect, test } from "@playwright/test";

test("mobile account password operations use one-time panel without password toast", async ({ page }) => {
  await page.goto("/#accounts");

  await page.getByRole("button", { name: "Создать аккаунт" }).first().click();
  const createForm = page.locator(".account-panel-card").filter({ hasText: "Создание аккаунта" });
  await createForm.getByRole("button", { name: "Создать" }).click();
  await expect(createForm).toBeHidden();

  const panel = page.locator(".secure-password-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Временный пароль для локального аккаунта")).toBeVisible();

  const createdPassword = await panel.locator("code").innerText();
  expect(createdPassword).toMatch(/^[A-Za-z0-9]{10}$/);

  await expect(page.locator(".toast")).toContainText("Мобильный аккаунт");
  await expect(page.locator(".toast")).not.toContainText(createdPassword);

  await panel.getByRole("button", { name: "Скрыть" }).click();
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "Изменить пароль" }).click();
  const passwordForm = page.locator(".account-panel-card").filter({ hasText: "Изменение пароля" });
  await passwordForm.getByRole("button", { name: "Выдать временный пароль" }).click();
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
