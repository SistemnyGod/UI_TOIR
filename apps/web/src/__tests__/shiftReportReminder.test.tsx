import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ShiftReportReminder } from '../features/emu/shift-reports/components/ShiftReportReminder';
import { REMINDER_DISMISSED_KEY, REMINDER_SENT_KEY, REMINDER_SETTINGS_KEY, validReminderTime } from '../features/emu/shift-reports/components/shiftReportReminderModel';

const enabled = { enabled: true, time: '00:00', inApp: true, desktop: false };
let storage: Storage, testDay = 0;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, ++testDay, 12));
  const values = new Map<string, string>();
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('Notification', undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Host() { const [open, setOpen] = useState(true); return <><button onClick={() => setOpen(true)}>Настроить</button><ShiftReportReminder open={open} onClose={() => setOpen(false)} /></>; }
function notification(request = vi.fn().mockResolvedValue('granted'), permission = 'default') {
  const send = vi.fn(function (_title: string, _options?: NotificationOptions) {});
  Object.assign(send, { permission, requestPermission: request }); vi.stubGlobal('Notification', send); return { send, request };
}
it('validates actual clock values and does not overwrite unreadable preferences on mount', () => {
  expect(validReminderTime('23:59')).toBe(true); expect(validReminderTime('24:00')).toBe(false); expect(validReminderTime('19:70')).toBe(false);
  const raw = JSON.stringify({ ...enabled, time: '99:99', extra: 'retain' }); storage.setItem(REMINDER_SETTINGS_KEY, raw);
  render(<Host />); expect(screen.getByRole('alert')).toHaveTextContent('Исходная запись не изменена');
  expect(storage.getItem(REMINDER_SETTINGS_KEY)).toBe(raw); expect(screen.getByRole('checkbox', { name: /Включить напоминание/ })).not.toBeChecked();
});
it('does not write defaults on mount or merely open/close settings', () => {
  const write = vi.spyOn(storage, 'setItem'); render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: 'Готово' })); fireEvent.click(screen.getByRole('button', { name: 'Настроить' })); expect(write).not.toHaveBeenCalled();
});
it('reports denied reads without replacing the stored record', () => {
  const read = vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const write = vi.spyOn(storage, 'setItem'); render(<Host />);
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось прочитать'); expect(write).not.toHaveBeenCalled(); read.mockRestore();
});
it('retains an unsaved preference after denied storage, guards close and retries', () => {
  const write = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); }); render(<Host />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Включить напоминание/ })); expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить');
  expect(screen.queryByText('Пора отправить сменный отчёт')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Готово' })); const guard = screen.getByRole('dialog', { name: 'Несохранённые изменения' });
  fireEvent.click(within(guard).getByRole('button', { name: 'Продолжить редактирование' }));
  expect(screen.getByRole('checkbox', { name: /Включить напоминание/ })).toBeChecked(); write.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' })); expect(JSON.parse(storage.getItem(REMINDER_SETTINGS_KEY)!)).toMatchObject({ enabled: true });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('can discard failed local changes without changing the committed settings', () => {
  storage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify({ ...enabled, enabled: false }));
  vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); }); render(<Host />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Включить напоминание/ })); fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть без сохранения' })); fireEvent.click(screen.getByRole('button', { name: 'Настроить' }));
  expect(screen.getByRole('checkbox', { name: /Включить напоминание/ })).not.toBeChecked();
});
it('does not reshow a dismissed banner after 30 seconds or SPA remount when storage fails', () => {
  storage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(enabled)); vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const view = render(<ShiftReportReminder open={false} onClose={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: 'Закрыть напоминание' }));
  act(() => { vi.advanceTimersByTime(90_000); }); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  view.unmount(); render(<ShiftReportReminder open={false} onClose={vi.fn()} />); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(storage.getItem(REMINDER_DISMISSED_KEY)).toBeNull();
});
it('sends the actual daily notification once, even if its storage marker fails', () => {
  const { send } = notification(undefined, 'granted'); storage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify({ ...enabled, inApp: false, desktop: true }));
  vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); }); const view = render(<ShiftReportReminder open={false} onClose={vi.fn()} />);
  act(() => { vi.advanceTimersByTime(90_000); }); view.unmount(); render(<ShiftReportReminder open={false} onClose={vi.fn()} />);
  expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0]).toBe('Пора отправить сменный отчёт'); expect(storage.getItem(REMINDER_SENT_KEY)).toBeNull();
});
it('requests permission from the checkbox, locks repeated requests and avoids a second sample notification', async () => {
  let resolve!: (permission: NotificationPermission) => void;
  const { send, request } = notification(vi.fn(() => new Promise(done => { resolve = done; }))); render(<Host />);
  const checkbox = screen.getByRole('checkbox', { name: /На устройстве/ }); fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Разрешить системные уведомления' })); expect(request).toHaveBeenCalledTimes(1); expect(checkbox).toBeDisabled();
  await act(async () => { resolve('granted'); }); expect(checkbox).toBeChecked(); expect(send).not.toHaveBeenCalled();
  expect(JSON.parse(storage.getItem(REMINDER_SETTINGS_KEY)!)).toMatchObject({ desktop: true });
});
it('ignores a late permission response after close and reopen', async () => {
  let resolve!: (permission: NotificationPermission) => void; notification(vi.fn(() => new Promise(done => { resolve = done; })));
  render(<Host />); fireEvent.click(screen.getByRole('button', { name: 'Разрешить системные уведомления' }));
  fireEvent.click(screen.getByRole('button', { name: 'Готово' })); fireEvent.click(screen.getByRole('button', { name: 'Настроить' }));
  await act(async () => { resolve('granted'); }); expect(screen.getByRole('checkbox', { name: /На устройстве/ })).not.toBeChecked(); expect(storage.getItem(REMINDER_SETTINGS_KEY)).toBeNull();
});
it('ignores permission completion after the owner form unmounts', async () => {
  let resolve!: (permission: NotificationPermission) => void; const { send } = notification(vi.fn(() => new Promise(done => { resolve = done; })));
  const view = render(<Host />); fireEvent.click(screen.getByRole('button', { name: 'Разрешить системные уведомления' })); view.unmount();
  await act(async () => { resolve('granted'); }); expect(storage.getItem(REMINDER_SETTINGS_KEY)).toBeNull(); expect(send).not.toHaveBeenCalled();
});
it('handles permission rejection and allows retry without losing the chosen time', async () => {
  const { request } = notification(vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue('granted')); render(<Host />);
  fireEvent.change(screen.getByLabelText('Время'), { target: { value: '21:45' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Разрешить системные уведомления' })); });
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось запросить'); expect(screen.getByLabelText('Время')).toHaveValue('21:45');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Разрешить системные уведомления' })); });
  expect(request).toHaveBeenCalledTimes(2); expect(screen.getByRole('checkbox', { name: /На устройстве/ })).toBeChecked();
});
