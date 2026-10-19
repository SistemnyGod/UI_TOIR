import { afterEach, expect, it, vi } from 'vitest';
import { createPointDraftController } from '@/services/pointDraftController';
afterEach(() => vi.useRealTimers());
it('closes and navigates synchronously with the last successful revision', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const writes: string[] = [];
  const form = createPointDraftController<string>(async value => {
    writes.push(value);
    if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
  }, vi.fn());
  const navigate = vi.fn(() => { form.update('late callback'); });
  form.update('first');
  const leaving = form.flushUntilSettled(navigate);
  await Promise.resolve(); await Promise.resolve();
  form.update('last typed');
  release(); await leaving; await vi.runAllTimersAsync();
  expect(writes).toEqual(['first', 'last typed']);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(form.dirty).toBe(false);
});
it('keeps editable data and destination retry available after a failed leave', async () => {
  vi.useFakeTimers();
  const write = vi.fn().mockRejectedValueOnce(new Error('SQLite')).mockResolvedValue(undefined);
  const navigate = vi.fn();
  const form = createPointDraftController<string>(write, vi.fn());
  form.update('before error');
  await expect(form.flushUntilSettled(navigate)).rejects.toThrow('SQLite');
  expect(navigate).not.toHaveBeenCalled();
  form.update('after error');
  await form.flushUntilSettled(navigate);
  await vi.runAllTimersAsync();
  expect(write.mock.calls).toEqual([['before error'], ['after error']]);
  expect(navigate).toHaveBeenCalledTimes(1);
});
it('flushes the last characters before the timer fires', async () => {
  vi.useFakeTimers(); const write = vi.fn().mockResolvedValue(undefined);
  const form = createPointDraftController(write, vi.fn());
  form.update('a'); form.update('abc'); await form.flush();
  await vi.runAllTimersAsync();
  expect(write.mock.calls).toEqual([['abc']]);
});
it('retains dirty data after SQLite failure and retries', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
  const form = createPointDraftController(write, vi.fn());
  form.update('text'); await expect(form.flush()).rejects.toThrow('disk');
  expect(form.dirty).toBe(true); await form.flush(); expect(form.dirty).toBe(false);
});
it('waits for an in-flight write and prevents callbacks after finalization', async () => {
  vi.useFakeTimers(); let release!: () => void;
  const write = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const form = createPointDraftController(write, vi.fn());
  form.update('old'); const pending = form.flush(); await Promise.resolve(); await Promise.resolve();
  form.update('latest'); const paused = form.pause(); release(); await pending; await paused;
  form.close(); await vi.runAllTimersAsync(); await form.flush();
  expect(write).toHaveBeenCalledTimes(1);
});
it('keeps input enabled and drains a newer revision before navigation', async () => {
  let release!: () => void;
  const writes: string[] = [];
  const write = vi.fn((value: string) => {
    writes.push(value);
    if (writes.length === 1) return new Promise<void>(resolve => { release = resolve; });
    return Promise.resolve();
  });
  const form = createPointDraftController(write, vi.fn(), 10000);
  form.update('old');
  const leaving = form.flushUntilSettled();
  await Promise.resolve();
  await Promise.resolve();
  form.update('latest');
  release();
  await Promise.resolve();
  await Promise.resolve();
  await leaving;
  expect(writes).toEqual(['old', 'latest']);
  expect(form.dirty).toBe(false);
});

it('preserves the first destination across double taps and SQLite retry', async () => {
  vi.useFakeTimers();
  const write = vi.fn().mockRejectedValueOnce(new Error('SQLite')).mockResolvedValue(undefined);
  const first = vi.fn(); const second = vi.fn();
  const form = createPointDraftController<string>(write, vi.fn());
  form.update('first');
  const pending = form.requestLeave(first);
  expect(form.requestLeave(second)).toBe(pending);
  await expect(pending).rejects.toThrow('SQLite');
  form.update('latest');
  await form.requestLeave(second);
  expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
  expect(write).toHaveBeenLastCalledWith('latest');
});
it('allows discard after an autosave error without reviving the failed draft', async () => {
  vi.useFakeTimers();
  const write = vi.fn().mockRejectedValue(new Error('SQLite'));
  const form = createPointDraftController(write, vi.fn());
  form.update('failed');
  await expect(form.flush()).rejects.toThrow('SQLite');
  await form.pause(); form.close();
  form.update('late'); await vi.runAllTimersAsync();
  expect(write).toHaveBeenCalledTimes(1);
});
