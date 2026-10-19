import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

const s = vi.hoisted(() => ({ owner: 'alice', generation: 1, fetch: vi.fn(), token: vi.fn(), health: vi.fn(), outcome: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => s.owner, getAccessToken: s.token }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation, advanceSessionGeneration: () => ++s.generation }));
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: async () => 'device' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/core/serverSettings', () => ({
  getMobileRuntimeConfig: async () => ({ apiBaseUrl: 'https://test', contourId: 'test', syncProtocolVersion: '1' }),
  getServerCandidateBaseUrls: async () => ['https://test'], setServerBaseUrl: async () => {}
}));
vi.mock('@/api/serverHealthApi', () => ({ probeServerHealthCached: s.health, invalidateServerHealthCache: vi.fn() }));
vi.mock('@/core/connectionStateEvents', () => ({ getMobileConnectionContextGeneration: () => 1, invalidateMobileConnectionContext: vi.fn(), recordMobileConnectionOutcome: s.outcome }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/repositories/outboxRepository', () => ({ markPendingOutboxCommandsAuthRequired: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: async () => {} }));
vi.mock('@/api/networkTimeout', async importOriginal => ({ ...await importOriginal<object>(), fetchWithTimeout: s.fetch }));

import { mobileRequest } from '@/api/httpClient';

beforeEach(() => {
  s.owner = 'alice'; s.generation = 1;
  s.outcome.mockClear();
  s.token.mockReset().mockResolvedValue('alice-token');
  s.health.mockReset().mockResolvedValue({ ok: true });
  s.fetch.mockReset().mockImplementation(async () => new Response('{"owner":"alice"}', { status: 200 }));
});
afterEach(() => vi.useRealTimers());

it('rejects a successful response received after account switch', async () => {
  s.fetch.mockImplementation(async () => { s.owner = 'bob'; s.generation++; return new Response('{}'); });
  await expect(mobileRequest('/api/v1/mobile/bootstrap', z.unknown())).rejects.toMatchObject({ name: 'StaleAuthResponseError' });
});

it('rejects an account switch while reading the response body', async () => {
  s.fetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => { s.generation++; return {}; } });
  await expect(mobileRequest('/api/v1/mobile/bootstrap', z.unknown())).rejects.toMatchObject({ name: 'StaleAuthResponseError' });
});

it('does not send the previous operation with a new account token', async () => {
  s.token.mockImplementation(async () => { s.owner = 'bob'; s.generation++; return 'bob-token'; });
  await expect(mobileRequest('/api/v1/mobile/outbox', z.unknown(), { method: 'POST', body: {} })).rejects.toMatchObject({ name: 'StaleAuthResponseError' });
  expect(s.fetch).not.toHaveBeenCalled();
});

it('does not send after a session change during the health probe', async () => {
  s.health.mockImplementation(async () => { s.generation++; return { ok: true }; });
  await expect(mobileRequest('/api/v1/mobile/outbox', z.unknown(), { method: 'POST', body: {} })).rejects.toMatchObject({ name: 'StaleAuthResponseError' });
  expect(s.fetch).not.toHaveBeenCalled();
});

it('preserves a normal same-session response', async () => {
  await expect(mobileRequest('/api/v1/mobile/bootstrap', z.unknown())).resolves.toEqual({ owner: 'alice' });
});

it('a JSON body arriving after the operation timeout never publishes a connected state', async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  s.fetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: () => new Promise(resolve => { finish = resolve; }) });
  const request = mobileRequest('/api/v1/mobile/bootstrap', z.unknown()).catch(error => error);
  await vi.advanceTimersByTimeAsync(30_001);
  expect(await request).toMatchObject({ kind: 'timeout' });
  finish({ owner: 'alice' });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(s.outcome).not.toHaveBeenCalledWith('connected', expect.anything());
});
