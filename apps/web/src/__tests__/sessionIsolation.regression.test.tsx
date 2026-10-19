// Regression scenarios reproduced in the October 11 stability audit.
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ users: vi.fn(), accounts: vi.fn(), reset: vi.fn() }));
vi.mock('../repositories/siteUsersRepository', async (original) => ({
  ...await original<object>(), createApiSiteUsersRepository: () => ({ getUsers: mocks.users, getEmuSections: async () => [], getRoles: async () => [] }),
}));
vi.mock('../repositories/mobileAccountsRepository', async (original) => ({
  ...await original<object>(), createApiMobileAccountsRepository: () => ({ getAccounts: mocks.accounts, getSessions: async () => [], getSecurityEvents: async () => [], resetPassword: mocks.reset }),
}));
import { useSiteUsersWorkspace } from '../hooks/useSiteUsersWorkspace';
import { useMobileAccountsWorkspace } from '../hooks/useMobileAccountsWorkspace';
import { SiteUserAccessPanel } from '../features/users/components/SiteUserAccessPanel';
const noop = () => {};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const user = (id: string) => ({ id, login: id, fullName: id, role: 'Аудитор' as const, roleCode: 'auditor', status: 'Активен' as const, access: [], recentSessions: [], lastLogin: '', createdAt: '' });
const account = { id: 'a', login: 'a', status: 'Активен', boundEmployeeIds: [], boundEmployees: [], session: '-', device: '', version: '' };
beforeEach(() => { mocks.users.mockReset(); mocks.accounts.mockReset(); mocks.reset.mockReset(); vi.stubGlobal('localStorage', { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, length: 0, key: () => null }); });
afterEach(cleanup);

it('F01: a late users refresh cannot overwrite a newer completed refresh', async () => {
  const old = deferred<ReturnType<typeof user>[]>();
  mocks.users.mockReturnValueOnce(old.promise).mockResolvedValueOnce([user('new')]);
  const hook = renderHook(() => useSiteUsersWorkspace({ dataSourceMode: 'api', showToast: noop, showTemporaryPassword: noop }));
  await act(async () => { await hook.result.current.refreshUsers(); });
  expect(hook.result.current.users[0].id).toBe('new');
  await act(async () => { old.resolve([user('old')]); });
  expect(hook.result.current.users[0].id).toBe('new');
});

it('F02: mobile account data from the previous API session is cleared during the next session load', async () => {
  mocks.accounts.mockResolvedValueOnce([account]).mockReturnValueOnce(new Promise(() => {}));
  const hook = renderHook(({ sessionKey }) => useMobileAccountsWorkspace({ dataSourceMode: 'api', sessionKey, showToast: noop, showTemporaryPassword: noop }), { initialProps: { sessionKey: 'session-a' } });
  await waitFor(() => expect(hook.result.current.accounts[0]?.id).toBe('a'));
  hook.rerender({ sessionKey: 'session-b' });
  
  expect(hook.result.current.accountListStatus).toBe('loading');
  expect(hook.result.current.accounts).toEqual([]);
});

it('F02: a password response from an old session is discarded after the session transition', async () => {
  mocks.accounts.mockResolvedValue([account]);
  const pending = deferred<{ account: typeof account; temporaryPassword: string }>(); mocks.reset.mockReturnValue(pending.promise);
  const showPassword = vi.fn();
  const hook = renderHook(({ sessionKey }) => useMobileAccountsWorkspace({ dataSourceMode: 'api', sessionKey, showToast: noop, showTemporaryPassword: showPassword }), { initialProps: { sessionKey: 'session-a' } });
  await waitFor(() => expect(hook.result.current.selectedAccountId).toBe('a'));
  let operation!: Promise<unknown>;
  act(() => { operation = hook.result.current.resetSelectedPassword(); });
  hook.rerender({ sessionKey: 'session-b' }); 
  await act(async () => { pending.resolve({ account, temporaryPassword: 'OLD-SESSION-SECRET' }); await operation; });
  expect(showPassword).not.toHaveBeenCalled();
});

it('F03: an old user audit response cannot appear under the newly selected user', async () => {
  const first = deferred<any>();
  const firstSessions = deferred<any>();
  const loadAudit = vi.fn((id: string) => id === 'first' ? first.promise : Promise.resolve({ items: [{ id: 'new', createdAt: '2026-10-11T12:00:00Z', details: 'NEW USER AUDIT', eventType: 'updated' }] }));
  const loadSessions = vi.fn((id: string) => id === 'first' ? firstSessions.promise : Promise.resolve({ items: [], activeCount: 2 }));
  const props = { loadAccess: async () => null, loadAudit, loadSessions, onNotify: noop, onSavePermissions: noop, onSaveScopes: noop };
  const view = render(<SiteUserAccessPanel {...props} user={user('first')} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Аудит' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Аудит' }));
  await waitFor(() => expect(loadAudit).toHaveBeenCalledWith('first'));
  view.rerender(<SiteUserAccessPanel {...props} user={user('second')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Аудит' }));
  await screen.findByText('NEW USER AUDIT');
  await act(async () => first.resolve({ items: [{ id: 'old', createdAt: '2026-10-11T12:00:00Z', details: 'OLD USER AUDIT', eventType: 'updated' }] }));
  await act(async () => firstSessions.resolve({ items: [], activeCount: 99 }));
  expect(screen.getByRole('heading', { name: 'second' })).toBeInTheDocument();
  expect(screen.queryByText('OLD USER AUDIT')).not.toBeInTheDocument();
  expect(screen.getByText('NEW USER AUDIT')).toBeInTheDocument();
  expect(screen.queryByText('99')).not.toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
});

it('F04: refreshing the same user preserves unsaved section selection', async () => {
  const loadAccess = async () => ({ roles: ['auditor'], permissionOverrides: [], scopes: [], scopeMode: 'selected' }) as any;
  const dirty = vi.fn();
  const props = { loadAccess, emuSections: [{ id: 'section-a', name: 'Участок А', isActive: true, sortOrder: 0 }], onDirtyChange: dirty, onNotify: noop, onSavePermissions: noop, onSaveScopes: noop };
  const view = render(<SiteUserAccessPanel {...props} user={user('same')} />);
  await waitFor(() => expect(view.container.querySelector('fieldset')).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Участки ЭМУ' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Участок А' }));
  expect(screen.getByRole('checkbox', { name: 'Участок А' })).toBeChecked();
  view.rerender(<SiteUserAccessPanel {...props} user={{ ...user('same'), lastLogin: 'new time' }} />);
  expect(screen.getByRole('checkbox', { name: 'Участок А' })).toBeChecked();
  expect(dirty).toHaveBeenLastCalledWith(true);
});

it('F04: refreshing the same user object preserves unsaved permission edits', async () => {
  const catalog = { modules: [{ key: 'patrol', name: 'Обход', permissions: [{ code: 'results.read', name: 'Просмотр результатов', category: 'Просмотр', isViewDefault: true }] }], roles: [{ code: 'auditor', name: 'Аудитор', permissions: [] }] } as any;
  const loadAccess = async () => ({ roles: ['auditor'], permissionOverrides: [], scopes: [], scopeMode: 'selected' }) as any;
  const dirty = vi.fn(); const props = { catalog, loadAccess, onDirtyChange: dirty, onNotify: noop, onSavePermissions: noop, onSaveScopes: noop };
  const view = render(<SiteUserAccessPanel {...props} user={user('same')} />);
  fireEvent.click(view.container.querySelector('.permission-module header button')!);
  const checkbox = await screen.findByRole('checkbox', { name: /Просмотр результатов/ });
  await waitFor(() => expect(checkbox).toBeEnabled());
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true));
  view.rerender(<SiteUserAccessPanel {...props} user={{ ...user('same'), lastLogin: 'new time' }} />);
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /Просмотр результатов/ })).toBeChecked());
  expect(dirty).toHaveBeenLastCalledWith(true);
});
