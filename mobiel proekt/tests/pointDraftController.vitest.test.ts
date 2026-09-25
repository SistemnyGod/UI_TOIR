import { afterEach, expect, it, vi } from 'vitest';
import { createPointDraftController } from '@/services/pointDraftController';
afterEach(() => vi.useRealTimers());
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
