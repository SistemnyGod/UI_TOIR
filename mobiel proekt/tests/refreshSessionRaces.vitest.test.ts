import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ values: new Map<string, string>(), fetch: vi.fn(), id: 0 }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => s.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { s.values.set(key, value); },
  deleteItemAsync: async (key: string) => { s.values.delete(key); }
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++s.id}` }));
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: async () => 'device' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/core/serverSettings', () => ({ getMobileRuntimeConfig: async () => ({ apiBaseUrl: 'https://test', contourId: 'test', syncProtocolVersion: '1.0' }), getServerCandidateBaseUrls: async () => ['https://test'] }));
vi.mock('@/api/serverHealthApi', () => ({ probeServerHealthCached: async () => ({ ok: true }), invalidateServerHealthCache: vi.fn() }));
vi.mock('@/core/connectionStateEvents', () => ({ getMobileConnectionContextGeneration: () => 1, invalidateMobileConnectionContext: vi.fn(), recordMobileConnectionOutcome: vi.fn() }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/repositories/outboxRepository', () => ({ markPendingOutboxCommandsAuthRequired: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: async () => {} }));
import { beginAuthTransition, refreshStoredAccessToken } from '@/api/httpClient';
import { getStoredSessionSnapshot, storeSessionEnvelope } from '@/auth/tokenStorage';

const stamp = '2030-01-01T00:00:00Z';
const snapshot = (owner: string) => ({ ownerUserId: owner, accessToken: `${owner}-old`, refreshToken: `${owner}-refresh`, accessExpiresAt: stamp, refreshExpiresAt: stamp, refreshOperationId: null, offlineSession: { userId: owner, contourId: 'test', fullName: owner, lastOnlineLoginAt: stamp, expiresAt: stamp, offlineExpiresAt: stamp } });
const session = (owner: string) => ({ contourId: 'test', accessToken: `${owner}-new`, refreshToken: `${owner}-new-refresh`, expiresAt: stamp, refreshExpiresAt: stamp, user: { serverUserId: owner, fullName: owner, roles: [], permissions: [], updatedAtServer: stamp }, device: { deviceId: 'device', ownerUserId: owner, trusted: true, blockedAt: null } });
const response = (json: () => Promise<unknown>, status = 200) => ({ ok: status === 200, status, headers: new Headers({ 'content-type': 'application/json' }), json });
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(async () => { s.values.clear(); s.fetch.mockReset(); beginAuthTransition(); await storeSessionEnvelope(snapshot('alice')); vi.stubGlobal('fetch', s.fetch); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([200, 401])('late %s refresh body cannot replace or revoke the newly signed-in account', async status => {
  s.fetch.mockResolvedValue(response(async () => {
    beginAuthTransition(); await storeSessionEnvelope(snapshot('bob'));
    return status === 200 ? session('alice') : { code: 'session_revoked' };
  }, status));
  await expect(refreshStoredAccessToken()).rejects.toMatchObject({ name: 'StaleAuthResponseError' });
  expect(await getStoredSessionSnapshot()).toMatchObject(snapshot('bob'));
});

it('an old refresh cannot release the lock of a newer refresh', async () => {
  let oldBody!: (value: unknown) => void;
  let newBody!: (value: unknown) => void;
  s.fetch.mockResolvedValueOnce(response(() => new Promise(resolve => { oldBody = resolve; })))
    .mockResolvedValueOnce(response(() => new Promise(resolve => { newBody = resolve; })));
  const old = refreshStoredAccessToken().catch(error => error);
  await tick();
  beginAuthTransition(); await storeSessionEnvelope(snapshot('bob'));
  const current = refreshStoredAccessToken(); await tick();
  expect(s.fetch).toHaveBeenCalledTimes(2);
  oldBody(session('alice')); await old;
  const same = refreshStoredAccessToken(); await tick();
  expect(s.fetch).toHaveBeenCalledTimes(2);
  newBody(session('bob'));
  await expect(current).resolves.toBe('bob-new');
  await expect(same).resolves.toBe('bob-new');
});

it('a stalled refresh body times out, retains local data and permits another attempt', async () => {
  vi.useFakeTimers();
  s.fetch.mockResolvedValueOnce(response(() => new Promise(() => {})));
  let failure: any;
  const stalled = refreshStoredAccessToken().catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(30_001);
  expect(failure?.kind).toBe('timeout'); await stalled;
  const pendingId = (await getStoredSessionSnapshot()).refreshOperationId;
  s.fetch.mockResolvedValueOnce(response(async () => session('alice')));
  await expect(refreshStoredAccessToken()).resolves.toBe('alice-new');
  expect(s.fetch.mock.calls.map(call => JSON.parse(call[1].body).clientOperationId)).toEqual([pendingId, pendingId]);
});

it('technical refresh rejection preserves offline access without attempting another refresh', async () => {
  s.fetch.mockResolvedValue(response(async () => ({ code: 'device_session_not_found' }), 401));
  await expect(refreshStoredAccessToken()).rejects.toThrow('требуется повторный вход');
  const stored = await getStoredSessionSnapshot();
  expect(stored).toMatchObject({ ownerUserId: 'alice', accessToken: null, refreshToken: null, refreshOperationId: null,
    offlineSession: { userId: 'alice', revokedAt: null, requiresReenrollment: true } });
  await expect(refreshStoredAccessToken()).rejects.toThrow('Ключ мобильной сессии недоступен');
  expect(s.fetch).toHaveBeenCalledTimes(1);
});
