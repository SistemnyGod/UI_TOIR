import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// Behavior for the assignment scan policy: a disabled NFC/QR method is refused before any
// point result or outbox command is written; an allowed scan writes exactly one of each.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('react-native-nfc-manager', () => ({ default: {}, NfcAdapter: {}, NfcEvents: {}, NfcTech: {} }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: DatabaseSync;

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  ({ raw } = await openRealDatabase());
});
afterEach(() => raw.close());

function seedRunningPatrol(policy: { nfc: boolean; qr: boolean }, owner = 'alice') {
  const nfc = policy.nfc ? 1 : 0;
  const qr = policy.qr ? 1 : 0;
  raw.prepare('INSERT INTO routes(route_id, name, version, nfc_enabled, qr_fallback_enabled) VALUES (\'route\', \'Route\', 1, ?, ?)').run(nfc, qr);
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES ('request', ?, 'route', 'Route', '2026-10-19', 'inProgress', 1)`).run(owner);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
      route_version_no, snapshot_version, snapshot_allow_free_order, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
    VALUES ('assignment', ?, 'test', 'request', 'route', 'inProgress', 1, 1, 1, 1, ?, ?)`).run(owner, nfc, qr);
  raw.exec(`INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index, nfc_uid_hash, qr_code_hash)
    VALUES ('assignment', 'point', 'route', 'Point', 1, '04A1B2C3', 'qr-point')`);
}
const writes = () => ({
  results: selectAll(raw, 'SELECT point_id, status, confirmation_type FROM point_results'),
  commands: selectAll(raw, 'SELECT command_type, entity_local_id FROM outbox_commands')
});

it('refuses an NFC scan when the assignment policy disables NFC, before writing anything', async () => {
  seedRunningPatrol({ nfc: false, qr: true });
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.scanPointByNfc('assignment', '04A1B2C3')).rejects.toThrow('NFC-подтверждение для этого маршрута отключено');

  expect(writes()).toEqual({ results: [], commands: [] });
});

it('refuses a QR scan when the assignment policy disables the QR fallback, before writing anything', async () => {
  seedRunningPatrol({ nfc: true, qr: false });
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.scanPointByQr('assignment', 'qr-point')).rejects.toThrow('QR-подтверждение для этого маршрута отключено');

  expect(writes()).toEqual({ results: [], commands: [] });
});

it.each([
  ['nfc', 'scanPatrolPointNfc'],
  ['qr', 'scanPatrolPointQr']
] as const)('an allowed %s scan writes one result and one command, and a repeat reuses them', async (method, commandType) => {
  seedRunningPatrol({ nfc: true, qr: true });
  const patrol = await import('@/db/repositories/patrolRepository');
  const scan = () => method === 'nfc' ? patrol.scanPointByNfc('assignment', '04A1B2C3') : patrol.scanPointByQr('assignment', 'qr-point');

  expect(await scan()).toMatchObject({ matched: true, point: { pointId: 'point', status: 'scanned' } });
  expect(await scan()).toMatchObject({ matched: true, alreadyScanned: true });

  expect(writes()).toEqual({
    results: [{ point_id: 'point', status: 'scanned', confirmation_type: method }],
    commands: [{ command_type: commandType, entity_local_id: 'point' }]
  });
});

it('does not let another local account scan into the assignment', async () => {
  seedRunningPatrol({ nfc: true, qr: true }, 'bob');
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.scanPointByNfc('assignment', '04A1B2C3')).rejects.toThrow();
  await expect(patrol.scanPointByQr('assignment', 'qr-point')).rejects.toThrow();

  expect(writes()).toEqual({ results: [], commands: [] });
});

it('does not scan into an assignment stored for another contour', async () => {
  seedRunningPatrol({ nfc: true, qr: true });
  raw.exec("UPDATE patrol_assignments SET contour_id = 'other'");
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.scanPointByNfc('assignment', '04A1B2C3')).rejects.toThrow();
  await expect(patrol.scanPointByQr('assignment', 'qr-point')).rejects.toThrow();

  expect(writes()).toEqual({ results: [], commands: [] });
});
