import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ value: null as string | null, write: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { defaultEnvironment: 'local-enterprise' } } } }));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => s.value, setItemAsync: s.write, deleteItemAsync: async () => { s.value = null; } }));
import { getServerBaseUrl, resetServerBaseUrl, setServerBaseUrl } from '@/core/serverSettings';
const secure = 'https://192.168.2.194';
const legacy = 'http://192.168.2.194:5173';
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => { s.value = null; s.write.mockReset().mockImplementation(async (_key, value) => { s.value = value; }); });

it.each(['manual', 'reset'] as const)('a delayed automatic address write cannot overwrite a later %s action', async action => {
  s.value = action === 'manual' ? legacy : secure;
  let finish!: () => void;
  s.write.mockImplementationOnce(async (_key, value) => {
    await new Promise<void>(resolve => { finish = resolve; });
    s.value = value;
  });
  const automatic = setServerBaseUrl(action === 'manual' ? secure : legacy);
  await tick();
  const later = action === 'manual' ? setServerBaseUrl(legacy) : resetServerBaseUrl();
  await tick(); finish();
  await Promise.all([automatic, later]);
  expect(await getServerBaseUrl()).toBe(action === 'manual' ? legacy : secure);
});
