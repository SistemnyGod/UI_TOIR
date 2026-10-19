import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ owner: 'a', db: null as unknown as DatabaseSync, changeOnWrite: false }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/database', () => {
  const adapter = {
    getAllAsync: async (sql: string, params: any[]) => state.db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: any[]) => state.db.prepare(sql).get(...params),
    runAsync: async (sql: string, params: any[]) => { const result = state.db.prepare(sql).run(...params); if (state.changeOnWrite) state.owner = 'b'; return result; }
  };
  return { getDatabase: async () => adapter,
    withProtectedExclusiveTransactionAsync: async (_db: unknown, write: (tx: typeof adapter) => Promise<unknown>) => {
      state.db.exec('BEGIN');
      try { const result = await write(adapter); state.db.exec('COMMIT'); return result; }
      catch (error) { state.db.exec('ROLLBACK'); throw error; }
    }
  };
});
import { saveDevicePushToken, saveNotifications, markLocalNotificationRead } from '@/db/repositories/notificationRepository';
import { captureDataOwnerContext } from '@/auth/dataOwnerContext';
beforeEach(() => {
  state.owner = 'a'; state.changeOnWrite = false; state.db = new DatabaseSync(':memory:');
  state.db.exec(`CREATE TABLE mobile_notifications(notification_id TEXT PRIMARY KEY, owner_user_id TEXT, notification_type TEXT,
    title TEXT, message TEXT, entity_type TEXT, entity_id TEXT, created_at TEXT, read_at TEXT, read_sync_pending INTEGER)`);
  state.db.exec("CREATE TABLE devices(device_id TEXT PRIMARY KEY, push_token TEXT); INSERT INTO devices VALUES ('device', NULL)");
});
afterEach(() => state.db.close());
const notification = { id: 'id', type: 'patrol', title: 'Назначение', message: 'Маршрут', entityType: 'request', entityId: 'request', createdAt: '2026-09-30', readAt: null };
it('does not rewrite an unchanged device token and rolls back a stale owner write', async () => {
  const context = await captureDataOwnerContext();
  await saveDevicePushToken('device', 'confirmed', context);
  const changes = state.db.prepare('SELECT total_changes() AS count').get()?.count;
  await saveDevicePushToken('device', 'confirmed', context);
  expect(state.db.prepare('SELECT total_changes() AS count').get()?.count).toBe(changes);
  state.changeOnWrite = true;
  await expect(saveDevicePushToken('device', 'stale', context)).rejects.toThrow('Устаревший');
  expect(state.db.prepare('SELECT push_token FROM devices').get()?.push_token).toBe('confirmed');
});
it('does not rewrite unchanged notifications or lose a pending local read', async () => {
  const context = await captureDataOwnerContext();
  expect(await saveNotifications([notification], context)).toBe(true);
  expect(await saveNotifications([notification], context)).toBe(false);
  await markLocalNotificationRead('id', '2026-09-30T01:00:00Z', true, context);
  expect(await saveNotifications([notification], context)).toBe(false);
  expect(await saveNotifications([{ ...notification, title: 'Изменено' }], context)).toBe(true);
  expect(state.db.prepare('SELECT read_at, read_sync_pending FROM mobile_notifications').get()).toMatchObject({ read_at: '2026-09-30T01:00:00Z', read_sync_pending: 1 });
});
it('rolls back notification inserts when the account changes before commit', async () => {
  const context = await captureDataOwnerContext(); state.changeOnWrite = true;
  await expect(saveNotifications([notification], context)).rejects.toThrow('Устаревший');
  expect(state.db.prepare('SELECT COUNT(*) AS count FROM mobile_notifications').get()?.count).toBe(0);
});
it('retains a local read marker and rolls back stale read acknowledgements', async () => {
  const context = await captureDataOwnerContext();
  await saveNotifications([notification], context);
  await markLocalNotificationRead('id', '2026-09-30T01:00:00Z', true, context);
  await saveNotifications([notification], context);
  state.changeOnWrite = true;
  await expect(markLocalNotificationRead('id', '2026-09-30T02:00:00Z', false, context)).rejects.toThrow('Устаревший');
  expect(state.db.prepare('SELECT read_at, read_sync_pending FROM mobile_notifications').get()).toMatchObject({ read_at: '2026-09-30T01:00:00Z', read_sync_pending: 1 });
});
