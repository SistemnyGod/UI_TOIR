import { expect, test } from "@playwright/test";

test("PPE journal exposes disabled issuance and keeps personal cards accessible", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("patrol360.dataSourceMode", JSON.stringify({ version: 1, value: "mock" })));
  await page.route("**/api/**", route => route.abort());
  await page.goto("/#inventory-ppe");
  await expect(page.getByRole("heading", { name: "Выдача СИЗ", exact: true })).toBeVisible();
  await expect(page.getByText("Новые выдачи выключены до завершения проверки норм.")).toBeVisible();
  await page.getByRole("button", { name: "Оформить выдачу" }).click();
  await expect(page.getByRole("heading", { name: "Новые выдачи СИЗ выключены" })).toBeVisible();
  await expect(page.locator(".ppe-document-lines")).toHaveCount(0);
  await page.getByRole("button", { name: "Открыть журнал", exact: true }).click();
  await page.getByRole("button", { name: "Нормы и личные карточки" }).click();
  await expect(page.getByRole("heading", { name: "Иванов Иван Иванович" })).toBeVisible();
  await page.getByRole("tab", { name: /Печать/ }).click();
  await expect(page.locator(".ppe-v2-print-grid")).toBeVisible();
});
