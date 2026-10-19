import { expect, test } from '@playwright/test';
import path from 'node:path';
const evidence = path.resolve('../../output/playwright/ui-unification-2026-10-16');
for (const offsetTop of [0, 100]) test(`a reduced phone visual viewport keeps the focused field and save action visible at offset ${offsetTop}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('patrol360.dataSourceMode', JSON.stringify({ version: 1, value: 'mock' })));
  await page.route('**/api/v1/**', route => route.abort()); await page.goto('/#employees');
  await page.evaluate(() => {
    const viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  });
  await page.getByRole('button', { name: 'Создать сотрудника', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Создать сотрудника', exact: true });
  const field = dialog.getByPlaceholder('Атом или Атом Экология'); await field.fill('Контрольная группа');
  await page.evaluate(offset => {
    Object.assign(window.visualViewport!, { height: 340, offsetTop: offset }); window.visualViewport!.dispatchEvent(new Event('resize'));
  }, offsetTop);
  await expect.poll(() => dialog.evaluate((element, offset) => {
    const box = element.getBoundingClientRect(), footer = element.querySelector('footer')!.getBoundingClientRect();
    const input = element.querySelector('input[list="employee-group-options"]')!.getBoundingClientRect(), body = element.querySelector('.modal-shell-body')!.getBoundingClientRect();
    return box.top >= offset - 1 && box.bottom <= offset + 341 && footer.bottom <= offset + 341 && input.top >= body.top - 1 && input.bottom <= body.bottom + 1;
  }, offsetTop)).toBe(true);
  await expect(field).toBeFocused(); await expect(field).toHaveValue('Контрольная группа');
  await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, `employee-visual-viewport-offset-${offsetTop}.png`), animations: 'disabled' });
});
