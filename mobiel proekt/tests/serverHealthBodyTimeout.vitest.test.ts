import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/core/serverSettings', () => ({}));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
import { invalidateServerHealthCache, probeServerHealthCached } from '@/api/serverHealthApi';

beforeEach(() => { vi.useFakeTimers(); invalidateServerHealthCache(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('a stalled health body times out and releases the shared cached probe', async () => {
  let signal: AbortSignal | undefined;
  const fetch = vi.fn().mockImplementation(async (_url, options) => {
    signal = options.signal;
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: () => new Promise(() => {}) };
  });
  vi.stubGlobal('fetch', fetch);
  let result: any;
  const first = probeServerHealthCached('https://test', 'test', 100).then(value => { result = value; });
  await vi.advanceTimersByTimeAsync(101);
  expect(result).toMatchObject({ ok: false, errorKind: 'timeout' });
  expect(signal?.aborted).toBe(true);
  await first;
  invalidateServerHealthCache();
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', contourId: 'test', syncProtocolVersion: '1.0' }), { headers: { 'content-type': 'application/json' } }));
  await expect(probeServerHealthCached('https://test', 'test', 100)).resolves.toMatchObject({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});
