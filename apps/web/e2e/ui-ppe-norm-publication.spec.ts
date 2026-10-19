import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { installPpeNormAdminFixture, openPpeNormAdmin } from "./fixtures/ppeNormAdmin.mjs";
const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
for (const width of [390, 1366]) test(`accepted norm publication survives refresh failure at ${width}px`, async ({ page }) => {
  await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const fixture = await installPpeNormAdminFixture(page, { publicationReady: true, delayMutation: true, failRefreshAfterWrite: true }); await openPpeNormAdmin(page);
  const row = page.locator("article.inventory-ppe-norm-set").first(); await row.getByRole("checkbox", { name: "Проверил нормативный состав и периодичность", exact: true }).check();
  await row.getByRole("button", { name: "Опубликовать", exact: true }).click(); await expect(row).toHaveAttribute("aria-busy", "true");
  await expect(row.getByRole("button", { name: "Публикация...", exact: true })).toBeDisabled(); await expect(row.getByRole("checkbox")).toBeDisabled();
  await expect(row.getByRole("button", { name: "Проверить область применения", exact: true })).toHaveCount(0); fixture.releaseMutation();
  const message = page.locator(".inventory-ppe-norm-message"); await expect(message).toContainText("Набор опубликован");
  await expect(row.locator(".inventory-ppe-norm-status")).toHaveText("Действует"); await expect(row.locator(".inventory-ppe-norm-set-meta")).toContainText("Версия 8");
  await expect(row.getByRole("button", { name: "Опубликовать", exact: true })).toHaveCount(0); await expect(row.getByRole("alert")).toContainText("Обновление данных не повторяет запись");
  await expect(page.locator(".toast")).toHaveCount(0); await message.scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); await page.screenshot({ path: path.join(evidence, `ppe-norm-publication-refresh-error-${width}.png`), animations: "disabled" });
  await row.getByRole("button", { name: "Обновить набор", exact: true }).click(); await expect(row.getByRole("alert")).toHaveCount(0); await expect(message).toHaveCount(0);
  expect(fixture.requests.filter(request => request.endpoint.endsWith("/publish"))).toHaveLength(1); expect(fixture.requests[0].body).toMatchObject({ confirmReviewed: true, expectedVersion: 7 }); expect(errors).toEqual([]);
});
test("a lost publication response is checked by reading the set instead of repeating POST", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const fixture = await installPpeNormAdminFixture(page, { publicationReady: true, losePublicationResponseOnce: true }); await openPpeNormAdmin(page);
  const row = page.locator("article.inventory-ppe-norm-set").first(); await row.getByRole("checkbox", { name: "Проверил нормативный состав и периодичность", exact: true }).check(); await row.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(page.locator(".inventory-ppe-norm-message")).toContainText("Публикация не подтверждена"); await expect(row.getByRole("button", { name: "Опубликовать", exact: true })).toBeDisabled(); await expect(row.getByRole("checkbox")).not.toBeChecked();
  await row.getByRole("button", { name: "Обновить набор", exact: true }).click(); await expect(row.locator(".inventory-ppe-norm-status")).toHaveText("Действует"); await expect(row.getByRole("alert")).toHaveCount(0); await expect(page.locator(".inventory-ppe-norm-message")).toHaveCount(0);
  expect(fixture.requests.filter(request => request.endpoint.endsWith("/publish"))).toHaveLength(1); expect(errors).toEqual([]);
});
