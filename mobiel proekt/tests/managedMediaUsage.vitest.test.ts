import { expect, it, vi } from 'vitest';
import { createMediaUsageTracker } from '@/services/managedMediaUsage';
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; };
it('shares a scan, applies file deltas and periodically reconciles the directory', async () => {
  let now = 0;
  const scan = vi.fn(async () => new Map([['dir/a', 100]])); const tracker = createMediaUsageTracker(scan, () => now);
  expect(await Promise.all(Array.from({ length: 50 }, () => tracker.get('dir')))).toEqual(Array(50).fill(100));
  expect(scan).toHaveBeenCalledOnce();
  tracker.changed('dir', 'dir/b', 200); expect(await tracker.get('dir')).toBe(300);
  tracker.changed('dir', 'dir/b', 250); expect(await tracker.get('dir')).toBe(350);
  tracker.changed('dir', 'dir/a', 0); expect(await tracker.get('dir')).toBe(250);
  expect(scan).toHaveBeenCalledOnce();
  now = 5 * 60_000; expect(await tracker.get('dir')).toBe(100); expect(scan).toHaveBeenCalledTimes(2);
});
it('retries a scan invalidated by a concurrent copy and recovers after scan failure', async () => {
  const slow = deferred<Map<string, number>>();
  const scan = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue(new Map([['dir/new', 500]]));
  const tracker = createMediaUsageTracker(scan);
  const pending = tracker.get('dir'); tracker.changing(); tracker.changed('dir', 'dir/new', 500);
  slow.resolve(new Map()); expect(await pending).toBe(500); expect(scan).toHaveBeenCalledTimes(2);
  tracker.changed('dir'); scan.mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(tracker.get('dir')).rejects.toThrow('disk unavailable');
  expect(await tracker.get('dir')).toBe(500);
});
