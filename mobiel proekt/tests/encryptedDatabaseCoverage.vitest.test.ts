import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ open: vi.fn(), remove: vi.fn(), encryptedExists: true }));
vi.mock('expo-crypto', () => ({}));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => '0'.repeat(64) }));
vi.mock('expo-file-system/legacy', () => ({ getInfoAsync: async (path: string) => ({ exists: !path.includes('encrypted') || s.encryptedExists }), deleteAsync: s.remove }));
vi.mock('expo-sqlite', () => ({ defaultDatabaseDirectory: '/db', openDatabaseAsync: s.open }));
import { openProtectedDatabase } from '@/db/encryptedDatabase';

let encrypted: DatabaseSync;
let legacy: DatabaseSync;
function adapter(raw: DatabaseSync) {
  return {
    execAsync: async (sql: string) => { if (!sql.includes('sqlcipher_export')) raw.exec(sql); },
    getAllAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).all(...args),
    getEachAsync: async function* (sql: string) { yield* raw.prepare(sql).iterate(); },
    getFirstAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).get(...args) ?? null,
    closeAsync: async () => {}
  };
}
beforeEach(() => {
  s.remove.mockReset(); s.open.mockReset(); s.encryptedExists = true;
  encrypted = new DatabaseSync(':memory:'); legacy = new DatabaseSync(':memory:');
  for (const db of [encrypted, legacy]) db.exec('CREATE TABLE schema_migrations(version TEXT); CREATE TABLE users(id TEXT);');
  s.open.mockImplementation(async (name: string) => adapter(name.includes('encrypted') ? encrypted : legacy));
});
afterEach(() => { encrypted.close(); legacy.close(); });
it('keeps the legacy database when a newer draft table lost a row', async () => {
  for (const db of [encrypted, legacy]) db.exec('CREATE TABLE work_drafts(id TEXT);');
  legacy.exec("INSERT INTO work_drafts VALUES ('offline-draft');");
  await openProtectedDatabase();
  expect(s.remove).not.toHaveBeenCalled();
});
it('keeps an empty legacy table that is missing entirely from the encrypted copy', async () => {
  legacy.exec('CREATE TABLE new_local_table(id TEXT);');
  await openProtectedDatabase();
  expect(s.remove).not.toHaveBeenCalled();
});
it('allows cleanup only after every application table has matching counts', async () => {
  for (const db of [encrypted, legacy]) db.exec('CREATE TABLE "work""drafts"(id TEXT); INSERT INTO "work""drafts" VALUES (\'draft\');');
  await openProtectedDatabase();
  expect(s.remove.mock.calls.map(call => call[0])).toEqual(['file:///db/patrol360-mobile.db', 'file:///db/patrol360-mobile.db-wal', 'file:///db/patrol360-mobile.db-shm']);
});

it('preserves legacy records when counts match but an offline comment was changed', async () => {
  for (const db of [encrypted, legacy]) db.exec('CREATE TABLE point_drafts(id TEXT PRIMARY KEY, comment TEXT);');
  legacy.exec("INSERT INTO point_drafts VALUES ('point', 'Важное замечание');");
  encrypted.exec("INSERT INTO point_drafts VALUES ('point', '');");
  await openProtectedDatabase();
  expect(s.remove).not.toHaveBeenCalled();
});

it('compares every page and blob, independent of insertion order', async () => {
  for (const db of [encrypted, legacy]) db.exec('CREATE TABLE local_records(id INTEGER, bytes BLOB);');
  for (let i = 0; i < 520; i++) {
    legacy.prepare('INSERT INTO local_records VALUES (?, ?)').run(i, new Uint8Array([i % 256]));
    encrypted.prepare('INSERT INTO local_records VALUES (?, ?)').run(519 - i, new Uint8Array([(519 - i) % 256]));
  }
  await openProtectedDatabase();
  expect(s.remove).toHaveBeenCalledTimes(3);
  s.remove.mockClear();
  encrypted.exec("UPDATE local_records SET bytes = x'FFFF' WHERE id = 519;");
  await openProtectedDatabase();
  expect(s.remove).not.toHaveBeenCalled();
});

it('failed legacy sidecar cleanup never removes a verified encrypted database', async () => {
  s.encryptedExists = false;
  s.remove.mockImplementation(async (path: string) => {
    if (path === 'file:///db/patrol360-mobile.db-shm') throw Error('Cleanup locked');
  });
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Native sqlcipher_export is mocked; both real SQLite copies contain the
  // same schema/data. This test exercises the post-verification deletion boundary.
  try {
    await expect(openProtectedDatabase()).resolves.toBeTruthy();
    expect(s.remove.mock.calls.filter(call => call[0] === 'file:///db/patrol360-mobile-encrypted.db')).toHaveLength(1);
  } finally {
    warning.mockRestore();
  }
});
