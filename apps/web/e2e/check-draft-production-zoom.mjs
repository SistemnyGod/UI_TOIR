import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installDraftReview, openDraftReview, openAccountReview, reviewEmployee, reviewRoute } from './fixtures/draftReview.mjs';

const output = path.resolve('../../output/playwright/ui-unification-2026-10-16');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-draft-zoom-'));
const extension = path.join(profile, 'extension');
await fs.mkdir(extension);
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Local production UI zoom check', version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
await fs.writeFile(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
let context;
try {
  context = await chromium.launchPersistentContext(path.join(profile, 'browser'), { channel: 'chromium', headless: true, viewport: null, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--window-size=1366,900'] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage(), errors = [], windows = [];
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixture = await installDraftReview(page), origin = 'http://127.0.0.1:5194';
  const card = await openDraftReview(page, origin), cdp = await context.newCDPSession(page);
  const before = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
  await worker.evaluate(async () => { const tabs = await chrome.tabs.query({}); const tab = tabs.find(tab => tab.url?.startsWith('http://127.0.0.1:5194/')); await chrome.tabs.setZoom(tab.id, 2); });
  await page.waitForFunction(before => innerWidth < before.width * .6 && devicePixelRatio >= before.dpr * 1.9, before);
  const capture = async name => { const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name + '-production-zoom-200.png'), Buffer.from(shot.data, 'base64')); };
  const list = await card.evaluate(element => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, titleSize: parseFloat(getComputedStyle(element.querySelector('.assignment-draft-open strong')).fontSize), textSize: parseFloat(getComputedStyle(element.querySelector('.assignment-draft-open span')).fontSize), deleteHeight: element.querySelector('.assignment-draft-delete').getBoundingClientRect().height }));
  if (list.documentWidth > list.width + 1 || list.titleSize < 14 || list.textSize < 13 || list.deleteHeight < 44) throw new Error('Production list is not readable: ' + JSON.stringify(list));
  await card.evaluate(element => element.scrollIntoView({ block: 'start' })); await capture('assignment-drafts');
  async function inspect(title, name) {
    const dialog = page.getByRole('dialog', { name: title, exact: true }); await dialog.waitFor();
    await dialog.evaluate(async element => { await Promise.all(element.parentElement.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    const size = await dialog.evaluate(element => { const rect = element.getBoundingClientRect(), footer = element.querySelector('footer').getBoundingClientRect(); return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, footer: footer.bottom, body: element.querySelector('.modal-shell-body').getBoundingClientRect().height }; });
    if (size.documentWidth > size.width + 1 || size.top < 0 || size.left < 0 || size.right > size.width + 1 || size.bottom > size.height + 1 || size.footer > size.height + 1 || size.body < 140) throw new Error('Production dialog obscured: ' + name + ' ' + JSON.stringify(size));
    windows.push({ name, ...size }); await capture(name); return dialog;
  }
  await card.getByRole('button', { name: 'Восстановить старые черновики', exact: true }).click(); await inspect('Старые локальные черновики', 'assignment-legacy-list');
  await page.getByRole('button', { name: 'Подготовить копию', exact: true }).first().click(); const editor = page.getByRole('dialog', { name: 'Восстановить черновик', exact: true });
  await editor.getByRole('combobox', { name: 'Сотрудник', exact: true }).selectOption(reviewEmployee.id); await editor.getByRole('combobox', { name: 'Маршрут', exact: true }).selectOption(reviewRoute.id); await inspect('Восстановить черновик', 'assignment-recovery');
  await editor.getByRole('button', { name: 'Сохранить копию', exact: true }).click(); await editor.waitFor({ state: 'hidden' }); await openAccountReview(page, origin); await inspect('Подтвердить изменения?', 'account-confirmation');
  if (errors.length || fixture.requests.length) throw new Error('Unexpected production UI errors/writes: ' + JSON.stringify({ errors, requests: fixture.requests }));
  const result = { before, after: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), list, windows, errors, method: 'chrome.tabs.setZoom(2), production build, intercepted local API' };
  await fs.writeFile(path.join(output, 'draft-production-zoom-200.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await context?.close(); }
