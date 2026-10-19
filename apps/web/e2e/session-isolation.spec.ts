import { expect, test } from '@playwright/test';
const account = { id: '00000000-0000-0000-0000-000000000001', login: 'audit-mobile', passwordState: 'Установлен', employee: 'Не привязан', employeeScope: 'selected', boundEmployeeIds: [], boundEmployees: [], role: 'Маршрутный обходчик', status: 'Активен', session: '-', lastSeen: '', device: '', version: '' };
const actorA = { id: 'actor-a', login: 'audit-a', displayName: 'Audit A', roles: ['admin'], permissions: ['mobile_accounts.write'] };
const actorB = { id: 'actor-b', login: 'audit-b', displayName: 'Audit B', roles: ['auditor'], permissions: ['results.read', 'dashboard.read'] };

test('F02 full App: one-time password is removed when a different user logs in', async ({ page }) => {
  let created = false;
  await page.addInitScript(() => { localStorage.setItem('patrol360.dataSourceMode', JSON.stringify({ version: 1, value: 'api' })); localStorage.setItem('patrol360.sessionToken', 'audit-token-a'); });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname; const method = route.request().method();
    let body: unknown = [];
    if (path === '/api/v1/auth/me') body = actorA;
    else if (path === '/api/v1/auth/login') body = { user: actorB, accessToken: 'audit-token-b', expiresAt: '2027-01-01T00:00:00Z' };
    else if (path === '/api/v1/auth/logout') { await route.fulfill({ status: 204 }); return; }
    else if (path === '/api/v1/mobile-accounts' && method === 'POST') { created = true; body = { account, temporaryPassword: 'AUDIT-OLD-SECRET' }; }
    else if (path === '/api/v1/mobile-accounts') body = created ? [account] : [];
    else if (path.includes('dashboard')) body = {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/#accounts');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: 'Создание мобильного аккаунта' });
  await form.getByRole('textbox', { name: 'Логин', exact: true }).fill('audit-mobile');
  await form.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.locator('.secure-password-panel code')).toHaveText('AUDIT-OLD-SECRET');
  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await expect(page.locator('.secure-password-panel')).toBeHidden();
  await page.getByRole('textbox', { name: 'Логин', exact: true }).fill('audit-b');
  await page.getByLabel('Пароль', { exact: true }).fill('audit-pass');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Audit B', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.secure-password-panel')).toBeHidden();
  await expect(page.getByText('AUDIT-OLD-SECRET', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: '../../TestResults/stability-fixes-20261011/password-owner-isolation.png' });
});

