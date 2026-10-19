import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { unreadBadgeLabel } from '@/features/profile/useUnreadNotificationCount';
import { openRealDatabase, selectAll } from './support/realDatabase';

// Unread count and "Прочитать все" on the real schema. The server has only the per-item read
// endpoint, so mark-all commits every local read first and acknowledges each one the same way a
// single tap does. Undelivered reads stay pending, survive a refresh that still says unread, and
// are delivered by the next connected notification sync. Other owners are never touched.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0 }));
const api = vi.hoisted(() => ({ mobileRequest: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner, getAccessToken: async () => 'token' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: async () => 'device' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('@/api/httpClient', () => ({ mobileRequest: api.mobileRequest }));
vi.mock('expo-notifications', () => ({ setNotificationHandler: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

let raw: DatabaseSync;
const serverRead = new Map<string, string>();
const readCalls: string[] = [];
let online = true;
const notification = (id: string, readAt: string | null = null, createdAt = `2026-10-1${id[1]}T08:00:00Z`) => ({
  id, type: 'patrolAssigned', title: `Уведомление ${id}`, message: 'Назначен обход', entityType: null, entityId: null, createdAt, readAt
});

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; online = true; serverRead.clear(); readCalls.length = 0;
  api.mobileRequest.mockReset();
  api.mobileRequest.mockImplementation(async (path: string) => {
    if (!online) throw new Error('Network request failed');
    const read = /\/notifications\/([^/]+)\/read$/.exec(path);
    if (read) {
      readCalls.push(read[1]);
      serverRead.set(read[1], `2026-10-19T10:00:0${serverRead.size}Z`);
      return notification(read[1], serverRead.get(read[1])!);
    }
    if (path.startsWith('/api/v1/mobile/notifications')) return ['n1', 'n2', 'n3'].map(id => notification(id, serverRead.get(id) ?? null));
    throw new Error(`unexpected ${path}`);
  });
  ({ raw } = await openRealDatabase());
  const insert = raw.prepare(`INSERT INTO mobile_notifications(notification_id, owner_user_id, notification_type, title, message, created_at, read_at, read_sync_pending)
    VALUES (?, ?, 'patrolAssigned', ?, 'Назначен обход', ?, ?, 0)`);
  insert.run('n1', 'alice', 'n1', '2026-10-11T08:00:00Z', null);
  insert.run('n2', 'alice', 'n2', '2026-10-12T08:00:00Z', null);
  insert.run('n3', 'alice', 'n3', '2026-10-13T08:00:00Z', null);
  insert.run('old', 'alice', 'old', '2026-09-01T08:00:00Z', '2026-09-02T08:00:00Z');
  insert.run('bob-1', 'bob', 'bob-1', '2026-10-14T08:00:00Z', null);
});
afterEach(() => raw.close());

const context = () => ({ ownerUserId: session.owner, contourId: 'test', generation: session.generation });
const rows = () => selectAll<{ id: string; readAt: string | null; pending: number }>(raw,
  'SELECT notification_id AS id, read_at AS readAt, read_sync_pending AS pending FROM mobile_notifications ORDER BY notification_id');

it('counts only the current owner\'s unread notifications', async () => {
  const repo = await import('@/db/repositories/notificationRepository');
  expect(await repo.countUnreadNotifications(context())).toBe(3);
  session.owner = 'bob';
  expect(await repo.countUnreadNotifications(context())).toBe(1);
  expect(unreadBadgeLabel(0)).toBeNull();
  expect(unreadBadgeLabel(null)).toBeNull();
  expect(unreadBadgeLabel(7)).toBe('7');
  expect(unreadBadgeLabel(140)).toBe('99+');
});

it('marks all unread notifications read and acknowledges each one on the server', async () => {
  const service = await import('@/services/notificationService');
  const repo = await import('@/db/repositories/notificationRepository');

  const result = await service.markAllMobileNotificationsRead();

  expect(result).toEqual({ marked: 3, delivered: 3, pending: 0 });
  expect(readCalls.sort()).toEqual(['n1', 'n2', 'n3']);
  expect(await repo.countUnreadNotifications(context())).toBe(0);
  const byId = Object.fromEntries(rows().map(row => [row.id, row]));
  for (const id of ['n1', 'n2', 'n3']) expect(byId[id]).toEqual({ id, readAt: serverRead.get(id), pending: 0 });
  expect(byId.old).toEqual({ id: 'old', readAt: '2026-09-02T08:00:00Z', pending: 0 });
  expect(byId['bob-1']).toEqual({ id: 'bob-1', readAt: null, pending: 0 });

  // Nothing left to mark: no further requests.
  expect(await service.markAllMobileNotificationsRead()).toEqual({ marked: 0, delivered: 0, pending: 0 });
  expect(readCalls).toHaveLength(3);
});

it('offline: reads stay local and pending, survive a refresh, and are delivered by the next sync', async () => {
  online = false;
  const service = await import('@/services/notificationService');
  const repo = await import('@/db/repositories/notificationRepository');

  const result = await service.markAllMobileNotificationsRead();

  expect(result).toEqual({ marked: 3, delivered: 0, pending: 3 });
  // Stops after the first failed request instead of waiting for every timeout.
  expect(api.mobileRequest).toHaveBeenCalledTimes(1);
  expect(await repo.countUnreadNotifications(context())).toBe(0);
  expect(rows().filter(row => ['n1', 'n2', 'n3'].includes(row.id)).every(row => row.readAt !== null && row.pending === 1)).toBe(true);

  // A refresh whose server data still says unread does not make them unread again.
  await repo.saveNotifications(['n1', 'n2', 'n3'].map(id => notification(id, null)), context());
  expect(await repo.countUnreadNotifications(context())).toBe(0);

  online = true;
  await service.syncMobileNotifications();
  expect(readCalls.sort()).toEqual(['n1', 'n2', 'n3']);
  expect(rows().filter(row => ['n1', 'n2', 'n3'].includes(row.id)).map(row => row.pending)).toEqual([0, 0, 0]);
  expect(await repo.countUnreadNotifications(context())).toBe(0);
});

it('a changed session marks nothing for the new owner', async () => {
  const repo = await import('@/db/repositories/notificationRepository');
  const stale = context();
  session.owner = 'bob';

  await expect(repo.markAllLocalNotificationsRead('2026-10-19T10:00:00Z', stale)).rejects.toThrow();

  expect(rows().filter(row => row.readAt === null).map(row => row.id)).toEqual(['bob-1', 'n1', 'n2', 'n3']);
});
