import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

/** Not account data: the schema version and the pending server revoke of the signed-out session. */
const keptTables = ['schema_migrations', 'mobile_logout_queue'];

let raw: DatabaseSync;
let directory: string;
let databaseFile: string;

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice';
  directory = mkdtempSync(join(tmpdir(), 'patrol-signout-wipe-'));
  databaseFile = join(directory, 'test.sqlite');
  raw = new DatabaseSync(databaseFile);
  const adapter = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    getAllAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).all(...args),
    getFirstAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).get(...args) ?? null,
    runAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).run(...args),
    closeAsync: async () => {}
  };
  const storage = await import('@/db/encryptedDatabase');
  vi.mocked(storage.openProtectedDatabase).mockResolvedValue(adapter as never);
  vi.mocked(storage.openProtectedDatabaseConnection).mockResolvedValue(adapter as never);
  await (await import('@/db/database')).initializeDatabase();
});
afterEach(() => { raw.close(); unlinkSync(databaseFile); rmdirSync(directory); });

function tableNames() {
  return (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map(row => row.name);
}

function columns(table: string) {
  return raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[];
}

/** One row of alice's data in every table, whatever its columns are. */
function seedEveryTableForAlice() {
  for (const table of tableNames().filter(name => name !== 'schema_migrations')) {
    const cols = columns(table);
    const values = cols.map(col => {
      if (/owner_user_id|server_user_id|user_id/.test(col.name)) return 'alice';
      if (col.name === 'contour_id') return 'test';
      if (col.name === 'id' && table === 'auth_transition') return 1;
      return /INT|REAL|NUM/i.test(col.type) ? 1 : `alice-${table}-${col.name}`;
    });
    raw.prepare(`INSERT INTO ${table} (${cols.map(col => col.name).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...values);
  }
}

function rowsMentioningAlice() {
  return tableNames().filter(table => !keptTables.includes(table)).flatMap(table => {
    const textColumns = columns(table).map(col => col.name);
    const where = textColumns.map(name => `CAST(${name} AS TEXT) LIKE '%alice%'`).join(' OR ');
    return (raw.prepare(`SELECT * FROM ${table} WHERE ${where}`).all() as object[]).map(row => ({ table, row }));
  });
}

function bobBootstrap() {
  return {
    user: { serverUserId: 'bob', fullName: 'Bob', roles: [], permissions: [], updatedAtServer: '2026-10-19T00:00:00Z' },
    device: { deviceId: 'device', ownerUserId: 'bob', trusted: true, blockedAt: null },
    boundEmployees: [{ employeeId: 'employee-bob', fullName: 'Bob', position: null, department: null }],
    boundEmployeesComplete: true, emuSections: [], requestBoard: [], assignments: [],
    routes: [], points: [], serverTime: '2026-10-19T00:00:00Z', syncCursor: 'bob-cursor', contourId: 'test', patrolSnapshotManifest: true
  };
}

it('lists every account table of the schema for the sign-out wipe', async () => {
  const { ownerDataTableNames } = await import('@/db/repositories/bootstrapRepository');
  expect([...ownerDataTableNames, ...keptTables].sort()).toEqual(tableNames());
});

it('leaves no row of the signed-out owner in any account table', async () => {
  seedEveryTableForAlice();
  expect(rowsMentioningAlice().length).toBeGreaterThan(30);
  const { clearLocalUserData } = await import('@/db/repositories/bootstrapRepository');
  const { deletePatrolPhotoDirectory } = await import('@/services/fileStorageService');

  await clearLocalUserData();

  for (const table of tableNames().filter(name => !keptTables.includes(name))) {
    expect({ table, count: (raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count })
      .toEqual({ table, count: 0 });
  }
  expect(deletePatrolPhotoDirectory).toHaveBeenCalled();
});

it('shows a different employee signing in next none of the previous owner data', async () => {
  seedEveryTableForAlice();
  const repository = await import('@/db/repositories/bootstrapRepository');
  await repository.clearLocalUserData();

  session.owner = 'bob';
  await expect(repository.hasLocalUserData()).resolves.toBe(false);
  await repository.saveBootstrap(bobBootstrap() as never);

  expect(rowsMentioningAlice()).toEqual([]);
  expect(raw.prepare('SELECT server_user_id FROM users').all()).toEqual([{ server_user_id: 'bob' }]);
});
