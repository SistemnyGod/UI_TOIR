import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { installRemainingWindows } from './fixtures/remainingWindows.mjs';
const evidence = path.resolve('../../output/playwright/ui-unification-2026-10-16');
async function fit(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.left >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 && element.scrollWidth <= element.clientWidth + 1;
  })).toBe(true);
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (await dialog.locator('.emu-dashboard-drilldown-grid').count()) {
    expect(await dialog.locator('.emu-dashboard-drilldown-grid').evaluate(element => {
      const [a, b] = [...element.children].map(child => child.getBoundingClientRect());
      return a.width >= 120 && b.width >= 120 && (innerWidth <= 800 ? b.top >= a.bottom + 7 : b.left >= a.right + 7);
    })).toBe(true);
    expect(await dialog.locator('.emu-dashboard-drilldown-kpis article span').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
  }
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`remaining read-only windows and deactivation fit at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await installRemainingWindows(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#emu-dashboard');
  const area = page.getByRole('button', { name: /^Ремонтный участок/ }).first(); await area.click();
  let dialog = page.getByRole('dialog', { name: /^Карточка участка:/ }); await fit(page, dialog);
  await page.screenshot({ path: path.join(evidence, `emu-section-drilldown-${width}.png`), animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(area).toBeFocused();
  const employee = page.getByRole('button', { name: /Кузнецов Алексей Иванович/ }).first(); await employee.click();
  dialog = page.getByRole('dialog', { name: /^Карточка сотрудника:/ }); await fit(page, dialog);
  await page.screenshot({ path: path.join(evidence, `emu-employee-drilldown-${width}.png`), animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(employee).toBeFocused();
  await page.goto('/#employees'); const help = page.getByRole('button', { name: 'Помощь', exact: true }); await help.click();
  dialog = page.getByRole('dialog', { name: 'Как устроен мобильный доступ', exact: true }); await fit(page, dialog);
  await page.screenshot({ path: path.join(evidence, `employee-access-help-${width}.png`), animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(help).toBeFocused();
  await page.locator('.employee-roster-row').first().click();
  const deactivate = page.getByRole('button', { name: 'Деактивировать в справочнике', exact: true }); await deactivate.click();
  dialog = page.getByRole('dialog', { name: 'Деактивировать сотрудника?', exact: true }); await fit(page, dialog);
  if (width === 390) { await page.setViewportSize({ width, height: 420 }); await fit(page, dialog); }
  await page.screenshot({ path: path.join(evidence, `employee-deactivate-${width}.png`), animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(deactivate).toBeFocused(); expect(errors).toEqual([]);
});
