import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { installShiftReminder, openShiftReminder } from './fixtures/shiftReminder.mjs';
const evidence = path.resolve('../../output/playwright/ui-unification-2026-10-16');
async function fit(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => {
    const box = element.getBoundingClientRect(), footer = element.querySelector('footer')!.getBoundingClientRect();
    return box.top >= 0 && box.left >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 && footer.bottom <= innerHeight + 1 && element.querySelector('.modal-shell-body')!.clientHeight >= 75;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`shift reminder is readable and saves device preferences at ${width}px`, async ({ page }) => {
  await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const fixture = await installShiftReminder(page);
  const { dialog, trigger } = await openShiftReminder(page); await fit(page, dialog);
  const checkbox = dialog.getByRole('checkbox', { name: /Включить напоминание/ });
  await dialog.getByLabel('Время', { exact: true }).fill('23:59'); await checkbox.check();
  await expect(dialog.getByRole('status')).toContainText('Настройки сохранены');
  expect(await checkbox.evaluate(element => parseFloat(getComputedStyle(element.closest('label')!).fontSize))).toBeGreaterThanOrEqual(14);
  await page.screenshot({ path: path.join(evidence, `emu-reminder-${width}.png`), animations: 'disabled' });
  if (width === 390) {
    await page.setViewportSize({ width, height: 420 }); await dialog.getByLabel('Время', { exact: true }).focus(); await fit(page, dialog);
    await page.screenshot({ path: path.join(evidence, 'emu-reminder-reduced-height.png'), animations: 'disabled' });
  }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(dialog.getByLabel('Время', { exact: true })).toHaveValue('23:59'); await expect(checkbox).toBeChecked();
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click(); await page.reload(); await trigger.click();
  await expect(dialog.getByLabel('Время', { exact: true })).toHaveValue('23:59'); await expect(checkbox).toBeChecked(); expect(fixture.requests).toEqual([]); expect(errors).toEqual([]);
});
test('failed local storage retains input, guards navigation and allows an explicit retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 }); await installShiftReminder(page); const { dialog } = await openShiftReminder(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as typeof window & { restoreReminderStorage?: () => void }).restoreReminderStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) { if (key.includes('shift-report.reminder')) throw new DOMException('test denial', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await dialog.getByLabel('Время', { exact: true }).fill('21:45'); await expect(dialog.getByRole('alert')).toContainText('Не удалось сохранить');
  await page.keyboard.press('Escape'); const guard = page.getByRole('dialog', { name: 'Несохранённые изменения', exact: true }); await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click();
  await page.evaluate(() => { location.hash = 'dashboard'; }); await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click(); await expect(page).toHaveURL(/#emu-shift-report-entry$/);
  await expect(dialog.getByLabel('Время', { exact: true })).toHaveValue('21:45'); await fit(page, dialog);
  await page.screenshot({ path: path.join(evidence, 'emu-reminder-storage-error-390.png'), animations: 'disabled' });
  await page.evaluate(() => (window as typeof window & { restoreReminderStorage?: () => void }).restoreReminderStorage?.());
  await dialog.getByRole('button', { name: 'Повторить сохранение', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Настройки сохранены');
});
test('late browser permission cannot enable reminders after the settings have been closed', async ({ page }) => {
  await installShiftReminder(page);
  await page.addInitScript(() => {
    const state = { requests: 0, deliveries: 0, permission: 'default', finish: (_value: string) => {} };
    (window as typeof window & { reminderPermissionTest: typeof state }).reminderPermissionTest = state;
    class TestNotification {
      static get permission() { return state.permission; }
      static requestPermission() { state.requests++; return new Promise<string>(done => { state.finish = value => { state.permission = value; done(value); }; }); }
      constructor() { state.deliveries++; }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: TestNotification });
  });
  const { dialog, trigger } = await openShiftReminder(page);
  await dialog.getByRole('checkbox', { name: /На устройстве/ }).click();
  await expect(dialog.getByRole('button', { name: 'Разрешить системные уведомления', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('region', { name: 'Разрешение системных уведомлений', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click(); await trigger.click();
  await page.evaluate(() => (window as typeof window & { reminderPermissionTest: { finish: (value: string) => void } }).reminderPermissionTest.finish('granted'));
  await expect(dialog.getByRole('checkbox', { name: /На устройстве/ })).not.toBeChecked();
  expect(await page.evaluate(() => { const state = (window as typeof window & { reminderPermissionTest: { requests: number; deliveries: number } }).reminderPermissionTest; return { requests: state.requests, deliveries: state.deliveries }; })).toEqual({ requests: 1, deliveries: 0 });
});
