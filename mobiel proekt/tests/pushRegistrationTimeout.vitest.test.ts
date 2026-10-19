import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ owner: 'a', native: vi.fn(), register: vi.fn(), save: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(), setNotificationChannelAsync: async () => {},
  AndroidImportance: { HIGH: 4 }, getPermissionsAsync: async () => ({ granted: true }),
  getDevicePushTokenAsync: s.native
}));
vi.mock('@/api/notificationApi', () => ({ registerPushToken: s.register }));
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: async () => 'device' }));
vi.mock('@/auth/tokenStorage', () => ({ getAccessToken: async () => 'access' }));
vi.mock('@/auth/dataOwnerContext', () => ({
  captureDataOwnerContext: async () => ({ ownerUserId: s.owner }),
  assertDataOwnerContext: async (context: { ownerUserId: string }) => { if (context.ownerUserId !== s.owner) throw new Error('Stale owner'); }
}));
vi.mock('@/db/repositories/notificationRepository', () => ({ saveDevicePushToken: s.save }));
vi.mock('@/sync/syncEvents', () => ({ emitSyncEvent: vi.fn() }));
import { refreshPushRegistrationIfAllowed } from '@/services/notificationService';
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); s.owner = 'a'; });
afterEach(() => vi.useRealTimers());
it('times out unavailable Google services, shares native acquisition and ignores its late result', async () => {
  let resolve!: (token: { data: string }) => void;
  s.native.mockReturnValue(new Promise(done => { resolve = done; }));
  const first = refreshPushRegistrationIfAllowed();
  const second = refreshPushRegistrationIfAllowed();
  await vi.advanceTimersByTimeAsync(5000);
  await expect(first).resolves.toBeNull(); await expect(second).resolves.toBeNull();
  expect(s.native).toHaveBeenCalledOnce();
  resolve({ data: 'late-token' }); await vi.advanceTimersByTimeAsync(0);
  expect(s.register).not.toHaveBeenCalled(); expect(s.save).not.toHaveBeenCalled();
});
it('does not register a token for an account that changed while native acquisition was pending', async () => {
  let resolve!: (token: { data: string }) => void;
  s.native.mockReturnValue(new Promise(done => { resolve = done; }));
  const registration = refreshPushRegistrationIfAllowed();
  const rejected = expect(registration).rejects.toThrow('Stale owner');
  await vi.advanceTimersByTimeAsync(0);
  s.owner = 'b'; resolve({ data: 'token' }); await rejected;
  expect(s.register).not.toHaveBeenCalled();
});
it('shares registration, reuses a confirmed token and registers again when token or owner changes', async () => {
  s.native.mockResolvedValue({ data: 'confirmed-token' });
  s.register.mockResolvedValue({ registered: true });
  await Promise.all([refreshPushRegistrationIfAllowed(), refreshPushRegistrationIfAllowed()]);
  expect(s.register).toHaveBeenCalledOnce();
  expect(s.save).toHaveBeenCalledOnce();
  await refreshPushRegistrationIfAllowed();
  expect(s.register).toHaveBeenCalledOnce();
  s.native.mockResolvedValue({ data: 'rotated-token' });
  await refreshPushRegistrationIfAllowed();
  expect(s.register).toHaveBeenCalledTimes(2);
  s.owner = 'b';
  await refreshPushRegistrationIfAllowed();
  expect(s.register).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  await refreshPushRegistrationIfAllowed();
  expect(s.register).toHaveBeenCalledTimes(4);
});
