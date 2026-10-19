import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

const s = vi.hoisted(() => ({ stored: new Map<string, string>(), fetch: vi.fn() }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => s.stored.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { s.stored.set(key, value); }
}));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice', getAccessToken: async () => 'token' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 1, advanceSessionGeneration: () => 2 }));
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: async () => 'device' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/core/serverSettings', () => ({
  getMobileRuntimeConfig: async () => ({ apiBaseUrl: 'https://test', contourId: 'test', syncProtocolVersion: '1' }),
  getServerCandidateBaseUrls: async () => ['https://test'], setServerBaseUrl: async () => {}
}));
vi.mock('@/api/serverHealthApi', () => ({ probeServerHealthCached: async () => ({ ok: true }), invalidateServerHealthCache: vi.fn() }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/repositories/outboxRepository', () => ({ markPendingOutboxCommandsAuthRequired: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: async () => {} }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/api/networkTimeout', async importOriginal => ({ ...await importOriginal<object>(), fetchWithTimeout: s.fetch }));

import {
  CLOCK_SKEW_WARNING_MS,
  computeClockOffsetSample,
  describeClockSkew,
  getClockOffsetSnapshot,
  isClockSkewSignificant,
  observeServerClock,
  readServerTime,
  resetClockOffsetForTests,
  restoreClockOffset
} from '@/core/clockOffset';
import { mobileRequest } from '@/api/httpClient';
import { clockSkewWarningText } from '@/ui/ClockSkewNotice';

const minute = 60_000;
const at = (iso: string) => Date.parse(iso);
let wall = 0;
let monotonic = 0;

beforeEach(() => {
  s.stored.clear();
  s.fetch.mockReset();
  wall = at('2026-10-19T09:00:00Z');
  monotonic = 1_000;
  resetClockOffsetForTests({ now: () => wall, monotonic: () => monotonic });
});

const headers = (values: Record<string, string>) => (name: string) => values[name] ?? null;

it('offset is server time minus the midpoint of the round trip', () => {
  expect(computeClockOffsetSample({
    requestStartedAt: at('2026-10-19T09:00:00Z'),
    responseReceivedAt: at('2026-10-19T09:00:02Z'),
    serverTimeMs: at('2026-10-19T09:07:01Z')
  })).toEqual({ offsetMs: 7 * minute, roundTripMs: 2_000, measuredAt: '2026-10-19T09:00:02.000Z' });

  // A negative or very slow round trip gives no usable sample.
  expect(computeClockOffsetSample({ requestStartedAt: 10, responseReceivedAt: 5, serverTimeMs: 0 })).toBeNull();
  expect(computeClockOffsetSample({ requestStartedAt: 0, responseReceivedAt: 31_000, serverTimeMs: 0 })).toBeNull();
});

it('reads X-Server-Now first and falls back to the standard Date header', () => {
  expect(readServerTime(headers({ 'X-Server-Now': '2026-10-19T09:00:00.250Z', Date: 'Mon, 19 Oct 2026 08:00:00 GMT' })))
    .toBe(at('2026-10-19T09:00:00.250Z'));
  expect(readServerTime(headers({ Date: 'Mon, 19 Oct 2026 08:00:00 GMT' }))).toBe(at('2026-10-19T08:00:00Z'));
  expect(readServerTime(headers({ 'X-Server-Now': 'garbage' }))).toBeNull();
  expect(readServerTime(headers({}))).toBeNull();
});

it('warns only beyond the threshold, in either direction', () => {
  expect(CLOCK_SKEW_WARNING_MS).toBe(3 * minute);
  expect(isClockSkewSignificant(3 * minute)).toBe(false);
  expect(isClockSkewSignificant(-3 * minute)).toBe(false);
  expect(isClockSkewSignificant(3 * minute + 1)).toBe(true);
  expect(isClockSkewSignificant(-(3 * minute + 1))).toBe(true);
  expect(isClockSkewSignificant(null)).toBe(false);
  expect(describeClockSkew(7 * minute)).toBe('Часы телефона отстают на 7 мин.');
  expect(describeClockSkew(-(2 * 60 + 5) * minute)).toBe('Часы телефона спешат на 2 ч 5 мин.');
  expect(clockSkewWarningText(-60 * minute)).toMatch(/^Часы телефона спешат на 1 ч\. Время в отчётах обхода/);
});

it('follows a phone clock change after the sample through the monotonic clock', () => {
  observeServerClock(headers({ 'X-Server-Now': '2026-10-19T09:10:00Z' }), wall, wall);
  expect(getClockOffsetSnapshot()?.offsetMs).toBe(10 * minute);

  // Five minutes pass; the guard then sets the phone clock right.
  monotonic += 5 * minute;
  wall += 5 * minute;
  expect(getClockOffsetSnapshot()?.offsetMs).toBe(10 * minute);
  wall += 10 * minute;
  expect(getClockOffsetSnapshot()?.offsetMs).toBe(0);
});

it('a recent sample with a faster round trip is kept over a slower one', () => {
  observeServerClock(headers({ 'X-Server-Now': '2026-10-19T09:05:00Z' }), wall - 200, wall);
  observeServerClock(headers({ 'X-Server-Now': '2026-10-19T09:00:00Z' }), wall - 8_000, wall);
  expect(getClockOffsetSnapshot()?.roundTripMs).toBe(200);
  monotonic += 2 * minute;
  observeServerClock(headers({ 'X-Server-Now': '2026-10-19T09:00:00Z' }), wall - 8_000, wall);
  expect(getClockOffsetSnapshot()?.roundTripMs).toBe(8_000);
});

it('the last sample survives a restart and expires after three days', async () => {
  observeServerClock(headers({ 'X-Server-Now': '2026-10-19T09:30:00Z' }), wall, wall);
  await vi.waitFor(() => expect(s.stored.size).toBe(1));

  resetClockOffsetForTests({ now: () => wall, monotonic: () => monotonic });
  expect(getClockOffsetSnapshot()).toBeNull();
  await restoreClockOffset();
  expect(getClockOffsetSnapshot()).toMatchObject({ offsetMs: 30 * minute, measuredAt: '2026-10-19T09:00:00.000Z' });

  wall += 73 * 60 * minute;
  resetClockOffsetForTests({ now: () => wall, monotonic: () => monotonic });
  await restoreClockOffset();
  expect(getClockOffsetSnapshot()).toBeNull();
});

it('mobile requests send the phone time and learn the offset from the response', async () => {
  resetClockOffsetForTests();
  s.fetch.mockImplementation(async () => new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Server-Now': new Date(Date.now() - 6 * minute).toISOString() }
  }));

  await mobileRequest('/api/v1/mobile/bootstrap', z.unknown());

  const sentHeaders = s.fetch.mock.calls[0][1].headers as Record<string, string>;
  expect(Math.abs(Date.parse(sentHeaders['X-Client-Now']) - Date.now())).toBeLessThan(5_000);
  const offset = getClockOffsetSnapshot();
  expect(offset!.offsetMs).toBeGreaterThan(-6 * minute - 5_000);
  expect(offset!.offsetMs).toBeLessThan(-6 * minute + 5_000);
  expect(isClockSkewSignificant(offset!.offsetMs)).toBe(true);
});

it('a response from an older server without clock headers changes nothing', async () => {
  resetClockOffsetForTests();
  s.fetch.mockImplementation(async () => new Response('{}', { status: 200 }));
  await mobileRequest('/api/v1/mobile/bootstrap', z.unknown());
  expect(getClockOffsetSnapshot()).toBeNull();
});
