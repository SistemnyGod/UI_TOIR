import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: DatabaseSync;
let directory: string;
let databaseFile: string;
let afterWrite: ((sql: string) => void) | null = null;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  directory = mkdtempSync(join(tmpdir(), 'patrol-mobile-db-test-'));
  databaseFile = join(directory, 'test.sqlite');
  raw = new DatabaseSync(databaseFile);
  afterWrite = null;
  const adapter = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    getAllAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).all(...args),
    getFirstAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).get(...args) ?? null,
    runAsync: async (sql: string, args: never[] = []) => { const result = raw.prepare(sql).run(...args); afterWrite?.(sql); return result; },
    closeAsync: async () => {}
  };
  const storage = await import('@/db/encryptedDatabase');
  vi.mocked(storage.openProtectedDatabase).mockResolvedValue(adapter as never);
  vi.mocked(storage.openProtectedDatabaseConnection).mockResolvedValue(adapter as never);
  await (await import('@/db/database')).initializeDatabase();
});
afterEach(() => { raw.close(); unlinkSync(databaseFile); rmdirSync(directory); });

function payload() {
  const route = (version: number) => ({ routeId: 'route', version, name: `Version ${version}`, allowFreeOrder: false, nfcEnabled: true, qrFallbackEnabled: false });
  const point = (revision: number) => ({ pointId: `point-${revision}`, routeId: 'route', revision, name: `Point ${revision}`, orderIndex: 1, nfcUidHash: null, qrCodeHash: null, required: true, requiresPhoto: false, description: null, instruction: `Instruction ${revision}` });
  return {
    user: { serverUserId: 'alice', fullName: 'Alice', roles: [], permissions: [], updatedAtServer: '2026-10-16T00:00:00Z' },
    device: { deviceId: 'device', ownerUserId: 'alice', trusted: true, blockedAt: null },
    boundEmployees: [{ employeeId: 'employee', fullName: 'Employee', position: null, department: null }],
    boundEmployeesComplete: true, emuSections: [], requestBoard: [],
    assignments: [1,2].map(version => ({ assignmentId: `assignment-${version}`, employeeId: 'employee', requestId: `request-${version}`, routeId: 'route', status: 'accepted', revision: 1, routeVersionNo: version, startedAtLocal: null, completedAtLocal: null, routeSnapshot: { route: route(version), points: [point(version)] } })),
    routes: [route(3)], points: [point(3)], serverTime: '2026-10-16T00:00:00Z', syncCursor: 'first', contourId: 'test', patrolSnapshotManifest: true
  };
}

it('persists two immutable assignment revisions separately from the current catalog on first bootstrap', async () => {
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');
  await saveBootstrap(payload() as never);
  expect(raw.prepare('SELECT assignment_id, point_id, revision, instruction FROM assignment_route_points ORDER BY assignment_id').all()).toEqual([
    expect.objectContaining({ assignment_id: 'assignment-1', point_id: 'point-1', revision: 1, instruction: 'Instruction 1' }),
    expect.objectContaining({ assignment_id: 'assignment-2', point_id: 'point-2', revision: 2, instruction: 'Instruction 2' })
  ]);
  expect(raw.prepare('SELECT snapshot_version, snapshot_ready FROM patrol_assignments ORDER BY assignment_id').all()).toEqual([
    expect.objectContaining({ snapshot_version: 1, snapshot_ready: 1 }),
    expect.objectContaining({ snapshot_version: 2, snapshot_ready: 1 })
  ]);
  expect(raw.prepare('SELECT point_id FROM route_points').all()).toEqual([expect.objectContaining({ point_id: 'point-3' })]);
  const next = payload(); next.syncCursor = 'second'; next.routes[0].version = 4; next.points[0].revision = 4;
  await saveBootstrap(next as never);
  expect(raw.prepare('SELECT snapshot_version FROM patrol_assignments ORDER BY assignment_id').all()).toEqual([
    expect.objectContaining({ snapshot_version: 1 }), expect.objectContaining({ snapshot_version: 2 })
  ]);
});

it('repairs an empty active snapshot from its assignment and preserves completed offline data', async () => {
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');
  await saveBootstrap(payload() as never);
  raw.exec("DELETE FROM assignment_route_points WHERE assignment_id='assignment-1'; UPDATE patrol_assignments SET status='inProgress', snapshot_version=99 WHERE assignment_id='assignment-1'");
  const next = payload(); next.syncCursor = 'repair'; next.assignments[0].status = 'inProgress';
  await saveBootstrap(next as never);
  expect(raw.prepare("SELECT snapshot_version,snapshot_ready FROM patrol_assignments WHERE assignment_id='assignment-1'").get()).toMatchObject({ snapshot_version: 1, snapshot_ready: 1 });
  raw.exec("UPDATE assignment_route_points SET instruction='Offline frozen instruction' WHERE assignment_id='assignment-1'");
  next.syncCursor = 'retain'; next.assignments[0].routeSnapshot.points[0].instruction = 'Late server change';
  await saveBootstrap(next as never);
  expect(raw.prepare("SELECT instruction FROM assignment_route_points WHERE assignment_id='assignment-1'").get()).toMatchObject({ instruction: 'Offline frozen instruction' });
});

it('a late older bootstrap cannot replace an accepted assignment snapshot', async () => {
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');
  const modern = payload();
  modern.assignments[0].revision = 5;
  modern.assignments[0].routeVersionNo = 2;
  modern.assignments[0].routeSnapshot = modern.assignments[1].routeSnapshot;
  await saveBootstrap(modern as never);
  const older = payload(); older.syncCursor = 'late-old';
  await saveBootstrap(older as never);
  expect(raw.prepare("SELECT revision,snapshot_version FROM patrol_assignments WHERE assignment_id='assignment-1'").get()).toMatchObject({ revision: 5, snapshot_version: 2 });
  expect(raw.prepare("SELECT point_id FROM assignment_route_points WHERE assignment_id='assignment-1'").get()).toMatchObject({ point_id: 'point-2' });
});
