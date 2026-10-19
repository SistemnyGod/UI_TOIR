import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ owner: 'alice', generation: 0, bootstrap: vi.fn(), save: vi.fn(), event: vi.fn(), push: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => s.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessTokenIfNeeded: async () => 'token' }));
vi.mock('@/api/mobileApi', () => ({ getBootstrap: s.bootstrap }));
vi.mock('@/db/repositories/bootstrapRepository', () => ({ saveBootstrap: s.save }));
vi.mock('@/db/repositories/patrolAppealRepository', () => ({ refreshPatrolAppealsPage: async () => {} }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/notificationService', () => ({ refreshPushRegistrationIfAllowed: s.push, syncMobileNotifications: async () => {} }));
vi.mock('@/services/workTaskService', () => ({ syncWorkItems: async () => {} }));
vi.mock('@/sync/syncEvents', () => ({ emitSyncEvent: s.event }));
import { refreshMobileData } from '@/services/mobileDataRefreshService';

const snapshot = { user: { serverUserId: 'alice' }, requestBoard: [], assignments: [], routes: [] };
it('loads and publishes assignments even when push registration never completes', async () => {
  s.push.mockReturnValue(new Promise(() => {}));
  await expect(refreshMobileData()).resolves.toBe(true);
  expect(s.bootstrap).toHaveBeenCalledOnce();
  expect(s.save).toHaveBeenCalledOnce();
  expect(s.event).toHaveBeenCalledWith(expect.objectContaining({ snapshotRefreshed: true }));
  await expect(refreshMobileData()).resolves.toBe(true);
  expect(s.bootstrap).toHaveBeenCalledTimes(2);
});
beforeEach(() => { s.owner = 'alice'; s.generation = 0; vi.clearAllMocks(); s.push.mockResolvedValue(undefined); s.save.mockResolvedValue(true); s.bootstrap.mockResolvedValue(snapshot); });
it('does not save or announce a late snapshot from a previous session', async () => {
  s.bootstrap.mockImplementation(async () => { s.owner = 'bob'; s.generation++; return snapshot; });
  await expect(refreshMobileData()).rejects.toThrow('Устаревший');
  expect(s.save).not.toHaveBeenCalled(); expect(s.event).not.toHaveBeenCalled();
});
it('coalesces refreshes within a session and gives a new session its own request', async () => {
  let resolveOld!: (value: typeof snapshot) => void;
  const started = new Promise<void>(resolve => s.bootstrap.mockImplementationOnce(() => { resolve(); return new Promise(r => { resolveOld = r; }); }));
  const old = refreshMobileData(); const rejected = expect(old).rejects.toThrow('Устаревший');
  await started;
  const same = refreshMobileData(); const sameRejected = expect(same).rejects.toThrow('Устаревший');
  await Promise.resolve(); await Promise.resolve();
  expect(s.bootstrap).toHaveBeenCalledTimes(1);
  s.owner = 'bob'; s.generation++;
  s.bootstrap.mockResolvedValue({ ...snapshot, user: { serverUserId: 'bob' } });
  await expect(refreshMobileData()).resolves.toBe(true);
  resolveOld(snapshot); await rejected; await sameRejected;
  expect(s.bootstrap).toHaveBeenCalledTimes(2); expect(s.save).toHaveBeenCalledOnce();
});
it('passes the captured owner to transactional storage and uses the guarded HTTP path', async () => {
  await expect(refreshMobileData()).resolves.toBe(true);
  expect(s.bootstrap).toHaveBeenCalledWith(undefined, expect.anything());
  expect(s.save).toHaveBeenCalledWith(snapshot, { context: { ownerUserId: 'alice', contourId: 'test', generation: 0 } });
});

it('restarts a cancelled load for the same employee using the new session and fresh requests', async () => {
  s.bootstrap.mockImplementationOnce(async () => { s.generation++; return snapshot; });
  const current = { ...snapshot, requestBoard: [{ requestId: 'request-30-september' }] };
  s.bootstrap.mockResolvedValueOnce(current);
  await expect(refreshMobileData()).resolves.toBe(true);
  expect(s.save).toHaveBeenCalledExactlyOnceWith(current, { context: { ownerUserId: 'alice', contourId: 'test', generation: 1 } });
});

it('retries a stale authentication response once without saving its data', async () => {
  s.bootstrap.mockRejectedValueOnce(Object.assign(new Error('cancelled refresh'), { name: 'StaleAuthResponseError' }));
  await expect(refreshMobileData()).resolves.toBe(true);
  expect(s.bootstrap).toHaveBeenCalledTimes(2);
  expect(s.save).toHaveBeenCalledOnce();
});

it('does not loop when the replacement session is also cancelled', async () => {
  s.bootstrap.mockRejectedValue(Object.assign(new Error('cancelled refresh'), { name: 'StaleAuthResponseError' }));
  await expect(refreshMobileData()).rejects.toThrow('cancelled refresh');
  expect(s.bootstrap).toHaveBeenCalledTimes(2);
  expect(s.save).not.toHaveBeenCalled();
});
