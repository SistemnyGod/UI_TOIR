import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ stored: null as string | null }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { defaultEnvironment: 'local-enterprise' } } } }));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => s.stored, setItemAsync: async (_key: string, value: string) => { s.stored = value; }, deleteItemAsync: async () => { s.stored = null; } }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
beforeEach(() => { s.stored = null; vi.resetModules(); });
afterEach(() => vi.unstubAllGlobals());

it('uses LAN HTTPS and excludes an unconfigured public placeholder', async () => {
  const settings = await import('@/core/serverSettings');
  expect(await settings.getServerBaseUrl()).toBe('https://192.168.2.194');
  expect(await settings.getServerCandidateBaseUrls('https://192.168.2.194')).toEqual(['https://192.168.2.194']);
  expect(settings.isAllowedServerBaseUrl('http://31.173.110.118')).toBe(false);
});

it('normalizes pasted API paths and legacy ports to the actual listener', async () => {
  const { normalizeServerBaseUrl } = await import('@/core/serverSettings');
  expect(normalizeServerBaseUrl(' https://192.168.2.194:5173/api/v1/mobile/health ')).toBe('https://192.168.2.194');
  expect(normalizeServerBaseUrl('http://192.168.2.194:5000/api/v1/mobile')).toBe('http://192.168.2.194:5173');
  expect(() => normalizeServerBaseUrl('https://user:password@192.168.2.194')).toThrow();
});

it('preserves explicitly saved legacy LAN HTTP without weakening a secure operation', async () => {
  s.stored = 'http://192.168.2.194:5173';
  const settings = await import('@/core/serverSettings');
  expect(await settings.getServerBaseUrl()).toBe(s.stored);
  expect(await settings.getServerCandidateBaseUrls('https://192.168.2.194')).toEqual(['https://192.168.2.194']);
});

it('does not persist a reachable server from another contour', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok', syncProtocolVersion: '1.0', contourId: 'other' }), { headers: { 'content-type': 'application/json' } })));
  const { checkServerConnection } = await import('@/api/serverHealthApi');
  await expect(checkServerConnection('https://192.168.2.194', { persist: true })).resolves.toMatchObject({ ok: false, failureKind: 'wrongContour' });
  expect(s.stored).toBeNull();
});
