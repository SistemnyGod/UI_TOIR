import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  network: null as null | ((state: any) => void),
  app: null as null | ((state: string) => void),
  snapshot: {} as any,
  reachable: true,
  cached: null as boolean | null,
  probe: vi.fn(), invalidate: vi.fn(), fetch: vi.fn()
}));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: (_event: string, listener: any) => { s.app = listener; return { remove() {} }; } } }));
vi.mock('@react-native-community/netinfo', () => ({ default: {
  addEventListener: (listener: any) => { s.network = listener; return () => {}; }, fetch: s.fetch
} }));
vi.mock('@/api/serverHealthApi', () => ({ checkServerConnection: s.probe, invalidateServerHealthCache: s.invalidate }));
vi.mock('@/core/serverSettings', () => ({ subscribeToServerSettings: () => () => {} }));
const wifi = (ip = '192.168.2.12') => ({ type: 'wifi', isConnected: true, details: { ipAddress: ip, ssid: 'plant' } });
const cellular = { type: 'cellular', isConnected: true, details: { cellularGeneration: '4g' } };
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks();
  s.cached = null; s.reachable = true; s.snapshot = wifi();
  s.fetch.mockImplementation(async () => s.snapshot);
  s.invalidate.mockImplementation(() => { s.cached = null; });
  s.probe.mockImplementation(async () => ({ ok: s.cached ?? (s.cached = s.reachable) }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('rechecks the LAN server on Wi-Fi/cellular switches while isConnected stays true', async () => {
  const { startConnectionMonitor, useConnectionStatus } = await import('@/core/connectionStatus');
  startConnectionMonitor(); s.network?.(wifi()); await tick();
  expect(useConnectionStatus()).toBe('connected');
  s.reachable = false; s.network?.(cellular);
  expect(useConnectionStatus()).toBe('checking');
  await tick(); expect(useConnectionStatus()).toBe('serverUnavailable');
  s.reachable = true; s.network?.(wifi()); await tick();
  expect(useConnectionStatus()).toBe('connected');
  expect(s.probe).toHaveBeenCalledTimes(3);
});

it('invalidates connectivity when the Wi-Fi IP changes, but ignores signal strength updates', async () => {
  const { startConnectionMonitor, useConnectionStatus } = await import('@/core/connectionStatus');
  startConnectionMonitor(); s.network?.(wifi()); await tick();
  s.network?.({ ...wifi(), details: { ...wifi().details, strength: 80 } }); await tick();
  expect(s.probe).toHaveBeenCalledTimes(1);
  s.reachable = false; s.network?.(wifi('10.0.0.12')); await tick();
  expect(useConnectionStatus()).toBe('serverUnavailable');
  expect(s.probe).toHaveBeenCalledTimes(2);
});

it('refreshes the OS network snapshot and server result on return from background', async () => {
  const { startConnectionMonitor, useConnectionStatus } = await import('@/core/connectionStatus');
  startConnectionMonitor(); s.network?.(wifi()); await tick();
  s.app?.('background'); s.snapshot = cellular; s.reachable = false;
  s.app?.('active'); await tick();
  expect(s.fetch).toHaveBeenCalled();
  expect(useConnectionStatus()).toBe('serverUnavailable');
});

it('a newer OS event during foreground refresh cannot leave monitoring suspended', async () => {
  const { startConnectionMonitor, useConnectionStatus } = await import('@/core/connectionStatus');
  startConnectionMonitor(); s.network?.(wifi()); await tick();
  s.app?.('background');
  let finish!: (value: any) => void;
  s.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  s.app?.('active'); s.reachable = false; s.network?.(cellular); await tick();
  finish(wifi()); await tick();
  expect(useConnectionStatus()).toBe('serverUnavailable');
  s.reachable = true; s.network?.(wifi()); await tick();
  expect(useConnectionStatus()).toBe('connected');
});
