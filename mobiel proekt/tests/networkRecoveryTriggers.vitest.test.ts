import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({ listener: null as null | ((value: any) => void), sync: vi.fn(), refresh: vi.fn(), token: vi.fn(), generation: 1, appState: 'active' }));
vi.mock('react-native', () => ({ AppState: { get currentState() { return s.appState; } } }));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: (fn: any) => { s.listener = fn; return () => { s.listener = null; }; } } }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessTokenIfNeeded: s.token }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/diagnosticReportService', () => ({ triggerPendingDiagnosticReportUpload: vi.fn(), triggerDailyDiagnosticReportUpload: vi.fn() }));
vi.mock('@/services/mobileDataRefreshService', () => ({ refreshMobileData: s.refresh }));
vi.mock('@/sync/outboxRetryScheduler', () => ({ registerOutboxRetrySchedulerRunner: vi.fn() }));
vi.mock('@/sync/syncEngine', () => ({ runForegroundSync: s.sync }));

const tick = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const network = (online: boolean) => s.listener?.({ isConnected: online, isInternetReachable: online });
let stop: (() => void) | undefined;
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers(); s.generation = 1; s.appState = 'active'; s.token.mockResolvedValue('token'); s.refresh.mockResolvedValue(true); s.sync.mockResolvedValue({ sent: 1, skipped: null, hasMore: false }); });
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); });

it('reconnection starts delivery immediately, before refreshing lists, without an online-event loop', async () => {
  const { subscribeToNetworkSync } = await import('@/sync/syncTriggers');
  stop = subscribeToNetworkSync(); network(false); network(true); network(true); await tick();
  expect(s.sync).toHaveBeenCalledExactlyOnceWith({ mode: 'networkRecovered', assignmentId: undefined });
  expect(s.sync.mock.invocationCallOrder[0]).toBeLessThan(s.refresh.mock.invocationCallOrder[0]);
});

it('does not lose reconnection while a previous recovery is still running', async () => {
  const { subscribeToNetworkSync, runMobileRecoveryCycle } = await import('@/sync/syncTriggers');
  let finish!: (value: any) => void;
  s.sync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  stop = subscribeToNetworkSync(); network(false);
  const initial = runMobileRecoveryCycle('appActive', 'normal'); await tick();
  network(true); await tick();
  expect(s.sync).toHaveBeenCalledTimes(1);
  finish({ sent: 0, skipped: 'offline', hasMore: false }); await initial; await tick();
  expect(s.sync.mock.calls.map(call => call[0].mode)).toEqual(['normal', 'networkRecovered']);
});

it('a new network subscription processes its initial online snapshot', async () => {
  const { subscribeToNetworkSync } = await import('@/sync/syncTriggers');
  stop = subscribeToNetworkSync(); network(true); await tick(); stop();
  stop = subscribeToNetworkSync(); network(true); await tick();
  expect(s.sync).toHaveBeenCalledTimes(2);
});

it('Wi-Fi recovery triggers delivery even when cellular connectivity never went offline', async () => {
  const { subscribeToNetworkSync } = await import('@/sync/syncTriggers');
  stop = subscribeToNetworkSync();
  s.listener?.({ type: 'cellular', isConnected: true }); await tick();
  s.listener?.({ type: 'wifi', isConnected: true, details: { ipAddress: '192.168.2.12' } }); await tick();
  expect(s.sync).toHaveBeenCalledTimes(2);
  expect(s.refresh).toHaveBeenCalledTimes(2);
});

it('downloads new requests without a push within 30 seconds while active', async () => {
  const { subscribeToNetworkSync } = await import('@/sync/syncTriggers');
  stop = subscribeToNetworkSync(); network(true); await tick();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(s.refresh).toHaveBeenCalledTimes(2);
  s.appState = 'background';
  await vi.advanceTimersByTimeAsync(90_000);
  expect(s.refresh).toHaveBeenCalledTimes(2);
});

it('a failed recovery releases its lock for the next reconnect', async () => {
  const { subscribeToNetworkSync } = await import('@/sync/syncTriggers');
  s.token.mockRejectedValueOnce(Error('offline'));
  stop = subscribeToNetworkSync(); network(true); await tick();
  network(false); network(true); await tick();
  expect(s.sync).toHaveBeenCalledTimes(1);
});

it('a burst of reconnects coalesces into one follow-up without parallel delivery', async () => {
  const { subscribeToNetworkSync } = await import('@/sync/syncTriggers');
  let finish!: (value: any) => void;
  s.sync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  stop = subscribeToNetworkSync(); network(true); await tick();
  for (let i = 0; i < 20; i++) { network(false); network(true); }
  expect(s.sync).toHaveBeenCalledTimes(1);
  finish({ sent: 0, skipped: 'offline', hasMore: false }); await tick();
  expect(s.sync).toHaveBeenCalledTimes(2);
});

it('old recovery cannot dispatch after account change or release a new recovery lock', async () => {
  const { runMobileRecoveryCycle } = await import('@/sync/syncTriggers');
  let oldToken!: (value: string) => void;
  let newToken!: (value: string) => void;
  s.token.mockImplementationOnce(() => new Promise(resolve => { oldToken = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { newToken = resolve; }));
  const old = runMobileRecoveryCycle('appActive'); s.generation++;
  const current = runMobileRecoveryCycle('appActive');
  oldToken('old'); await old; await tick();
  const same = runMobileRecoveryCycle('fallback');
  expect(s.token).toHaveBeenCalledTimes(2);
  expect(s.sync).not.toHaveBeenCalled();
  newToken('new'); await current; await same;
  expect(s.sync).toHaveBeenCalledTimes(1);
});

it('identical requests share a promise only inside their session generation', async () => {
  const { triggerForegroundSyncWithRetry } = await import('@/sync/syncTriggers');
  let finish!: (value: any) => void;
  s.sync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = triggerForegroundSyncWithRetry(); await tick();
  const same = triggerForegroundSyncWithRetry(); await tick();
  expect(s.sync).toHaveBeenCalledTimes(1);
  s.generation++;
  await triggerForegroundSyncWithRetry();
  expect(s.sync).toHaveBeenCalledTimes(2);
  finish({ sent: 0, skipped: 'offline', hasMore: false }); await first; await same;
});

it.each(['manualReport', 'manualAll', 'networkRecovered'] as const)('%s delivers while background list refresh is pending', async mode => {
  const { requestMobileDataRefresh, triggerForegroundSyncWithRetry } = await import('@/sync/syncTriggers');
  let finish!: (value: boolean) => void;
  s.refresh.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  requestMobileDataRefresh('manual', { force: true });
  const delivery = triggerForegroundSyncWithRetry({ mode, assignmentId: 'assignment' });
  await tick();
  const calls = s.sync.mock.calls.slice();
  finish(true);
  await delivery;
  expect(calls).toEqual([[{ mode, assignmentId: 'assignment' }]]);
});

it('the server answering again after being unreachable starts a recovery pass', async () => {
  const { subscribeToNetworkSync } = await import('@/sync/syncTriggers');
  const events = await import('@/core/connectionStateEvents');
  stop = subscribeToNetworkSync(); network(true); await tick();
  s.sync.mockClear();
  events.publishServerReachabilityRestored(); await tick();
  expect(s.sync).toHaveBeenCalledExactlyOnceWith({ mode: 'networkRecovered', assignmentId: undefined });
  stop(); stop = undefined;
  events.publishServerReachabilityRestored(); await tick();
  expect(s.sync).toHaveBeenCalledTimes(1);
});
