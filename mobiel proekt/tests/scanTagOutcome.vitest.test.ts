import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// Behavior for wrong and unknown tags: a code of another point of the route, of another route,
// or of nothing on the phone is explained by name, and never writes a point result or command.
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

function seedAssignment(options: { assignmentId: string; routeId: string; routeName: string; owner?: string; status?: string; freeOrder?: boolean }) {
  const owner = options.owner ?? 'alice';
  raw.prepare('INSERT OR IGNORE INTO routes(route_id, name, version, nfc_enabled, qr_fallback_enabled) VALUES (?, ?, 1, 1, 1)').run(options.routeId, options.routeName);
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES (?, ?, ?, ?, '2026-10-19', 'inProgress', 1)`).run(`request-${options.assignmentId}`, owner, options.routeId, options.routeName);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
      route_version_no, snapshot_version, snapshot_allow_free_order, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
    VALUES (?, ?, 'test', ?, ?, ?, 1, 1, 1, ?, 1, 1)`)
    .run(options.assignmentId, owner, `request-${options.assignmentId}`, options.routeId, options.status ?? 'inProgress', options.freeOrder ? 1 : 0);
}

function seedPoint(assignmentId: string, routeId: string, pointId: string, name: string, orderIndex: number, nfc: string, qr: string) {
  raw.prepare(`INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index, nfc_uid_hash, qr_code_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(assignmentId, pointId, routeId, name, orderIndex, nfc, qr);
}

function seedStrictRoute() {
  seedAssignment({ assignmentId: 'assignment', routeId: 'route', routeName: 'Обход цеха' });
  seedPoint('assignment', 'route', 'gate', 'Ворота', 1, '04A1B2C3', 'qr-gate');
  seedPoint('assignment', 'route', 'store', 'Склад', 2, '04D4E5F6', 'qr-store');
}

const writes = () => ({
  results: selectAll(raw, 'SELECT point_id, status FROM point_results'),
  commands: selectAll(raw, 'SELECT command_type, entity_local_id FROM outbox_commands')
});

async function scan(method: 'nfc' | 'qr', code: string) {
  const patrol = await import('@/db/repositories/patrolRepository');
  const { resolveScanOutcome } = await import('@/features/patrol/scanOutcomeResolver');
  return resolveScanOutcome('assignment', method, [code], () => method === 'nfc'
    ? patrol.scanPointByNfc('assignment', [code])
    : patrol.scanPointByQr('assignment', code));
}

it.each([
  ['nfc', '04D4E5F6'],
  ['nfc', 'F6E5D404'],
  ['qr', 'qr-store']
] as const)('a %s code of a later point on a strict route names both points and confirms nothing (%s)', async (method, code) => {
  seedStrictRoute();
  const { presentScanOutcome } = await import('@/features/patrol/scanOutcome');

  const outcome = await scan(method, code);

  expect(outcome).toEqual({
    kind: 'wrongOrder',
    point: { pointId: 'store', name: 'Склад', orderIndex: 2 },
    requiredPoint: { pointId: 'gate', name: 'Ворота', orderIndex: 1 }
  });
  const view = presentScanOutcome(outcome, method);
  expect(view.message).toContain('2 «Склад»');
  expect(view.message).toContain('1 «Ворота»');
  expect(view.message + view.hint).not.toContain(code);
  expect(view).toMatchObject({ confirmsPoint: false, feedback: 'wrongTag', action: { pointId: 'gate', target: 'detail' } });
  expect(writes()).toEqual({ results: [], commands: [] });
});

it.each(['nfc', 'qr'] as const)('a %s code of another route of the same owner names that route and confirms nothing', async method => {
  seedStrictRoute();
  seedAssignment({ assignmentId: 'other', routeId: 'route-2', routeName: 'Обход склада', status: 'assigned' });
  seedPoint('other', 'route-2', 'far', 'Дальняя', 1, 'DEADBEEF', 'qr-far');
  const { presentScanOutcome } = await import('@/features/patrol/scanOutcome');

  const outcome = await scan(method, method === 'nfc' ? 'deadbeef' : 'qr-far');

  expect(outcome).toEqual({ kind: 'otherRoute', routeName: 'Обход склада' });
  const view = presentScanOutcome(outcome, method);
  expect(view.message).toContain('«Обход склада»');
  expect(view.message + view.hint).not.toMatch(/deadbeef|qr-far/i);
  expect(view).toMatchObject({ confirmsPoint: false, feedback: 'wrongTag', action: null });
  expect(writes()).toEqual({ results: [], commands: [] });
});

it('a code that only another owner\'s route carries stays unknown', async () => {
  seedStrictRoute();
  seedAssignment({ assignmentId: 'bob-route', routeId: 'route-3', routeName: 'Чужой обход', owner: 'bob' });
  seedPoint('bob-route', 'route-3', 'bob-point', 'Чужая точка', 1, 'CAFEBABE', 'qr-bob');

  expect(await scan('nfc', 'CAFEBABE')).toEqual({ kind: 'unknown' });
  expect(await scan('qr', 'qr-bob')).toEqual({ kind: 'unknown' });
  expect(writes()).toEqual({ results: [], commands: [] });
});

it.each(['nfc', 'qr'] as const)('an unknown %s code says so with a next step and confirms nothing', async method => {
  seedStrictRoute();
  const { presentScanOutcome } = await import('@/features/patrol/scanOutcome');

  const outcome = await scan(method, 'NOT-ON-PHONE');

  expect(outcome).toEqual({ kind: 'unknown' });
  const view = presentScanOutcome(outcome, method);
  expect(view.message).toMatch(/не найден/);
  expect(view.hint).toContain('Метка недоступна');
  expect(view.message + view.hint).not.toContain('NOT-ON-PHONE');
  expect(view.confirmsPoint).toBe(false);
  expect(writes()).toEqual({ results: [], commands: [] });
});

it('the expected point confirms once; a repeat is reported as already marked without a second command', async () => {
  seedStrictRoute();

  expect(await scan('nfc', '04A1B2C3')).toEqual({ kind: 'confirmed', point: { pointId: 'gate', name: 'Ворота', orderIndex: 1 } });
  expect(await scan('nfc', '04A1B2C3')).toEqual({ kind: 'alreadyScanned', point: { pointId: 'gate', name: 'Ворота', orderIndex: 1 } });

  expect(writes()).toEqual({
    results: [{ point_id: 'gate', status: 'scanned' }],
    commands: [{ command_type: 'scanPatrolPointNfc', entity_local_id: 'gate' }]
  });
});

it('a free-order route still confirms any point of the route directly', async () => {
  seedAssignment({ assignmentId: 'assignment', routeId: 'route', routeName: 'Обход цеха', freeOrder: true });
  seedPoint('assignment', 'route', 'gate', 'Ворота', 1, '04A1B2C3', 'qr-gate');
  seedPoint('assignment', 'route', 'store', 'Склад', 2, '04D4E5F6', 'qr-store');

  expect(await scan('qr', 'qr-store')).toMatchObject({ kind: 'confirmed', point: { pointId: 'store' } });
});
