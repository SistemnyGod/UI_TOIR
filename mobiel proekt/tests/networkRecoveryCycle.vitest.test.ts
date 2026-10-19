import { beforeEach, expect, it, vi } from 'vitest';

// Behavior for the order of one recovery pass (runMobileRecoveryCycle): refresh the session,
// deliver the outbox, and only after delivery settles download a fresh snapshot; without a
// usable session nothing is sent or downloaded; a new session never joins the old session's
// pass. Collaborators are mocked; coalescing and reconnect triggering are covered in
// networkRecoveryTriggers.vitest.test.ts.
const s = vi.hoisted(() => ({ sync: vi.fn(), refresh: vi.fn(), token: vi.fn(), generation: 1 }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active' } }));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: () => () => {} } }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessTokenIfNeeded: s.token }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/diagnosticReportService', () => ({ triggerPendingDiagnosticReportUpload: vi.fn(), triggerDailyDiagnosticReportUpload: vi.fn() }));
vi.mock('@/services/mobileDataRefreshService', () => ({ refreshMobileData: s.refresh }));
vi.mock('@/sync/outboxRetryScheduler', () => ({ registerOutboxRetrySchedulerRunner: vi.fn() }));
vi.mock('@/sync/syncEngine', () => ({ runForegroundSync: s.sync }));

const tick = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); s.generation = 1;
  s.refresh.mockResolvedValue(true);
});

it('refreshes the session, then delivers the outbox, then downloads a fresh snapshot', async () => {
  const token = deferred<string | null>();
  const delivery = deferred<unknown>();
  s.token.mockReturnValue(token.promise);
  s.sync.mockReturnValue(delivery.promise);
  const { runMobileRecoveryCycle } = await import('@/sync/syncTriggers');

  const cycle = runMobileRecoveryCycle('network', 'networkRecovered'); await tick();
  expect(s.token).toHaveBeenCalledOnce();
  expect(s.sync).not.toHaveBeenCalled();

  token.resolve('token'); await tick();
  expect(s.sync).toHaveBeenCalledExactlyOnceWith({ mode: 'networkRecovered', assignmentId: undefined });
  expect(s.refresh).not.toHaveBeenCalled();

  delivery.resolve({ sent: 1, skipped: null, hasMore: false }); await cycle;
  expect(s.refresh).toHaveBeenCalledOnce();
});

it('without a usable session recovery neither delivers nor downloads', async () => {
  s.token.mockResolvedValue(null);
  const { runMobileRecoveryCycle } = await import('@/sync/syncTriggers');

  await runMobileRecoveryCycle('appActive', 'normal');

  expect(s.token).toHaveBeenCalledOnce();
  expect(s.sync).not.toHaveBeenCalled();
  expect(s.refresh).not.toHaveBeenCalled();
});

it('a recovery requested by a new session runs its own pass instead of joining the old one', async () => {
  const oldToken = deferred<string | null>();
  s.token.mockReturnValueOnce(oldToken.promise).mockResolvedValue('new-token');
  s.sync.mockResolvedValue({ sent: 0, skipped: null, hasMore: false });
  const { runMobileRecoveryCycle } = await import('@/sync/syncTriggers');

  const old = runMobileRecoveryCycle('appActive', 'normal'); await tick();
  s.generation++;
  const current = runMobileRecoveryCycle('appActive', 'normal'); await tick();

  expect(s.token).toHaveBeenCalledTimes(2);
  expect(s.sync).toHaveBeenCalledOnce();
  oldToken.resolve('old-token'); await Promise.all([old, current]);
  expect(s.sync).toHaveBeenCalledOnce();
});
