import { expect, test } from '@playwright/test';
import path from 'node:path';
import { installEmuHistoryReview, openHistoryEmployee, historyPeople } from './fixtures/emuHistoryReview.mjs';
const evidence = path.resolve('../../output/playwright/ui-unification-2026-10-16');
test('closing a pending employee report keeps late responses out of the next employee', async ({ page }) => {
  const fixture = await installEmuHistoryReview(page, { delayFirst: true });
  const { dialog } = await openHistoryEmployee(page); await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
  await page.locator('.emu-history-card-row button').nth(1).click();
  const current = page.getByRole('dialog', { name: `Отчет по сотруднику: ${historyPeople[1].employeeName}`, exact: true }); await expect(current).toBeVisible();
  fixture.release(); await expect.poll(() => fixture.requests.length).toBe(2);
  await page.waitForTimeout(150); await expect(current).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1);
});
test('employee report failure stays in the modal and can be retried without changing employee', async ({ page }) => {
  const fixture = await installEmuHistoryReview(page, { failFirst: true }); const { dialog } = await openHistoryEmployee(page);
  await expect(dialog.getByRole('alert')).toContainText('Отчёт временно недоступен');
  await dialog.getByRole('button', { name: 'Повторить загрузку', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(fixture.requests).toEqual(['employee-1', 'employee-1']);
});
test('month failure is explicit and does not display fabricated zero totals', async ({ page }) => {
  await installEmuHistoryReview(page);
  await page.route('**/api/v1/emu/employees/*/month-summary**', route => route.fulfill({ status: 503, json: { title: 'Сводка временно недоступна' } }));
  const { dialog } = await openHistoryEmployee(page); await expect(dialog.getByRole('alert')).toContainText('Месячная сводка недоступна');
  await expect(dialog.locator('.emu-history-modal-kpis article').filter({ hasText: 'Простой за месяц' }).locator('strong')).toHaveText('—');
});
test('an older history build cannot replace the latest applied result', async ({ page }) => {
  await installEmuHistoryReview(page); let armed = false, count = 0, completed = 0, release!: () => void;
  const first = new Promise<void>(done => { release = done; });
  await page.route(url => url.pathname === '/api/v1/emu/reports/work-history', async route => {
    const index = armed ? ++count : 0; if (index === 1) await first;
    await route.fulfill({ json: { generatedAt: '2026-10-13T13:30:00+05:00', appliedQuery: {}, employees: [], sections: [], exceptions: [], totals: { totalWorks: index === 1 ? 77 : 5, completedWorks: 5, problemWorks: 0, workMinutes: 300, waitingMinutes: 0, otherWorkMinutes: 0, totalMinutes: 300, averageWorkMinutes: 60 } } });
    if (index === 1) completed++;
  });
  await page.goto('/#emu-completed-work-history');
  const total = page.locator('.emu-history-kpi').filter({ hasText: 'Всего работ' }).locator('strong'); await expect(total).toHaveText('5');
  armed = true; await page.getByRole('button', { name: 'Применить', exact: true }).click(); await expect.poll(() => count).toBe(1);
  await page.getByRole('button', { name: 'Применить', exact: true }).click(); await expect.poll(() => count).toBe(2);
  release(); await expect.poll(() => completed).toBe(1); await expect(total).toHaveText('5');
});
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`employee history remains readable on each tab at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await installEmuHistoryReview(page); const { dialog, trigger } = await openHistoryEmployee(page);
  for (const tab of ['Сводка', 'По участкам', 'История работ', 'Месяц']) {
    await dialog.getByRole('button', { name: tab, exact: true }).click();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Сводка', exact: true }).click();
  await page.screenshot({ path: path.join(evidence, `emu-employee-history-${width}.png`), animations: 'disabled' });
  if (width === 390) { await page.setViewportSize({ width, height: 420 }); expect((await dialog.locator('footer').boundingBox())!.y).toBeGreaterThanOrEqual(0); await page.screenshot({ path: path.join(evidence, 'emu-employee-history-reduced-height.png'), animations: 'disabled' }); }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); expect(errors).toEqual([]);
});
