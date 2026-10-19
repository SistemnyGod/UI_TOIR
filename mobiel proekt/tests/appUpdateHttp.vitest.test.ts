import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

const contract = JSON.parse(readFileSync(new URL('./support/appUpdateContract.json', import.meta.url), 'utf8'));
const s = vi.hoisted(() => ({ fetch: vi.fn(), baseUrl: 'https://192.168.2.194' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice', getAccessToken: async () => 'alice-token' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 1, advanceSessionGeneration: () => 2 }));
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: async () => 'device' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/core/serverSettings', () => ({
  getMobileRuntimeConfig: async () => ({ apiBaseUrl: s.baseUrl, contourId: 'patrol360-local-enterprise', syncProtocolVersion: '1.0', appVersionCode: 52 }),
  getServerCandidateBaseUrls: async () => [s.baseUrl], setServerBaseUrl: async () => {}
}));
vi.mock('@/api/serverHealthApi', () => ({ probeServerHealthCached: async () => ({ ok: true }), invalidateServerHealthCache: vi.fn() }));
vi.mock('@/core/connectionStateEvents', () => ({ getMobileConnectionContextGeneration: () => 1, invalidateMobileConnectionContext: vi.fn(), recordMobileConnectionOutcome: vi.fn() }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/repositories/outboxRepository', () => ({ markPendingOutboxCommandsAuthRequired: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: async () => {} }));
vi.mock('@/api/networkTimeout', async importOriginal => ({ ...await importOriginal<object>(), fetchWithTimeout: s.fetch }));

import { fetchAppUpdateManifest } from '@/api/appUpdateApi';
import { MobileHttpError, mobileRequest } from '@/api/httpClient';
import { subscribeToServerAppUpdateRequired } from '@/services/appUpdate/appUpdateEvents';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

beforeEach(() => {
  s.fetch.mockReset();
});

it('every mobile request reports the installed versionCode', async () => {
  s.fetch.mockResolvedValue(json({}));
  await mobileRequest('/api/v1/mobile/bootstrap', z.unknown());
  const [, init] = s.fetch.mock.calls[0];
  expect(init.headers).toMatchObject({ 'X-Mobile-App-Version-Code': '52', 'X-Mobile-Sync-Protocol': '1.0' });
});

it('a 426 from the server surfaces its Russian message and raises the update gate', async () => {
  const listener = vi.fn();
  const unsubscribe = subscribeToServerAppUpdateRequired(listener);
  s.fetch.mockResolvedValue(json(contract.updateRequired, 426));

  const error = await mobileRequest('/api/v1/mobile/bootstrap', z.unknown()).catch((caught) => caught);

  unsubscribe();
  expect(error).toBeInstanceOf(MobileHttpError);
  expect(error).toMatchObject({ status: 426, message: contract.updateRequired.detail });
  expect(listener).toHaveBeenCalledTimes(1);
});

it('parses the manifest the server publishes, anonymously and for this contour', async () => {
  s.fetch.mockResolvedValue(json(contract.manifest));

  const result = await fetchAppUpdateManifest();

  expect(result).toEqual({ apiBaseUrl: 'https://192.168.2.194', manifest: { ...contract.manifest } });
  const [url, init] = s.fetch.mock.calls[0];
  expect(url).toBe('https://192.168.2.194/api/v1/mobile/app-update?contourId=patrol360-local-enterprise');
  expect(init.headers.Authorization).toBeUndefined();
});

it('a server without a published release (or without the endpoint) means nothing to install', async () => {
  s.fetch.mockResolvedValue(json({ code: 'app_update_not_published' }, 404));
  await expect(fetchAppUpdateManifest()).resolves.toEqual({ apiBaseUrl: 'https://192.168.2.194', manifest: null });
});

it('rejects a manifest whose hash is not a SHA-256 digest', async () => {
  s.fetch.mockResolvedValue(json({ ...contract.manifest, sha256: 'md5:123' }));
  await expect(fetchAppUpdateManifest()).rejects.toThrow();
});
