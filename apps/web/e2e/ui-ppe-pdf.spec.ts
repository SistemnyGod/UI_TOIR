import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { installPpePdfFixture, openPpeReview } from "./fixtures/ppePdf.mjs";
// PDF integration requires the full Chromium PDF viewer; headless-shell lacks it.
test.use({ channel: "chromium" });
const evidence = path.resolve("../../output/playwright/ui-unification-2026-10-16");
async function waitForNativePdf(page: Page) {
  const url = await page.getByTitle("Печатный PDF", { exact: true }).getAttribute("src");
  await expect.poll(() => Boolean(page.frames().find(frame => frame.url().startsWith("chrome-extension:") && frame.parentFrame()?.url() === url))).toBe(true);
  const native = page.frames().find(frame => frame.url().startsWith("chrome-extension:") && frame.parentFrame()?.url() === url)!;
  await expect(native.locator("#plugin")).toBeVisible();
  await expect(native.getByRole("progressbar")).toBeHidden();
  if (page.viewportSize()!.width >= 768) await expect(native.getByRole("textbox", { name: /Номер страницы|Page number/i })).toHaveValue("1");
  await native.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`PDF preparation preserves the previous file and retries at ${width}px`, async ({ page }) => {
  await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (["error", "warning"].includes(message.type()) && !/^Failed to load resource:.*503/.test(message.text())) errors.push(message.text()); });
  const fixture = await installPpePdfFixture(page, { delay: true, failOnce: true }); await openPpeReview(page);
  await expect(page).toHaveTitle("Патруль 360"); const selected = page.getByRole("button", { name: "Подготовить выбранную форму", exact: true }), both = page.getByRole("button", { name: "Подготовить обе формы", exact: true });
  await selected.click(); await expect(selected).toBeDisabled(); await expect(both).toBeDisabled(); await expect(page.getByRole("button", { name: "Скачать Word", exact: true })).toBeDisabled(); await expect(page.getByText(/Подготавливаем PDF для просмотра/)).toBeVisible();
  expect(fixture.printRequests).toHaveLength(1); await page.screenshot({ path: path.join(evidence, `ppe-pdf-pending-${width}.png`), animations: "disabled" }); fixture.releasePrint();
  await expect(page.getByRole("alert")).toContainText("Сервис печати временно недоступен");
  expect(await page.getByRole("alert").evaluate(el => { const sample = document.createElement("span"); sample.style.color = "var(--ui-danger)"; el.append(sample); const correct = getComputedStyle(sample).color === getComputedStyle(el).color; sample.remove(); return correct; })).toBe(true);
  await expect(selected).toBeEnabled(); await page.screenshot({ path: path.join(evidence, `ppe-pdf-error-${width}.png`), animations: "disabled" });
  await selected.click(); const prepared = page.getByRole("region", { name: "Подготовленный PDF", exact: true }); await expect(prepared).toBeVisible(); await expect(prepared.getByRole("button", { name: "Печать подготовленного PDF", exact: true })).toBeEnabled(); await waitForNativePdf(page);
  await prepared.locator(".ppe-prepared-pdf-head").scrollIntoViewIfNeeded(); expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1); expect(await prepared.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: path.join(evidence, `ppe-pdf-ready-${width}.png`), animations: "disabled" }); const oldUrl = await prepared.locator("iframe").getAttribute("src");
  const directDownload = page.waitForEvent("download"); await prepared.getByRole("link", { name: "Скачать подготовленный PDF", exact: true }).click(); expect((await directDownload).suggestedFilename()).toBe("ppe-ui.pdf"); expect(fixture.printRequests).toHaveLength(2);
  fixture.failNextPrint(); await both.click(); await expect(page.getByRole("alert")).toContainText("Сервис печати временно недоступен"); await expect(prepared.locator("iframe")).toHaveAttribute("src", oldUrl!); await expect(prepared.getByRole("link", { name: "Скачать подготовленный PDF", exact: true })).toBeVisible();
  await both.click(); await expect(prepared.getByText("Обе печатные формы", { exact: true })).toBeVisible(); await expect(prepared.locator("iframe")).not.toHaveAttribute("src", oldUrl!);
  const word = page.waitForEvent("download"); await page.getByRole("button", { name: "Скачать Word", exact: true }).click(); expect((await word).suggestedFilename()).toBe("ppe-ui.docx"); expect(fixture.printRequests).toHaveLength(5);
  expect(fixture.requests.filter((request: { endpoint: string }) => /\/confirm$/.test(request.endpoint))).toEqual([]); expect(errors).toEqual([]);
});
test("confirmed PPE document keeps its employee snapshot and exports without another confirmation", async ({ page }) => {
  const fixture = await installPpePdfFixture(page, { documentStatus: "confirmed" });
  await page.route("**/api/v1/inventory/employees/*", route => route.fulfill({ json: { id: "00000000-0000-0000-0000-000000000201", fullName: "Изменённое имя из справочника", personnelNo: "OTHER", status: "active", position: "Новая должность", department: "Другое подразделение" } }));
  await page.goto("/#inventory-ppe-create"); await expect(page.getByRole("heading", { name: "Предпросмотр и печать", exact: true })).toBeVisible();
  await expect(page.locator(".ppe-document-head")).toContainText("Иванов Иван Иванович"); await expect(page.getByRole("button", { name: "Подтвердить выдачу", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Сохранить черновик", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Подготовить обе формы", exact: true }).click(); await expect(page.getByRole("region", { name: "Подготовленный PDF", exact: true })).toContainText("Обе печатные формы"); expect(fixture.requests.filter((request: { method: string; endpoint: string }) => request.method !== "GET" && /\/issue-documents\//.test(request.endpoint))).toEqual([]);
});
