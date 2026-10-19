import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateRangePicker } from '../shared/ui/DateRangePicker';
import { TemporaryPasswordPanel } from '../features/mobileAccounts/components/TemporaryPasswordPanel';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const props = { dateFrom: '2026-10-13', dateTo: '2026-10-13' };
const day = (value: string) => document.querySelector<HTMLButtonElement>(`[data-date="${value}"]:not(:disabled)`)!;

describe('calendar ownership and keyboard', () => {
  it('cancels draft changes and restores the opener on Escape', async () => {
    const user = userEvent.setup(), change = vi.fn();
    render(<DateRangePicker {...props} onChange={change} />);
    const trigger = screen.getByRole('button', { name: /^Период:/ }); await user.click(trigger);
    expect(day('2026-10-13')).toHaveFocus(); await user.click(day('2026-10-20'));
    await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus(); expect(change).not.toHaveBeenCalled();
    await user.click(trigger); expect(day('2026-10-13')).toHaveAttribute('aria-pressed', 'true');
  });
  it('keeps a draft during a parent refresh and applies a reversed range only explicitly', async () => {
    const user = userEvent.setup(), change = vi.fn();
    const view = render(<DateRangePicker {...props} allowClear onChange={change} />);
    await user.click(screen.getByRole('button', { name: /^Период:/ }));
    await user.click(day('2026-10-20'));
    view.rerender(<DateRangePicker dateFrom='2026-09-01' dateTo='2026-09-30' allowClear onChange={change} />);
    expect(day('2026-10-20')).toHaveAttribute('aria-pressed', 'true');
    await user.click(day('2026-10-15')); expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('2026-10-15', '2026-10-20');
  });
  it('keeps the report auto-apply contract and supports a single day', async () => {
    const user = userEvent.setup(), change = vi.fn();
    render(<DateRangePicker {...props} autoApply monthCount={2} onChange={change} />);
    await user.click(screen.getByRole('button', { name: /^Период:/ }));
    await user.click(day('2026-10-20')); expect(change).not.toHaveBeenCalled();
    await user.click(day('2026-10-21')); expect(change).toHaveBeenLastCalledWith('2026-10-20', '2026-10-21');
    await user.click(screen.getByRole('button', { name: /^Период:/ })); await user.click(day('2026-10-22'));
    await user.click(screen.getByRole('button', { name: 'Выбрать один день' }));
    expect(change).toHaveBeenLastCalledWith('2026-10-22', '2026-10-22');
  });
  it('moves across month and year boundaries without overflowing February', async () => {
    const user = userEvent.setup(); render(<DateRangePicker dateFrom='2026-01-31' dateTo='2026-01-31' onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^Период:/ })); await user.keyboard('{PageDown}');
    expect(day('2026-02-28')).toHaveFocus(); await user.keyboard('{ArrowRight}'); expect(day('2026-03-01')).toHaveFocus();
    await user.keyboard('{Home}'); expect(day('2026-02-23')).toHaveFocus(); await user.keyboard('{End}'); expect(day('2026-03-01')).toHaveFocus();
  });
  it('allows outside actions and never steals their focus', async () => {
    const user = userEvent.setup(); render(<><DateRangePicker {...props} onChange={vi.fn()} /><button>Следующее поле</button></>);
    await user.click(screen.getByRole('button', { name: /^Период:/ })); await user.click(screen.getByRole('button', { name: 'Следующее поле' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Следующее поле' })).toHaveFocus();
  });
  it('leaves the nonmodal calendar with Tab at its last control', async () => {
    const user = userEvent.setup(); render(<><DateRangePicker {...props} onChange={vi.fn()} /><button>Следующее поле</button></>);
    await user.click(screen.getByRole('button', { name: /^Период:/ })); screen.getByRole('button', { name: 'Применить' }).focus();
    await user.tab(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Следующее поле' })).toHaveFocus();
  });
  it('clears an explicitly clearable range', async () => {
    const user = userEvent.setup(), change = vi.fn(); render(<DateRangePicker {...props} allowClear onChange={change} />);
    await user.click(screen.getByRole('button', { name: /^Период:/ })); await user.click(screen.getByRole('button', { name: 'Очистить' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('', '');
  });
});

describe('one-time password panel', () => {
  const panelProps = { accountLogin: 'test-only', password: 'DEMO-ONLY', title: 'Временный пароль', onDismiss: vi.fn() };
  function clipboard(writeText: ReturnType<typeof vi.fn>) { Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }); }
  it('blocks duplicate copies and keeps secrets out of notifications', async () => {
    let resolve!: () => void; const write = vi.fn(() => new Promise<void>(done => { resolve = done; })); clipboard(write);
    const notify = vi.fn(); render(<TemporaryPasswordPanel {...panelProps} onNotify={notify} />);
    const copy = screen.getByRole('button', { name: 'Скопировать' }); fireEvent.click(copy); fireEvent.click(copy);
    expect(write).toHaveBeenCalledTimes(1); expect(copy).toBeDisabled();
    await act(async () => resolve()); expect(notify).toHaveBeenCalledExactlyOnceWith('Временный пароль скопирован');
    expect(notify.mock.calls.flat().join()).not.toContain(panelProps.password);
  });
  it('keeps the password available for manual copying after clipboard failure', async () => {
    clipboard(vi.fn().mockRejectedValue(new Error('denied'))); render(<TemporaryPasswordPanel {...panelProps} onNotify={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('вручную'));
    expect(screen.getByText(panelProps.password)).toBeVisible(); expect(screen.getByRole('button', { name: 'Скопировать' })).toBeEnabled();
  });
  it('ignores a completed clipboard response after unmount', async () => {
    let resolve!: () => void; clipboard(vi.fn(() => new Promise<void>(done => { resolve = done; })));
    const notify = vi.fn(); const view = render(<TemporaryPasswordPanel {...panelProps} onNotify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать' })); view.unmount(); await act(async () => resolve()); expect(notify).not.toHaveBeenCalled();
  });
  it('isolates copy responses even after A to B to A', async () => {
    let resolve!: () => void; clipboard(vi.fn(() => new Promise<void>(done => { resolve = done; })));
    const notify = vi.fn(); const view = render(<TemporaryPasswordPanel {...panelProps} onNotify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать' }));
    view.rerender(<TemporaryPasswordPanel {...panelProps} accountLogin='B' onNotify={notify} />);
    view.rerender(<TemporaryPasswordPanel {...panelProps} onNotify={notify} />);
    await act(async () => resolve()); expect(notify).not.toHaveBeenCalled(); expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
