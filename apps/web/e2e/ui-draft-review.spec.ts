import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { installDraftReview, openDraftReview, openAccountReview, ownedDraftKey, legacyDraftKey, reviewEmployee, reviewRoute, legacyDraft } from './fixtures/draftReview.mjs';
test.describe.configure({ mode: 'parallel' });
const evidence = path.resolve('../../output/playwright/ui-unification-2026-10-16');
async function fit(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async element => { await Promise.all(element.parentElement!.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
  expect(await dialog.evaluate(element => { const rect = element.getBoundingClientRect(), footer = element.querySelector('footer')!.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && footer.bottom <= innerHeight + 1 && element.scrollWidth <= element.clientWidth + 1; })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function selectReferences(editor: Locator) {
  await editor.getByRole('combobox', { name: 'Сотрудник', exact: true }).selectOption(reviewEmployee.id);
  await editor.getByRole('combobox', { name: 'Маршрут', exact: true }).selectOption(reviewRoute.id);
}
for (const width of [360, 390, 768, 1280, 1366, 1920]) test(`owned drafts, explicit recovery and account confirmation fit ${width}px`, async ({ page }) => {
  test.setTimeout(60000); await mkdir(evidence, { recursive: true }); await page.setViewportSize({ width, height: 900 }); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await installDraftReview(page); const card = await openDraftReview(page);
  expect(await page.evaluate(() => (window as typeof window & { __legacyReads: number }).__legacyReads)).toBe(0);
  await card.getByRole('searchbox', { name: 'Поиск черновиков', exact: true }).fill('Мой черновик 31'); await expect(card.getByText('Мой черновик 31', { exact: true })).toBeVisible();
  await card.getByRole('searchbox', { name: 'Поиск черновиков', exact: true }).fill('');
  expect(await card.locator('.assignment-draft-open strong').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await card.locator('.assignment-draft-open span').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
  if (width < 761) expect((await card.locator('.assignment-draft-delete').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await card.evaluate(element => element.scrollIntoView({ block: 'start' })); await page.screenshot({ path: path.join(evidence, `assignment-drafts-${width}.png`), animations: 'disabled' });
  await card.getByRole('button', { name: 'Восстановить старые черновики', exact: true }).click(); const list = page.getByRole('dialog', { name: 'Старые локальные черновики', exact: true }); await fit(page, list);
  await page.screenshot({ path: path.join(evidence, `assignment-legacy-list-${width}.png`), animations: 'disabled' }); await list.getByRole('button', { name: 'Подготовить копию', exact: true }).first().click();
  const editor = page.getByRole('dialog', { name: 'Восстановить черновик', exact: true }); await fit(page, editor); await expect(editor.getByRole('combobox', { name: 'Сотрудник', exact: true })).toHaveValue(''); await expect(editor.getByRole('combobox', { name: 'Маршрут', exact: true })).toHaveValue('');
  await selectReferences(editor); await expect(editor.getByRole('textbox', { name: 'Комментарий', exact: true })).toHaveValue(legacyDraft.comment);
  await page.screenshot({ path: path.join(evidence, `assignment-legacy-editor-${width}.png`), animations: 'disabled' });
  if (width === 390) { await page.setViewportSize({ width, height: 420 }); await editor.getByRole('textbox', { name: 'Комментарий', exact: true }).focus(); await fit(page, editor); await page.screenshot({ path: path.join(evidence, 'assignment-legacy-reduced-height.png'), animations: 'disabled' }); await page.setViewportSize({ width, height: 900 }); }
  await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: 'Несохранённые изменения', exact: true }).getByRole('button', { name: 'Продолжить редактирование', exact: true }).click();
  await editor.getByRole('button', { name: 'Сохранить копию', exact: true }).click(); await expect(editor).toHaveCount(0); await expect(list).toHaveCount(0);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), ownedDraftKey); expect(stored).toHaveLength(32); expect(stored[0].comment).toBe(legacyDraft.comment); expect(stored[0].requestId).toBeUndefined(); expect(stored[0].employeeName).toBe(reviewEmployee.fullName); expect(await page.evaluate(key => localStorage.getItem(key), legacyDraftKey)).toBe(fixture.raw); expect(fixture.requests).toHaveLength(0);
  const confirm = await openAccountReview(page); await fit(page, confirm); await expect(confirm.getByRole('button', { name: 'Нет', exact: true })).toBeFocused(); await page.screenshot({ path: path.join(evidence, `account-confirm-${width}.png`), animations: 'disabled' });
  if (width === 390) { await page.setViewportSize({ width, height: 420 }); await fit(page, confirm); await page.screenshot({ path: path.join(evidence, 'account-confirm-reduced-height.png'), animations: 'disabled' }); await page.setViewportSize({ width, height: 900 }); }
  await page.keyboard.press('Escape'); const account = page.getByRole('dialog', { name: 'Редактирование мобильного аккаунта', exact: true }); await expect(account.getByPlaceholder('Введите логин')).toHaveValue('ui-review-changed'); await expect(account.getByRole('button', { name: 'Сохранить изменения', exact: true })).toBeFocused(); expect(errors).toEqual([]);
});
for (const width of [390, 1366]) test(`account confirmation blocks duplicates and preserves failed edits at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const fixture = await installDraftReview(page, { delay: true, failOnce: true }); const confirm = await openAccountReview(page);
  await confirm.getByRole('button', { name: 'Да, сохранить', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(confirm).toHaveAttribute('aria-busy', 'true'); await page.keyboard.press('Escape'); await expect(confirm).toBeVisible(); expect(fixture.requests).toHaveLength(1); fixture.release();
  await expect(confirm).toHaveCount(0); const editor = page.getByRole('dialog', { name: 'Редактирование мобильного аккаунта', exact: true }); await expect(editor.getByRole('alert')).toContainText('Проверьте'); await expect(editor.getByPlaceholder('Введите логин')).toHaveValue('ui-review-changed'); await page.screenshot({ path: path.join(evidence, `account-confirm-error-${width}.png`), animations: 'disabled' });
  await editor.getByRole('button', { name: 'Сохранить изменения', exact: true }).click(); await page.getByRole('dialog', { name: 'Подтвердить изменения?', exact: true }).getByRole('button', { name: 'Да, сохранить', exact: true }).click(); await expect(editor).toHaveCount(0); expect(fixture.requests).toHaveLength(2); await expect(page.getByRole('button', { name: 'Действия ui-review-changed', exact: true })).toBeVisible();
});
test('draft recovery keeps storage failures editable and exports the exact legacy source', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 }); const fixture = await installDraftReview(page); const card = await openDraftReview(page); await card.getByRole('button', { name: 'Восстановить старые черновики', exact: true }).click(); const list = page.getByRole('dialog', { name: 'Старые локальные черновики', exact: true });
  const download = page.waitForEvent('download'); await list.getByRole('button', { name: 'Скачать исходный файл', exact: true }).click(); const downloadedPath = await (await download).path(); expect(await readFile(downloadedPath!, 'utf8')).toBe(fixture.raw);
  await list.getByRole('button', { name: 'Подготовить копию', exact: true }).first().click(); const editor = page.getByRole('dialog', { name: 'Восстановить черновик', exact: true }); await selectReferences(editor);
  await page.evaluate(key => { const state = window as typeof window & { restoreDraftStorage?: () => void }; const original = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw new Error('test denial'); return original.call(this, name, value); }; state.restoreDraftStorage = () => { Storage.prototype.setItem = original; }; }, ownedDraftKey);
  await editor.getByRole('button', { name: 'Сохранить копию', exact: true }).click(); await expect(editor.getByRole('alert')).toContainText('Браузер не разрешил'); await expect(editor.getByRole('textbox', { name: 'Комментарий', exact: true })).toHaveValue(legacyDraft.comment); await page.screenshot({ path: path.join(evidence, 'assignment-legacy-error-390.png'), animations: 'disabled' });
  await page.evaluate(() => (window as typeof window & { restoreDraftStorage?: () => void }).restoreDraftStorage?.()); await editor.getByRole('button', { name: 'Сохранить копию', exact: true }).click(); await expect(editor).toHaveCount(0); expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).length, ownedDraftKey)).toBe(32);
  await page.reload(); await page.getByRole('tab', { name: /^Черновики/ }).click(); expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).length, ownedDraftKey)).toBe(32); expect(fixture.requests).toHaveLength(0);
});
test('operators cannot open unowned recovery and saving retains every existing owned draft', async ({ page }) => {
  const fixture = await installDraftReview(page, { admin: false }); const card = await openDraftReview(page); await expect(card.getByRole('button', { name: 'Восстановить старые черновики' })).toHaveCount(0); expect(await page.evaluate(() => (window as typeof window & { __legacyReads: number }).__legacyReads)).toBe(0);
  await page.getByRole('button', { name: 'Создать заявку', exact: true }).click(); const form = page.getByRole('dialog', { name: 'Создание заявки на обход', exact: true }); await form.getByRole('button', { name: 'Сохранить как черновик', exact: true }).click(); await expect(form).toHaveCount(0);
  const rows = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), ownedDraftKey); expect(rows).toHaveLength(32); expect(rows.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining(fixture.owned.map(row => row.id))); expect(fixture.requests).toHaveLength(0);
});

test('an unavailable route requires review and a stale-tab retry retains both drafts', async ({ page }) => {
  const fixture = await installDraftReview(page); const card = await openDraftReview(page);
  await page.evaluate(key => { const rows = JSON.parse(localStorage.getItem(key)!); rows[0].routeId = 'retired-route'; rows[0].title = 'Маршрут требует проверки'; localStorage.setItem(key, JSON.stringify(rows)); }, ownedDraftKey);
  await card.getByRole('button', { name: 'Обновить черновики', exact: true }).click(); await card.getByRole('searchbox', { name: 'Поиск черновиков', exact: true }).fill('Маршрут требует проверки'); await card.locator('.assignment-draft-open').click();
  const editor = page.getByRole('dialog', { name: 'Восстановить черновик', exact: true }); await expect(editor.getByRole('combobox', { name: 'Сотрудник', exact: true })).toHaveValue(reviewEmployee.id); await expect(editor.getByRole('combobox', { name: 'Маршрут', exact: true })).toHaveValue(''); await editor.getByRole('combobox', { name: 'Маршрут', exact: true }).selectOption(reviewRoute.id);
  await page.evaluate(key => { const rows = JSON.parse(localStorage.getItem(key)!); rows.push({ ...rows[1], id: 'another-tab-draft', title: 'Из другой вкладки' }); localStorage.setItem(key, JSON.stringify(rows)); }, ownedDraftKey);
  await editor.getByRole('button', { name: 'Сохранить копию', exact: true }).click(); await expect(editor.getByRole('alert')).toContainText('другой вкладке'); await expect(editor.getByRole('textbox', { name: 'Комментарий', exact: true })).toHaveValue(legacyDraft.comment);
  await editor.getByRole('button', { name: 'Сохранить копию', exact: true }).click(); await expect(editor).toHaveCount(0);
  const rows = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), ownedDraftKey); expect(rows).toHaveLength(33); expect(rows.some((row: { id: string }) => row.id === 'another-tab-draft')).toBe(true); expect(rows.find((row: { id: string }) => row.id === 'owned-0').routeId).toBe('retired-route'); expect(rows[0].routeId).toBe(reviewRoute.id); expect(fixture.requests).toHaveLength(0);
});

test('storage read failure keeps visible rows and changing user clears the previous list', async ({ page }) => {
  const fixture = await installDraftReview(page); const card = await openDraftReview(page); const search = card.getByRole('searchbox', { name: 'Поиск черновиков', exact: true }); await search.fill('Мой черновик 31');
  await page.evaluate(key => { const original = Storage.prototype.getItem; (window as typeof window & { restoreRead?: () => void }).restoreRead = () => { Storage.prototype.getItem = original; }; Storage.prototype.getItem = function(name) { if (name === key) throw new Error('test read denial'); return original.call(this, name); }; }, ownedDraftKey);
  await card.getByRole('button', { name: 'Обновить черновики', exact: true }).click(); await expect(card.getByRole('alert')).toContainText('не разрешил прочитать'); await expect(card.getByText('Мой черновик 31', { exact: true })).toBeVisible(); await expect(search).toHaveValue('Мой черновик 31'); await page.evaluate(() => (window as typeof window & { restoreRead?: () => void }).restoreRead?.());
  await card.getByRole('button', { name: 'Обновить черновики', exact: true }).click(); await expect(card.getByRole('alert')).toHaveCount(0);
  await page.evaluate(({ key, row }) => localStorage.setItem(key + ':api:draft-owner-b', JSON.stringify([{ ...row, id: 'owner-b-only', title: 'Личный черновик второго оператора' }])), { key: legacyDraftKey, row: fixture.owned[0] });
  await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click(); await page.getByRole('textbox', { name: 'Логин', exact: true }).fill('review-b'); await page.getByLabel('Пароль', { exact: true }).fill('test-only-password'); await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('heading', { name: 'Назначения', exact: true }).waitFor(); await page.getByRole('tab', { name: /^Черновики/ }).click(); await expect(page.getByText('Личный черновик второго оператора', { exact: true })).toBeVisible(); await expect(page.getByText('Мой черновик 31', { exact: true })).toHaveCount(0); await expect(page.getByRole('searchbox', { name: 'Поиск черновиков', exact: true })).toHaveValue('');
  expect(await page.evaluate(() => (window as typeof window & { __legacyReads: number }).__legacyReads)).toBe(0);
});

test('read-only users can review their full draft without editing or deleting it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 }); const fixture = await installDraftReview(page, { admin: false, readonly: true }); const card = await openDraftReview(page);
  await expect(card.getByRole('button', { name: /^Удалить черновик/ })).toHaveCount(0); await expect(card.getByRole('button', { name: 'Восстановить старые черновики', exact: true })).toHaveCount(0);
  await card.locator('.assignment-draft-open').first().click(); const view = page.getByRole('dialog', { name: 'Просмотр черновика', exact: true }); await fit(page, view); await expect(view.locator('.assignment-draft-comment')).toHaveText(legacyDraft.comment); await page.screenshot({ path: path.join(evidence, 'assignment-draft-readonly-390.png'), animations: 'disabled' }); await page.keyboard.press('Escape'); expect(fixture.requests).toHaveLength(0);
});
