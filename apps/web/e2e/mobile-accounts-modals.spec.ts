import { expect, test } from "@playwright/test";

test("mobile account action buttons open modal dialogs and backdrop closes them", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", "mock");
    localStorage.removeItem("patrol360.mobileAccounts.v2");
  });
  await page.goto("/#accounts");

  await page.getByRole("button", { name: "Создать аккаунт" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Создание мобильного аккаунта" });
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByPlaceholder("Введите логин")).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await page.mouse.click(20, 20);
  await expect(createDialog).toBeHidden();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

  await page.getByRole("button", { name: "Привязать сотрудника" }).click();
  const linkDialog = page.getByRole("dialog", { name: "Привязка сотрудника к мобильному аккаунту" });
  await expect(linkDialog).toBeVisible();
  await expect(linkDialog.getByRole("combobox")).toBeFocused();

  await linkDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(linkDialog).toBeHidden();

  await page.getByRole("button", { name: "Удалить" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Удаление мобильного аккаунта" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText(/Удалить мобильный аккаунт|Аккаунт не выбран/)).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "Удалить аккаунт" })).toBeVisible();

  await deleteDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(deleteDialog).toBeHidden();

  await page.getByRole("button", { name: "Просмотр" }).click();
  const viewDialog = page.getByRole("dialog", { name: "Просмотр мобильного аккаунта" });
  await expect(viewDialog).toBeVisible();
  await expect(viewDialog.getByText("Просмотр аккаунта")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewDialog).toBeHidden();
});
