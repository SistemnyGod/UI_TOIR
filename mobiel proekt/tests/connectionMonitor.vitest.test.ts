import { describe, expect, it, vi } from 'vitest';
import { ConnectionMonitor } from '@/core/connectionMonitor';
import { ServerHealthCache } from '@/api/serverHealthCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('connection review regressions', () => {
  it('shares a pending check and ignores its failure after a successful API response', async () => {
    const probe = deferred<{ ok: boolean }>();
    const request = vi.fn(() => probe.promise);
    const monitor = new ConnectionMonitor(request, vi.fn());
    monitor.setNetwork(true);
    const waiting = monitor.check();
    monitor.check();
    expect(request).toHaveBeenCalledTimes(1);
    monitor.outcome('authorizationRecovered');
    probe.resolve({ ok: false });
    await waiting;
    expect(monitor.status).toBe('connected');
  });
  it('public health cannot clear a required login', async () => {
    let now = 0;
    const request = vi.fn(async () => ({ ok: true }));
    const monitor = new ConnectionMonitor(request, vi.fn(), () => now);
    monitor.setNetwork(true);
    await monitor.check();
    monitor.outcome('authorizationRequired');
    now += 30_000;
    await monitor.check();
    expect(monitor.status).toBe('authorizationRequired');
    monitor.outcome('connected');
    expect(monitor.status).toBe('authorizationRequired');
    monitor.outcome('authorizationRecovered');
    expect(monitor.status).toBe('connected');
  });
  it('does not probe in background or while a real response is fresh', async () => {
    let now = 0;
    const request = vi.fn(async () => ({ ok: true }));
    const monitor = new ConnectionMonitor(request, vi.fn(), () => now);
    monitor.setActive(false);
    monitor.setNetwork(true);
    await monitor.check();
    expect(request).not.toHaveBeenCalled();
    monitor.setActive(true);
    await monitor.check();
    now = 20_000;
    monitor.outcome('connected');
    now = 35_000;
    await monitor.check();
    expect(request).toHaveBeenCalledTimes(1);
    now = 50_000;
    await monitor.check();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not restore an invalidated server cache from an obsolete response', async () => {
    const old = deferred<{ ok: boolean }>();
    const cache = new ServerHealthCache<{ ok: boolean }>();
    const waiting = cache.getOrProbe('server', () => old.promise);
    cache.invalidate('server');
    await cache.getOrProbe('server', async () => ({ ok: false }));
    old.resolve({ ok: true });
    await waiting;
    expect(cache.get('server')?.ok).toBe(false);
  });

  it('keeps offline status when a response finishes after network loss', async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const monitor = new ConnectionMonitor(request, vi.fn());
    monitor.setNetwork(true);
    await monitor.check();
    monitor.setNetwork(false);
    monitor.outcome('connected');
    expect(monitor.status).toBe('offline');
  });

  it('ignores an API outcome from an older server context generation', () => {
    const monitor = new ConnectionMonitor(async () => ({ ok: true }), vi.fn());
    monitor.setContextGeneration(4);
    monitor.setNetwork(true);
    monitor.outcome('connected', 3);
    expect(monitor.status).not.toBe('connected');
    monitor.outcome('connected', 4);
    expect(monitor.status).toBe('connected');
  });
});

it('retains login requirement received offline across reconnect and settings reset', async () => {
  const monitor = new ConnectionMonitor(async () => ({ok:true}), vi.fn());
  monitor.outcome('authorizationRequired');
  monitor.reset();
  expect(monitor.status).toBe('offline');
  monitor.setNetwork(true);
  await monitor.check();
  expect(monitor.status).toBe('authorizationRequired');
  monitor.outcome('authorizationRecovered');
  expect(monitor.status).toBe('connected');
});
it('retains successful recovery while offline without claiming connectivity', async () => {
  const monitor = new ConnectionMonitor(async () => ({ok:true}), vi.fn());
  monitor.outcome('authorizationRequired');
  monitor.outcome('authorizationRecovered');
  expect(monitor.status).toBe('offline');
  monitor.setNetwork(true);
  await monitor.check();
  expect(monitor.status).toBe('connected');
});
