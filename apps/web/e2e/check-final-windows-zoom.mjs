import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installShiftReminder, openShiftReminder } from './fixtures/shiftReminder.mjs';
import { installEmuHistoryReview, openHistoryEmployee } from './fixtures/emuHistoryReview.mjs';
import { installEmuDialogFixture } from './fixtures/emuDialogs.mjs';
import { installRemainingWindows } from './fixtures/remainingWindows.mjs';
const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5194';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'patrol-ui-final-'));
const extension = path.join(temp, 'extension'), output = path.resolve('../../output/playwright/ui-unification-2026-10-16');
await fs.mkdir(extension); await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Local UI zoom verification', version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
await fs.writeFile(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
let context;
const windows = [], errors = [];
try {
  context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { channel: 'chromium', headless: true, viewport: null, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--window-size=1366,900'] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  async function inspect(page, dialog, name) {
    await worker.evaluate(async url => { const tabs = await chrome.tabs.query({}); const tab = tabs.find(tab => tab.url === url); await chrome.tabs.setZoom(tab.id, 1); }, page.url());
    await page.waitForFunction(() => innerWidth > 1000 && devicePixelRatio < 1.1);
    const before = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
    await worker.evaluate(async url => { const tabs = await chrome.tabs.query({}); const tab = tabs.find(tab => tab.url === url); await chrome.tabs.setZoom(tab.id, 2); }, page.url());
    await page.waitForFunction(before => innerWidth < before.width * .6 && devicePixelRatio >= before.dpr * 1.9, before);
    await dialog.evaluate(async element => { await Promise.all(element.parentElement.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    const dimensions = await dialog.evaluate(element => { const rect = element.getBoundingClientRect(), footer = element.querySelector('.modal-shell-actions')?.getBoundingClientRect(); return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, documentWidth: document.documentElement.scrollWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, bodyHeight: element.querySelector('.modal-shell-body').getBoundingClientRect().height, footer: footer?.bottom, focused: element.contains(document.activeElement) }; });
    if (dimensions.documentWidth > dimensions.width + 1 || dimensions.scrollWidth > dimensions.clientWidth + 1 || dimensions.top < 0 || dimensions.bottom > dimensions.height + 1 || dimensions.right > dimensions.width + 1 || dimensions.left < 0 || dimensions.footer > dimensions.height + 1 || dimensions.bodyHeight < 75 || !dimensions.focused) throw new Error(name + ': ' + JSON.stringify(dimensions));
    if (await dialog.locator('.emu-dashboard-drilldown-grid').count()) {
      dimensions.internalColumnsFit = await dialog.locator('.emu-dashboard-drilldown-grid').evaluate(element => { const [a, b] = [...element.children].map(child => child.getBoundingClientRect()); return a.width >= 120 && b.width >= 120 && b.top >= a.bottom + 7; });
      if (!dimensions.internalColumnsFit) throw new Error('Overlapping drilldown columns at real zoom: ' + name);
    }
    const cdp = await context.newCDPSession(page), shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await fs.writeFile(path.join(output, name + '-real-zoom-200.png'), Buffer.from(shot.data, 'base64')); await cdp.detach(); windows.push({ name, before, ...dimensions });
  }
  async function pageWith(install) { const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' }); await install(page); return page; }
  let page = await pageWith(installShiftReminder); let { dialog } = await openShiftReminder(page, origin); await inspect(page, dialog, 'emu-reminder'); await page.close();
  page = await pageWith(installEmuHistoryReview); ({ dialog } = await openHistoryEmployee(page, 0, origin)); await inspect(page, dialog, 'emu-employee-history'); await page.close();
  page = await pageWith(installEmuDialogFixture); await page.goto(origin + '/#employees'); await page.getByRole('button', { name: 'Помощь', exact: true }).click(); await inspect(page, page.getByRole('dialog', { name: 'Как устроен мобильный доступ', exact: true }), 'employee-access-help'); await page.close();
  page = await pageWith(installRemainingWindows); await page.goto(origin + '/#employees'); await page.locator('.employee-roster-row').first().click(); await page.getByRole('button', { name: 'Деактивировать в справочнике', exact: true }).click(); await inspect(page, page.getByRole('dialog', { name: 'Деактивировать сотрудника?', exact: true }), 'employee-deactivate'); await page.close();
  for (const employee of [false, true]) {
    page = await pageWith(installEmuDialogFixture); await page.goto(origin + '/#emu-dashboard');
    await page.getByRole('button', { name: employee ? /Кузнецов Алексей Иванович/ : /^Ремонтный участок/ }).first().click();
    await inspect(page, page.getByRole('dialog', { name: employee ? /^Карточка сотрудника:/ : /^Карточка участка:/ }), employee ? 'emu-employee-drilldown' : 'emu-section-drilldown'); await page.close();
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  await fs.writeFile(path.join(output, 'final-windows-real-zoom-200.json'), JSON.stringify({ method: 'chrome.tabs.setZoom(2), Chromium, local intercepted API/mock fixtures', windows, errors }, null, 2));
  console.log(JSON.stringify({ windows: windows.length, errors, widths: windows.map(item => item.width) }));
} finally {
  await context?.close();
  if (path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('patrol-ui-final-')) await fs.rm(temp, { recursive: true, force: true });
}
