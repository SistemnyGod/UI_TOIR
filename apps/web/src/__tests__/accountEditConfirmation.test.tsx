import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MobileAccountEditPanel } from '../features/mobileAccounts/components/MobileAccountEditPanel';
import type { MobileAccount } from '../types';
const account: MobileAccount = { id: 'a', login: 'test.login', passwordState: 'Установлен', employee: '', employeeScope: 'selected', boundEmployeeIds: [], boundEmployees: [], role: 'Оператор', status: 'Активен', session: 'Офлайн', device: '', version: '', lastSeen: '' };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function open() { const user = userEvent.setup(); await user.clear(screen.getByRole('textbox', { name: /Логин/ })); await user.type(screen.getByRole('textbox', { name: /Логин/ }), 'changed.login'); await user.click(screen.getByRole('button', { name: 'Сохранить изменения' })); return user; }
it('focuses confirmation and returns to the editor without dropping input', async () => {
  const close = vi.fn(); render(<MobileAccountEditPanel selected={account} onClose={close} onNotify={vi.fn()} onUpdateAccount={vi.fn()} />);
  const user = await open(); const confirm = screen.getByRole('dialog', { name: 'Подтвердить изменения?' }); expect(within(confirm).getByRole('button', { name: 'Нет' })).toHaveFocus();
  await user.keyboard('{Escape}'); expect(close).not.toHaveBeenCalled(); expect(screen.getByRole('textbox', { name: /Логин/ })).toHaveValue('changed.login'); expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toHaveFocus();
});
it('blocks duplicate saves and dismissal while pending; failure retains input', async () => {
  let reject!: (reason: Error) => void; const save = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  render(<MobileAccountEditPanel selected={account} onNotify={vi.fn()} onUpdateAccount={save} />); const user = await open(); const confirm = screen.getByRole('dialog', { name: 'Подтвердить изменения?' });
  const accept = within(confirm).getByRole('button', { name: 'Да, сохранить' }); fireEvent.click(accept); fireEvent.click(accept); expect(save).toHaveBeenCalledTimes(1);
  await user.keyboard('{Escape}'); expect(confirm).toBeInTheDocument(); expect(within(confirm).getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  await act(async () => reject(new Error('Проверьте данные'))); expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте данные'); expect(screen.getByRole('textbox', { name: /Логин/ })).toHaveValue('changed.login');
});
it('ignores a response for an earlier target and unlocks the new target', async () => {
  let resolve!: () => void; const save = vi.fn(() => new Promise<void>(done => { resolve = done; })), close = vi.fn(); const props = { onNotify: vi.fn(), onUpdateAccount: save, onClose: close };
  const view = render(<MobileAccountEditPanel {...props} selected={account} />); await open(); fireEvent.click(screen.getByRole('button', { name: 'Да, сохранить' }));
  view.rerender(<MobileAccountEditPanel {...props} selected={{ ...account, id: 'b', login: 'target.b' }} />); await act(async () => resolve());
  expect(close).not.toHaveBeenCalled(); expect(screen.getByRole('textbox', { name: /Логин/ })).toHaveValue('target.b');
  fireEvent.change(screen.getByRole('textbox', { name: /Логин/ }), { target: { value: 'edited.b' } }); expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeEnabled();
});
