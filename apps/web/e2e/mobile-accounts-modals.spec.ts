import { expect, test } from "@playwright/test";

test("mobile account action buttons open modal dialogs and backdrop closes them", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" }));
    localStorage.setItem("patrol360.mobileAccounts.v2", JSON.stringify({ version: 2, value: [{ id: "modal-test-account", login: "modal-test", passwordState: "Установлен", employee: "Не привязан", employeeScope: "selected", boundEmployeeIds: [], boundEmployees: [], role: "Маршрутный обходчик", status: "Активен", session: "-", lastSeen: "", device: "", version: "" }] }));
  });
  await page.goto("/#accounts");

  await page.getByRole("button", { name: "Создать аккаунт" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Создание мобильного аккаунта" });
  await expect(createDialog).toBeVisible();
  expect(await createDialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await page.mouse.click(300, 10);
  await expect(createDialog).toBeHidden();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

  await page.getByRole("button", { name: /^Действия / }).first().click();
  await page.getByRole("button", { name: "Управлять привязками" }).click();
  const linkDialog = page.getByRole("dialog", { name: "Привязка сотрудника к мобильному аккаунту" });
  await expect(linkDialog).toBeVisible();
  expect(await linkDialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  await linkDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(linkDialog).toBeHidden();

  await page.getByRole("button", { name: /^Действия / }).first().click();
  await page.getByRole("button", { name: "Удалить аккаунт", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Удаление мобильного аккаунта" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog).toContainText("Удалить аккаунт");
  await expect(deleteDialog.getByRole("button", { name: "Удалить" })).toBeVisible();

  await deleteDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(deleteDialog).toBeHidden();

  await page.getByRole("button", { name: /^Открыть аккаунт / }).first().click();
  const viewDialog = page.getByRole("dialog", { name: /^Аккаунт / });
  await expect(viewDialog).toBeVisible();
  await expect(viewDialog.getByRole("tablist", { name: "Разделы аккаунта" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewDialog).toBeHidden();
});
