import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll, type QueryHook } from './support/realDatabase';

// Behavior for local report submission and the patrol guards around it, on the real schema:
// the report is committed before background delivery, acceptance/repair cannot race into a
// second active assignment, lifecycle and completion commands are idempotent, NFC/QR/open
// follow route order without free order, a frozen snapshot ignores newer route versions,
// and missing completed-report attachments are detected by physical file and requeued.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
const disk = vi.hoisted(() => ({ files: {} as Record<string, { exists: boolean; size?: number }> }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({
  deletePatrolPhotoDirectory: vi.fn(),
  getLocalFileInfo: vi.fn(async (uri: string) => disk.files[uri] ?? { exists: false })
}));
vi.mock('react-native-nfc-manager', () => ({ default: {}, NfcAdapter: {}, NfcEvents: {}, NfcTech: {} }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: DatabaseSync;
let hooks: { afterRead: QueryHook | null };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  disk.files = {};
  ({ raw, hooks } = await openRealDatabase());
});
afterEach(() => raw.close());

type Seed = { status?: string; owner?: string; contour?: string; freeOrder?: number; routeVersion?: number; points?: number };
function seedPatrol(id: string, { status = 'inProgress', owner = 'alice', contour = 'test', freeOrder = 1, routeVersion = 1, points = 1 }: Seed = {}) {
  raw.prepare(`INSERT OR IGNORE INTO routes(route_id, name, version, allow_free_order, nfc_enabled, qr_fallback_enabled)
    VALUES ('route', 'Route', ?, ?, 1, 1)`).run(routeVersion, 1 - freeOrder);
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES (?, ?, 'route', 'Route', '2026-10-19', ?, 1)`).run(`request-${id}`, owner, status);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
      route_version_no, snapshot_version, snapshot_allow_free_order, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
    VALUES (?, ?, ?, ?, 'route', ?, 1, 1, 1, ?, 1, 1)`).run(id, owner, contour, `request-${id}`, status, freeOrder);
  for (let index = 1; index <= points; index++) {
    raw.prepare(`INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index, nfc_uid_hash, qr_code_hash)
      VALUES (?, ?, 'route', ?, ?, ?, ?)`).run(id, `point-${index}`, `Point ${index}`, index, `04A1B2C${index}`, `qr-${index}`);
  }
}
function seedResult(assignmentId: string, pointId: string, status: string, photos: string[] = [], owner = 'alice', contour = 'test') {
  raw.prepare(`INSERT INTO point_results(local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, sync_status,
      confirmation_type, completed_at_local, photo_client_file_ids_json)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 'nfc', '2026-10-19T00:00:00Z', ?)`)
    .run(`${assignmentId}:${pointId}`, owner, contour, assignmentId, pointId, status, JSON.stringify(photos));
}
function seedComplete(id: string, assignmentId: string, status: string, photos: string[] = [], contour = 'test') {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, aggregate_key, sequence_no)
    VALUES (?, 'alice', ?, 'completePatrolAssignment', 'patrolAssignment', ?, ?, '2026-10-19T00:00:00Z', ?, ?, 1)`)
    .run(id, contour, assignmentId, JSON.stringify({ assignmentId, pointResults: [{ pointId: 'point-1', photoClientFileIds: photos }] }),
      status, `patrolAssignment:${assignmentId}`);
}
function seedFile(clientFileId: string, assignmentId: string, physical: { exists: boolean; size?: number }) {
  raw.prepare(`INSERT INTO files(client_file_id, owner_user_id, contour_id, local_path, status, sha256, size_bytes, content_type, media_kind,
      assignment_id, point_id, created_at_local)
    VALUES (?, 'alice', 'test', ?, 'queued', 'sha', 100, 'image/jpeg', 'photo', ?, 'point-1', '2026-10-19')`)
    .run(clientFileId, `file:///${clientFileId}.jpg`, assignmentId);
  disk.files[`file:///${clientFileId}.jpg`] = physical;
}

const row = (sql: string, ...args: string[]) => raw.prepare(sql).get(...args) as Record<string, unknown>;
const assignment = (id: string) => row('SELECT status, owner_user_id, completed_at_local FROM patrol_assignments WHERE assignment_id = ?', id);
const boardStatus = (id: string) => row('SELECT status FROM patrol_request_board WHERE request_id = ?', `request-${id}`).status;
const commands = (type?: string) => selectAll<{ id: string; type: string; status: string }>(raw,
  `SELECT client_operation_id AS id, command_type AS type, status FROM outbox_commands ${type ? 'WHERE command_type = ?' : ''} ORDER BY rowid`,
  ...(type ? [type] : []));
const syncRequests = async () => vi.mocked((await import('@/sync/mutationSyncRequest')).requestSyncAfterMutation).mock.calls.length;

it('commits the report locally before starting background delivery and never waits for it', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  const { requestPatrolSync } = await import('@/sync/PatrolSyncCoordinator');
  const seenAtDelivery: unknown[] = [];
  vi.mocked(requestPatrolSync).mockImplementation(() => {
    seenAtDelivery.push(assignment('a').status, commands('completePatrolAssignment').length);
    return new Promise(() => {}) as never;
  });
  const { queuePatrolReport } = await import('@/features/patrol/reportSubmissionCoordinator');

  const queued = await queuePatrolReport('a');

  expect(queued).toMatchObject({ status: 'queued', alreadyQueued: false, clientOperationId: commands()[0].id });
  expect(requestPatrolSync).toHaveBeenCalledExactlyOnceWith({ mode: 'manualReport', assignmentId: 'a' });
  expect(seenAtDelivery).toEqual(['completedLocal', 1]);
  expect(await syncRequests()).toBe(0);
});

it('a failed delivery attempt does not undo or reject the locally committed report', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  const { requestPatrolSync } = await import('@/sync/PatrolSyncCoordinator');
  vi.mocked(requestPatrolSync).mockRejectedValue(new Error('offline'));
  const { queuePatrolReport } = await import('@/features/patrol/reportSubmissionCoordinator');

  const queued = await queuePatrolReport('a');

  await expect(queued.deliveryAttempt).resolves.toBeUndefined();
  expect(assignment('a').status).toBe('completedLocal');
  expect(commands()).toEqual([{ id: queued.clientOperationId, type: 'completePatrolAssignment', status: 'pending' }]);
});

function seedRequest(status = 'available') {
  raw.exec(`INSERT INTO routes(route_id, name, version) VALUES ('route', 'Route', 1);
    INSERT INTO route_points(point_id, route_id, name, order_index, revision) VALUES ('point-1', 'route', 'Point 1', 1, 1);`);
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES ('request', 'alice', 'route', 'Route', '2026-10-19', ?, 1)`).run(status);
}
const requestAssignments = () => selectAll(raw, "SELECT assignment_id, status FROM patrol_assignments WHERE request_id = 'request' ORDER BY assignment_id");

it('acceptance re-checks inside its transaction for another active assignment of the same request', async () => {
  seedRequest();
  hooks.afterRead = sql => {
    if (sql.includes('SELECT version, allow_free_order')) {
      hooks.afterRead = null;
      raw.exec(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision)
        VALUES ('concurrent', 'alice', 'test', 'request', 'route', 'accepted', 1)`);
    }
  };
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.acceptRequestLocally('request')).rejects.toThrow('Заявка уже принята на этом телефоне');

  expect(requestAssignments()).toEqual([{ assignment_id: 'concurrent', status: 'accepted' }]);
  expect(commands()).toEqual([]);
  expect(row("SELECT status FROM patrol_request_board WHERE request_id = 'request'").status).toBe('available');
});

it('a terminal assignment of the same request does not block a new acceptance', async () => {
  seedRequest();
  raw.exec(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision)
    VALUES ('old', 'alice', 'test', 'request', 'route', 'cancelled', 1)`);
  const patrol = await import('@/db/repositories/patrolRepository');

  const accepted = await patrol.acceptRequestLocally('request');

  expect(accepted.created).toBe(true);
  expect(requestAssignments()).toEqual([{ assignment_id: 'old', status: 'cancelled' }, { assignment_id: accepted.assignment.assignmentId, status: 'accepted' }]);
  expect(commands().map(command => command.type)).toEqual(['acceptPatrolRequest']);
});

it('accepting a server-assigned assignment does not treat that assignment as its own competitor', async () => {
  seedRequest('assigned');
  raw.exec(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision)
    VALUES ('server', 'alice', 'test', 'request', 'route', 'assigned', 1)`);
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.acceptRequestLocally('request')).toMatchObject({ created: false, assignment: { assignmentId: 'server', status: 'accepted' } });

  expect(requestAssignments()).toEqual([{ assignment_id: 'server', status: 'accepted' }]);
  expect(commands().map(command => command.type)).toEqual(['acceptPatrolRequest']);
});

it('reopening an invalid completed report returns the assignment and its board row to inProgress', async () => {
  seedPatrol('a', { status: 'completedLocal' });
  raw.exec("UPDATE patrol_assignments SET completed_at_local = '2026-10-19T01:00:00Z'");
  seedComplete('bad', 'a', 'rejected');
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.reopenInvalidCompletionReportLocally('a')).toEqual({ reopened: true });

  expect(assignment('a')).toMatchObject({ status: 'inProgress', completed_at_local: null });
  expect(boardStatus('a')).toBe('inProgress');
  expect(commands()).toEqual([{ id: 'bad', type: 'completePatrolAssignment', status: 'superseded' }]);
});

it('report repair does not reopen a board row when the assignment was already finalized', async () => {
  seedPatrol('a', { status: 'completedServer' });
  seedComplete('bad', 'a', 'rejected');
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.reopenInvalidCompletionReportLocally('a')).toEqual({ reopened: false });

  expect(assignment('a').status).toBe('completedServer');
  expect(boardStatus('a')).toBe('completedServer');
});

it.each([
  ['another owner', { owner: 'bob' }],
  ['another contour', { contour: 'other' }]
] as const)('completion does not touch an assignment stored for %s', async (_label, scope) => {
  seedPatrol('a', scope);
  seedResult('a', 'point-1', 'ok', [], scope.owner ?? 'alice', scope.contour ?? 'test');
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.completeAssignmentLocally('a')).rejects.toThrow();

  expect(assignment('a')).toMatchObject({ status: 'inProgress', completed_at_local: null });
  expect(commands()).toEqual([]);
});

it('starting an already running assignment enqueues nothing and requests no sync', async () => {
  seedPatrol('a', { status: 'inProgress' });
  seedPatrol('b', { status: 'accepted' });
  raw.exec("UPDATE patrol_assignments SET employee_id = assignment_id");
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.startAssignmentLocally('a')).toMatchObject({ status: 'inProgress' });
  await expect(patrol.resumeAssignmentLocally('a')).rejects.toThrow();
  expect(commands()).toEqual([]);
  expect(await syncRequests()).toBe(0);

  await patrol.startAssignmentLocally('b');
  expect(commands().map(command => command.type)).toEqual(['startPatrolAssignment']);
  expect(await syncRequests()).toBe(1);
});

it.each(['pending', 'waiting_network', 'waiting_auth', 'wrong_contour', 'conflict'])(
  'completing again reuses an existing %s completion command', async status => {
    seedPatrol('a');
    seedResult('a', 'point-1', 'ok');
    seedComplete('existing', 'a', status);
    const patrol = await import('@/db/repositories/patrolRepository');

    expect(await patrol.completeAssignmentLocally('a')).toMatchObject({ alreadyQueued: true, clientOperationId: 'existing' });
    expect(await patrol.completeAssignmentLocally('a')).toMatchObject({ alreadyQueued: true, clientOperationId: 'existing' });

    expect(commands()).toEqual([{ id: 'existing', type: 'completePatrolAssignment', status }]);
    expect(assignment('a').status).toBe('completedLocal');
  });

it('a rejected completion command is superseded by a new one instead of being reused', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedComplete('rejected', 'a', 'rejected');
  const patrol = await import('@/db/repositories/patrolRepository');

  const completion = await patrol.completeAssignmentLocally('a');

  expect(completion).toMatchObject({ alreadyQueued: false });
  expect(commands()).toEqual([
    { id: 'rejected', type: 'completePatrolAssignment', status: 'superseded' },
    { id: completion.clientOperationId, type: 'completePatrolAssignment', status: 'pending' }
  ]);
});

const scans = {
  nfc: (patrol: typeof import('@/db/repositories/patrolRepository'), index: number) => patrol.scanPointByNfc('a', `04A1B2C${index}`),
  qr: (patrol: typeof import('@/db/repositories/patrolRepository'), index: number) => patrol.scanPointByQr('a', `qr-${index}`)
};
const orderError = 'Сначала завершите обязательную точку «Point 1»';
const scannedPoints = () => selectAll(raw, "SELECT point_id FROM point_results WHERE status = 'scanned'");

it.each(['nfc', 'qr'] as const)('%s refuses an out-of-order point when the frozen snapshot disables free order', async method => {
  seedPatrol('a', { freeOrder: 0, points: 2 });
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(scans[method](patrol, 2)).rejects.toThrow(orderError);
  expect(scannedPoints()).toEqual([]);
  expect(commands()).toEqual([]);

  expect(await scans[method](patrol, 1)).toMatchObject({ matched: true, point: { pointId: 'point-1' } });
});

it.each(['nfc', 'qr'] as const)('%s accepts any order when the frozen snapshot allows free order', async method => {
  seedPatrol('a', { freeOrder: 1, points: 2 });
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await scans[method](patrol, 2)).toMatchObject({ matched: true, point: { pointId: 'point-2' } });
});

it.each([
  ['ok', true], ['issue', true], ['skipped', true], ['scanned', false], ['deferred', false]
] as const)('an earlier point with result %s lets the next point be scanned: %s', async (status, allowed) => {
  seedPatrol('a', { freeOrder: 0, points: 2 });
  seedResult('a', 'point-1', status);
  const patrol = await import('@/db/repositories/patrolRepository');

  for (const method of ['nfc', 'qr'] as const) {
    raw.exec("DELETE FROM outbox_commands; DELETE FROM point_results WHERE point_id = 'point-2'");
    if (allowed) await expect(scans[method](patrol, 2)).resolves.toMatchObject({ matched: true });
    else await expect(scans[method](patrol, 2)).rejects.toThrow(orderError);
  }
});

it('an optional earlier point does not block route order', async () => {
  seedPatrol('a', { freeOrder: 0, points: 2 });
  raw.exec("UPDATE assignment_route_points SET required = 0 WHERE point_id = 'point-1'");
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.scanPointByQr('a', 'qr-2')).toMatchObject({ matched: true });
});

it.each(['nfc', 'qr'] as const)('%s re-checks route order inside its write transaction', async method => {
  seedPatrol('a', { freeOrder: 0, points: 2 });
  seedResult('a', 'point-1', 'ok');
  hooks.afterRead = sql => {
    if (sql.includes('point.order_index < ?')) {
      hooks.afterRead = null;
      raw.exec("UPDATE point_results SET status = 'deferred' WHERE point_id = 'point-1'");
    }
  };
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(scans[method](patrol, 2)).rejects.toThrow(orderError);
  expect(scannedPoints()).toEqual([]);
  expect(commands()).toEqual([]);
});

it('opening a point follows the same route order', async () => {
  seedPatrol('a', { freeOrder: 0, points: 2 });
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.assertPointCanBeOpened('a', 'point-2')).rejects.toThrow(orderError);
  expect(await patrol.assertPointCanBeOpened('a', 'point-1')).toMatchObject({ pointId: 'point-1' });
  seedResult('a', 'point-1', 'ok');
  expect(await patrol.assertPointCanBeOpened('a', 'point-2')).toMatchObject({ pointId: 'point-2' });
});

it('a started assignment stays ready and completable after the route version moves ahead', async () => {
  seedPatrol('a', { status: 'inProgress', routeVersion: 2 });
  seedResult('a', 'point-1', 'ok');
  seedPatrol('b', { status: 'accepted' });
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.getReportReadiness('a')).toMatchObject({ ready: true, problems: [] });
  expect((await patrol.getReportReadiness('b')).problems.map(problem => problem.pointId)).toContain('route-version');

  await patrol.completeAssignmentLocally('a');
  expect(assignment('a').status).toBe('completedLocal');
});

it.each([
  ['snapshot-version', "UPDATE patrol_assignments SET snapshot_version = 2"],
  ['snapshot-integrity', "INSERT INTO point_results(local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, sync_status) VALUES ('ghost', 'alice', 'test', 'a', 'ghost', 'ok', 'pending')"]
])('a started assignment with a broken frozen snapshot reports %s', async (problem, corruption) => {
  seedPatrol('a', { status: 'inProgress' });
  seedResult('a', 'point-1', 'ok');
  raw.exec(corruption);
  const patrol = await import('@/db/repositories/patrolRepository');

  const readiness = await patrol.getReportReadiness('a');

  expect(readiness.ready).toBe(false);
  expect(readiness.problems.map(item => item.pointId)).toEqual([problem]);
});

it.each(['pending', 'retryLater', 'waiting_network', 'waiting_auth', 'rejected'])(
  'lists attachments of a %s completed report whose physical file is missing', async status => {
    seedPatrol('a', { status: 'completedLocal' });
    seedFile('present', 'a', { exists: true, size: 100 });
    seedFile('gone', 'a', { exists: false });
    seedFile('empty', 'a', { exists: true, size: 0 });
    seedComplete('complete', 'a', status, ['present', 'gone', 'empty', 'unknown']);
    const patrol = await import('@/db/repositories/patrolRepository');

    expect(await patrol.listMissingCompleteAssignmentAttachmentIds('a', 'point-1')).toEqual(['gone', 'empty', 'unknown']);
  });

it.each([
  ['a sending command', 'sending', 'test'],
  ['an accepted command', 'accepted', 'test'],
  ['another contour', 'pending', 'other']
])('does not offer attachment repair for %s', async (_label, status, contour) => {
  seedPatrol('a', { status: 'completedLocal' });
  seedComplete('complete', 'a', status, ['gone'], contour);
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.listMissingCompleteAssignmentAttachmentIds('a', 'point-1')).toEqual([]);
});

const replacement = (clientFileId = 'replacement') => {
  disk.files[`file:///${clientFileId}.jpg`] = { exists: true, size: 100 };
  return {
    clientFileId, ownerUserId: 'alice', localPath: `file:///${clientFileId}.jpg`, status: 'localOnly' as const, sha256: 'sha',
    sizeBytes: 100, contentType: 'image/jpeg' as const, mediaKind: 'photo' as const, assignmentId: 'a', pointId: 'point-1',
    createdAtLocal: '2026-10-19'
  };
};
function seedRepairableReport(assignmentStatus = 'completedLocal', commandStatus = 'rejected') {
  seedPatrol('a', { status: assignmentStatus });
  seedResult('a', 'point-1', 'ok', ['gone']);
  seedFile('gone', 'a', { exists: false });
  seedComplete('complete', 'a', commandStatus, ['gone']);
}
const completePayload = () => JSON.parse(row("SELECT payload_json FROM outbox_commands WHERE client_operation_id = 'complete'").payload_json as string);

// Defect: the repair reads assignment_route_points.status and writes outbox_commands.sent_at_local;
// neither column exists in the schema, so every repair fails with "no such column".
it.fails('restoring a missing attachment rewrites the report and requeues its rejected command', async () => {
  seedRepairableReport();
  const patrol = await import('@/db/repositories/patrolRepository');

  expect(await patrol.restoreMissingPointAttachment('a', 'point-1', 'gone', replacement())).toEqual({ clientOperationId: 'complete' });

  expect(commands()).toEqual([{ id: 'complete', type: 'completePatrolAssignment', status: 'pending' }]);
  expect(completePayload().pointResults).toEqual([{ pointId: 'point-1', photoClientFileIds: ['replacement'] }]);
  expect(row("SELECT photo_client_file_ids_json AS ids, sync_status FROM point_results WHERE point_id = 'point-1'"))
    .toEqual({ ids: '["replacement"]', sync_status: 'pending' });
  expect(row("SELECT status FROM files WHERE client_file_id = 'replacement'").status).toBe('queued');
});

it('refuses attachment repair unless the report is still completed locally', async () => {
  seedRepairableReport('inProgress');
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.restoreMissingPointAttachment('a', 'point-1', 'gone', replacement())).rejects.toThrow('Восстановление доступно только для локально');

  expect(commands()).toEqual([{ id: 'complete', type: 'completePatrolAssignment', status: 'rejected' }]);
  expect(completePayload().pointResults[0].photoClientFileIds).toEqual(['gone']);
});

it('refuses attachment repair while the original file is still physically present', async () => {
  seedRepairableReport();
  disk.files['file:///gone.jpg'] = { exists: true, size: 100 };
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.restoreMissingPointAttachment('a', 'point-1', 'gone', replacement())).rejects.toThrow('Исходное вложение доступно');

  expect(commands()).toEqual([{ id: 'complete', type: 'completePatrolAssignment', status: 'rejected' }]);
  expect(completePayload().pointResults[0].photoClientFileIds).toEqual(['gone']);
});

it('refuses attachment repair when the local point result no longer references the missing file', async () => {
  seedRepairableReport();
  raw.exec(`UPDATE point_results SET photo_client_file_ids_json = '["other"]'`);
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.restoreMissingPointAttachment('a', 'point-1', 'gone', replacement())).rejects.toThrow('Локальный результат точки не содержит');

  expect(commands()).toEqual([{ id: 'complete', type: 'completePatrolAssignment', status: 'rejected' }]);
});

// Same defect: the missing status column fails before the replacement file is checked.
it.fails('refuses attachment repair when the replacement file is physically missing', async () => {
  seedRepairableReport();
  const absent = replacement('absent');
  disk.files[absent.localPath] = { exists: false };
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.restoreMissingPointAttachment('a', 'point-1', 'gone', absent)).rejects.toThrow('Новое вложение не прошло проверку');

  expect(commands()).toEqual([{ id: 'complete', type: 'completePatrolAssignment', status: 'rejected' }]);
});
