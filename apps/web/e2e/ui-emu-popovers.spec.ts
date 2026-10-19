import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { installEmuDialogFixture } from './fixtures/emuDialogs.mjs';

const evidence = path.resolve('../../output/playwright/ui-unification-2026-10-16');
async function fit(page: Page, surface: Locator, body: string, footer: string) {
  await expect(surface).toBeVisible();
  await expect.poll(() => surface.evaluate((element, selectors) => {
    const bounds = element.getBoundingClientRect(), actions = element.querySelector(selectors.footer)!.getBoundingClientRect();
    const content = element.querySelector(selectors.body)!.getBoundingClientRect();
    return bounds.left >= 7 && bounds.top >= 7 && bounds.right <= innerWidth - 7 && bounds.bottom <= innerHeight - 7 && actions.bottom <= innerHeight - 7 && content.height >= 50;
  }, { body, footer })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function openPassword(page: Page, login = 'ui-password-test-only') {
  await page.goto('/#accounts');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: 'Создание мобильного аккаунта', exact: true });
  await form.getByPlaceholder(/Введите логин/).fill(login);
  await form.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  const panel = page.locator('.secure-password-panel'); await expect(panel).toBeVisible(); return panel;
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`EMU calendars and one-time password fit and retain keyboard context at ${width}px`, async ({ page }) => {
  test.setTimeout(60000); await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await installEmuDialogFixture(page);
  for (const [hash, selector, title, name] of [
    ['emu-completed-work-history', '.emu-history-period-trigger', 'Выбор периода', 'emu-history-calendar'],
    ['emu-shift-report-history', '.emu-date-range-trigger', 'Выбор периода отчётов', 'emu-report-calendar'],
  ]) {
    await page.goto('/#' + hash); const trigger = page.locator(selector); await trigger.click();
    const calendar = page.getByRole('dialog', { name: title, exact: true }); await fit(page, calendar, '.date-range-surface-body', 'footer');
    expect(await calendar.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: path.join(evidence, `${name}-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await expect(calendar.getByRole('button', { name: 'Выбрать один день', exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(calendar).toHaveCount(0); await expect(trigger).toBeFocused(); await expect(trigger).toContainText('13.10.2026');
    await trigger.click(); await calendar.getByRole('button', { name: /14\.10\.2026/ }).first().click();
    if (width === 390) {
      await page.setViewportSize({ width, height: 420 }); await fit(page, calendar, '.date-range-surface-body', 'footer');
      await page.screenshot({ path: path.join(evidence, `${name}-reduced-height.png`), animations: 'disabled' }); await page.setViewportSize({ width, height: 900 });
    }
    await calendar.getByRole('button', { name: /16\.10\.2026/ }).first().click();
    if (title === 'Выбор периода') await calendar.getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(calendar).toHaveCount(0); await expect(trigger).toBeFocused(); await expect(trigger).toContainText('14.10.2026 — 16.10.2026');
    if (title === 'Выбор периода') {
      const action = page.getByRole('button', { name: 'Подробный вид', exact: true });
      expect(await action.evaluate(element => { const a = element.getBoundingClientRect(), b = element.querySelector('.ui-button-label')!.getBoundingClientRect(); return b.left >= a.left && b.right <= a.right + 1; })).toBe(true);
    }
  }
  const panel = await openPassword(page, 'test-only-long-account-login-for-interface-' + width);
  await fit(page, panel, '.secure-password-content', 'footer'); await expect(panel.getByRole('button', { name: 'Скопировать', exact: true })).toBeFocused();
  await expect(panel).toHaveAttribute('role', 'region'); await page.screenshot({ path: path.join(evidence, `temporary-password-${width}.png`), animations: 'disabled' });
  if (width === 390) {
    await page.setViewportSize({ width, height: 420 }); await fit(page, panel, '.secure-password-content', 'footer');
    await page.screenshot({ path: path.join(evidence, 'temporary-password-reduced-height.png'), animations: 'disabled' });
  }
  const secret = await panel.locator('code').innerText(); await expect(page.locator('.toast')).not.toContainText(secret);
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement !== document.body && !document.activeElement?.closest('[inert]'))).toBe(true);
  expect(errors).toEqual([]);
});

test('password clipboard rejection and late response keep the panel recoverable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 }); await installEmuDialogFixture(page);
  const panel = await openPassword(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('test rejection'); } } }));
  await panel.getByRole('button', { name: 'Скопировать', exact: true }).click(); await expect(panel.getByRole('status')).toContainText('вручную');
  await fit(page, panel, '.secure-password-content', 'footer'); await page.screenshot({ path: path.join(evidence, 'temporary-password-copy-error-390.png'), animations: 'disabled' });
  await page.evaluate(() => {
    const testState = window as typeof window & { copyCount: number; releaseCopy?: () => void }; testState.copyCount = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => { testState.copyCount++; return new Promise<void>(resolve => { testState.releaseCopy = resolve; }); } } });
  });
  await panel.getByRole('button', { name: 'Скопировать', exact: true }).evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(panel.getByRole('button', { name: 'Скопировать', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as typeof window & { copyCount: number }).copyCount)).toBe(1);
  expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { releaseCopy?: () => void }).releaseCopy?.());
  await expect(page.locator('.toast')).not.toContainText('Временный пароль скопирован');
});

test('calendar keyboard navigation reveals the focused date and leaves outside controls available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 }); await installEmuDialogFixture(page);
  await page.goto('/#emu-completed-work-history'); const trigger = page.locator('.emu-history-period-trigger'); await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Выбор периода', exact: true });
  await page.keyboard.press('PageDown'); await page.keyboard.press('End');
  const focused = calendar.locator('[data-date]:focus'); await expect(focused).toHaveCount(1);
  expect(await focused.evaluate(element => { const a = element.getBoundingClientRect(), b = element.closest('.date-range-surface-body')!.getBoundingClientRect(); return a.top >= b.top && a.bottom <= b.bottom; })).toBe(true);
  await calendar.getByRole('button', { name: 'Применить', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(calendar).toHaveCount(0);
  await page.setViewportSize({ width: 1366, height: 900 });
  await trigger.click(); await page.getByRole('button', { name: 'Обновить', exact: true }).click(); await expect(calendar).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Обновить', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1366, height: 900 }); await page.goto('/#emu-shift-report-history');
  await page.locator('.emu-date-range-trigger').click();
  const reports = page.getByRole('dialog', { name: 'Выбор периода отчётов', exact: true });
  await reports.getByRole('button', { name: '05.11.2026', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 420 });
  const selected = reports.getByRole('button', { name: '05.11.2026, начало периода', exact: true });
  await expect(selected).toBeVisible(); await expect(selected).toBeFocused();
  await fit(page, reports, '.date-range-surface-body', 'footer');
  await reports.getByRole('button', { name: 'Выбрать один день', exact: true }).click();
  await expect(page.locator('.emu-date-range-trigger')).toContainText('05.11.2026');
});
