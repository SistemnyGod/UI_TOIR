import { expect, it, vi } from 'vitest';
import { createFocusedLoad } from '@/sync/focusedLoad';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; };
it('coalesces a burst and publishes only the fresh pass', async () => {
  const slow = deferred<string>();
  const publish = vi.fn(); const read = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue('fresh');
  const loader = createFocusedLoad({ capture: async () => 'a', assert: async () => {}, read, publish, onError: vi.fn(), onSettled: vi.fn() });
  const pending = loader.run(); await Promise.resolve();
  for (let i = 0; i < 100; i++) void loader.run();
  slow.resolve('old'); await pending;
  expect(read).toHaveBeenCalledTimes(2); expect(publish).toHaveBeenCalledExactlyOnceWith('fresh');
});
it('rejects a snapshot after owner or contour changes', async () => {
  const slow = deferred<string>(); let scope = 'a:test:1'; const publish = vi.fn(); const error = vi.fn();
  const loader = createFocusedLoad({ capture: async () => scope, assert: async previous => { if (scope !== previous) throw new Error('stale'); },
    read: () => slow.promise, publish, onError: error, onSettled: vi.fn() });
  const pending = loader.run(); await Promise.resolve(); scope = 'b:other:2'; slow.resolve('private'); await pending;
  expect(publish).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledOnce();
});
it('an old focus session cannot publish or settle a new session', async () => {
  const slow = deferred<string>(); const publish = vi.fn(); const settled = vi.fn();
  const options = { capture: async () => 'a', assert: async () => {}, read: () => slow.promise, publish, onError: vi.fn(), onSettled: settled };
  const previous = createFocusedLoad(options); const pending = previous.run(); await Promise.resolve(); previous.stop();
  const current = createFocusedLoad({ ...options, read: async () => 'new' }); await current.run();
  slow.resolve('old'); await pending;
  expect(publish).toHaveBeenCalledExactlyOnceWith('new'); expect(settled).toHaveBeenCalledOnce();
});
