import { beforeEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({ values: new Map<string, string>(), read: vi.fn(), write: vi.fn(), id: 0 }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: s.read, setItemAsync: s.write,
  deleteItemAsync: async (key: string) => { s.values.delete(key); }
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `operation-${++s.id}` }));
import { clearTokens, getOrCreateRefreshOperationId, getStoredSessionSnapshot, setTokens, storeSessionEnvelope } from '@/auth/tokenStorage';

const snapshot = (ownerUserId: string) => ({ ownerUserId, accessToken: `${ownerUserId}-access`, refreshToken: `${ownerUserId}-refresh`, accessExpiresAt: null, refreshExpiresAt: null, offlineSession: null, refreshOperationId: null });
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
  s.values.clear(); s.id = 0;
  s.read.mockReset().mockImplementation(async key => s.values.get(key) ?? null);
  s.write.mockReset().mockImplementation(async (key, value) => { s.values.set(key, value); });
});

it('concurrent refresh attempts share a single durable operation ID', async () => {
  await storeSessionEnvelope(snapshot('alice'));
  const ids = await Promise.all(Array.from({ length: 8 }, () => getOrCreateRefreshOperationId()));
  expect(new Set(ids).size).toBe(1);
  expect((await getStoredSessionSnapshot()).refreshOperationId).toBe(ids[0]);
});

it.each(['clear', 'replace'] as const)('%s cannot be overwritten by an older queued read-modify-write', async action => {
  await storeSessionEnvelope(snapshot('alice'));
  let finish!: () => void;
  s.read.mockImplementationOnce(async key => {
    const previous = s.values.get(key) ?? null;
    await new Promise<void>(resolve => { finish = resolve; });
    return previous;
  });
  const older = setTokens('alice-new', 'alice-new-refresh');
  await tick();
  const newer = action === 'clear' ? clearTokens() : storeSessionEnvelope(snapshot('bob'));
  await tick();
  finish();
  await Promise.all([older, newer]);
  expect(await getStoredSessionSnapshot()).toMatchObject(action === 'clear'
    ? { accessToken: null, refreshToken: null, ownerUserId: null }
    : snapshot('bob'));
});

it('a queued guarded write does not publish credentials after a session change', async () => {
  await storeSessionEnvelope(snapshot('alice'));
  let finish!: () => void;
  let current = true;
  s.read.mockImplementationOnce(async key => {
    const previous = s.values.get(key) ?? null;
    await new Promise<void>(resolve => { finish = resolve; });
    return previous;
  });
  const older = setTokens('alice-new', 'alice-new-refresh'); await tick();
  const guarded = storeSessionEnvelope(snapshot('bob'), () => { if (!current) throw Error('Stale'); }).catch(error => error);
  current = false; finish(); await older;
  expect(await guarded).toBeInstanceOf(Error);
  expect((await getStoredSessionSnapshot()).ownerUserId).toBe('alice');
});

it.each([{ accessToken: 100 }, { offlineSession: { userId: 'bob', fullName: 'Bob', lastOnlineLoginAt: '2026-01-01', expiresAt: '2030-01-01' } }])('a malformed or mixed-owner envelope fails closed', async damage => {
  s.values.set('patrol360.session.v1', JSON.stringify({ version: 1, ...snapshot('alice'), ...damage }));
  expect(await getStoredSessionSnapshot()).toMatchObject({ accessToken: null, refreshToken: null, ownerUserId: null });
});
