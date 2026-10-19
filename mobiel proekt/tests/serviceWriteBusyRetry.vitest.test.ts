import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll, type QueryHook } from './support/realDatabase';

// Service writes (sign-out queue, upload bookkeeping) meet SQLITE_BUSY while a sync transaction
// holds the database. They are retried instead of failing, and a retried write is applied once.
// That every such write goes through withSqliteBusyRetry is enforced by eslint.config.js.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `logout-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: DatabaseSync;
let hooks: { beforeWrite: QueryHook | null };
beforeEach(async () => {
  vi.resetModules(); session.uuid = 0;
  ({ raw, hooks } = await openRealDatabase());
});
afterEach(() => raw.close());

function lockNextWrites(times: number, table: string) {
  let left = times;
  hooks.beforeWrite = sql => {
    if (left > 0 && sql.includes(table)) { left--; throw new Error('database is locked (code 5 SQLITE_BUSY)'); }
  };
}

it('a sign-out intent survives a busy database and is stored once under its own id', async () => {
  lockNextWrites(2, 'mobile_logout_queue');
  const { enqueueLogoutIntent, getPendingLogoutContourId } = await import('@/db/repositories/logoutQueueRepository');

  await enqueueLogoutIntent('alice');

  expect(selectAll(raw, 'SELECT id, owner_user_id, contour_id, status FROM mobile_logout_queue')).toEqual([
    { id: 'logout-1', owner_user_id: 'alice', contour_id: 'test', status: 'pending' }
  ]);
  expect(await getPendingLogoutContourId()).toBe('test');
});

it('an upload attempt is counted once even when its bookkeeping write had to be retried', async () => {
  raw.prepare(`INSERT INTO files(client_file_id, owner_user_id, contour_id, local_path, status, created_at_local)
    VALUES ('f1', 'alice', 'test', 'file:///f1.jpg', 'localOnly', '2026-10-19')`).run();
  lockNextWrites(1, 'UPDATE files');
  const { markFileUploading } = await import('@/db/repositories/filesRepository');

  await markFileUploading('f1');

  expect(selectAll(raw, "SELECT status, attempt_count FROM files WHERE client_file_id = 'f1'")).toEqual([{ status: 'uploading', attempt_count: 1 }]);
});

it('a write that is not blocked by another connection fails at once', async () => {
  hooks.beforeWrite = sql => { if (sql.includes('mobile_logout_queue')) throw new Error('no such table: mobile_logout_queue'); };
  const { enqueueLogoutIntent } = await import('@/db/repositories/logoutQueueRepository');

  await expect(enqueueLogoutIntent('alice')).rejects.toThrow('no such table');
});
