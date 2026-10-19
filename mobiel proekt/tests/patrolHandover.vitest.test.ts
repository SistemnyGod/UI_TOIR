import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// Handover of an unfinished patrol to a colleague (docs/patrol-handover-2026-10-19.md),
// on the real schema:
// - on a shared phone the colleague continues at once, offline, and the filled points
//   travel in the queued command with their photos;
// - a handover to another phone pauses the patrol here, is undone when the server refuses
//   and removes the patrol from this phone when the server accepts;
// - a phone that receives a patrol gets the filled points from bootstrap, and bootstrap
//   does not undo a handover that is still queued.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner, getAccessToken: async () => 'token' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ getBootstrap: vi.fn() }));

let raw: DatabaseSync;

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.uuid = 0;
  ({ raw } = await openRealDatabase());
  for (const [id, name] of [['ivanov', 'Иванов И.'], ['petrov', 'Петров П.']]) {
    raw.prepare(`INSERT INTO mobile_employees(employee_id, owner_user_id, full_name) VALUES (?, 'alice', ?)`).run(id, name);
  }
  raw.prepare(`INSERT INTO patrol_transfer_state(owner_user_id, contour_id, available) VALUES ('alice', 'test', 1)`).run();
  seedPatrol('a1', 'inProgress', 'ivanov');
});
afterEach(() => raw.close());

function seedPatrol(id: string, status: string, employeeId: string) {
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision, assigned_employee_id, assigned_full_name)
    VALUES (?, 'alice', 'route', 'Обход печей', '2026-10-19', ?, 1, ?, 'Иванов И.')`).run(`request-${id}`, status, employeeId);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision, employee_id)
    VALUES (?, 'alice', 'test', ?, 'route', ?, 3, ?)`).run(id, `request-${id}`, status, employeeId);
  for (const [index, point] of ['p1', 'p2', 'p3'].entries()) {
    raw.prepare(`INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index) VALUES (?, ?, 'route', ?, ?)`)
      .run(id, point, `Точка ${index + 1}`, index);
  }
}
function fillPoint(assignmentId: string, pointId: string, photos: string[] = []) {
  raw.prepare(`INSERT INTO point_results(local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, completed_at_local, sync_status, photo_client_file_ids_json)
    VALUES (?, 'alice', 'test', ?, ?, 'ok', '2026-10-19T08:00:00Z', 'pending', ?)`).run(`r-${assignmentId}-${pointId}`, assignmentId, pointId, JSON.stringify(photos));
}
const assignment = (id = 'a1') => raw.prepare('SELECT status, employee_id AS employeeId, revision FROM patrol_assignments WHERE assignment_id = ?')
  .get(id) as { status: string; employeeId: string; revision: number } | undefined;
const transferCommands = () => selectAll<{ id: string; payload: string; aggregateKey: string; status: string }>(raw,
  `SELECT client_operation_id AS id, payload_json AS payload, aggregate_key AS aggregateKey, status FROM outbox_commands
    WHERE command_type = 'transferPatrolAssignment' ORDER BY created_at_local`);
const respond = async (clientOperationId: string, status: 'accepted' | 'rejected' | 'conflict', serverRevision: number | null = 4) => {
  const { applyOutboxResponses } = await import('@/db/repositories/outboxResponseRepository');
  await applyOutboxResponses('alice', [{ clientOperationId, status, serverEntityId: 'a1', serverRevision, message: status === 'accepted' ? 'ok' : 'The colleague already has another patrol in progress.', conflictId: null, retryAfterSeconds: null, reasonCode: status === 'accepted' ? undefined : 'transferTargetBusy' } as never]);
};
function bootstrap(overrides: Record<string, unknown> = {}) {
  return {
    user: { serverUserId: 'alice', fullName: 'Смена', roles: [], permissions: [], updatedAtServer: '2026-10-19T00:00:00Z' },
    device: { deviceId: 'device', ownerUserId: 'alice', trusted: true, blockedAt: null },
    boundEmployees: [{ employeeId: 'ivanov', fullName: 'Иванов И.', position: null, department: null }, { employeeId: 'petrov', fullName: 'Петров П.', position: null, department: null }],
    emuSections: [], requestBoard: [], assignments: [], routes: [], points: [], conflictResolutions: [],
    serverTime: '2026-10-19T10:00:00Z', syncCursor: `cursor-${++session.uuid}`, contourId: 'test',
    ...overrides
  } as never;
}

it('hands the patrol to a colleague on the same phone offline and carries the filled points with photos', async () => {
  fillPoint('a1', 'p1', ['photo-1']);
  const { transferAssignmentLocally, getPatrolTransferContext } = await import('@/db/repositories/patrolTransferRepository');
  const operationId = await transferAssignmentLocally({ assignmentId: 'a1', toEmployeeId: 'petrov', toEmployeeName: 'Петров П.', sameAccount: true, reason: ' Конец смены ' });

  expect(assignment()).toMatchObject({ status: 'inProgress', employeeId: 'petrov' });
  const [command] = transferCommands();
  expect(command.id).toBe(operationId);
  expect(command.aggregateKey).toBe('patrolAssignment:a1');
  expect(JSON.parse(command.payload)).toMatchObject({
    assignmentId: 'a1', requestId: 'request-a1', fromEmployeeId: 'ivanov', fromEmployeeName: 'Иванов И.', toEmployeeId: 'petrov',
    mode: 'sameDevice', statusBefore: 'inProgress', reason: 'Конец смены',
    pointResults: [{ pointId: 'p1', status: 'ok', photoClientFileIds: ['photo-1'] }]
  });
  const { extractUploadClientFileIds } = await import('@/sync/uploadCandidatePolicy');
  expect(extractUploadClientFileIds({ commandType: 'transferPatrolAssignment', payload: JSON.parse(command.payload) })).toEqual(['photo-1']);

  const context = await getPatrolTransferContext('a1');
  expect(context).toMatchObject({ performerId: 'petrov', filledPointCount: 1, totalPointCount: 3, pending: { toEmployeeName: 'Петров П.', mode: 'sameDevice' } });
  await expect(transferAssignmentLocally({ assignmentId: 'a1', toEmployeeId: 'ivanov', toEmployeeName: 'Иванов И.', sameAccount: true, reason: '' }))
    .rejects.toThrow('уже ожидает отправки');

  await respond(operationId, 'accepted', 7);
  expect(assignment()).toMatchObject({ status: 'inProgress', employeeId: 'petrov', revision: 7 });
  expect((await getPatrolTransferContext('a1'))?.pending).toBeNull();
});

it('refuses a busy colleague on the same phone and an assignment that has not started', async () => {
  seedPatrol('a2', 'inProgress', 'petrov');
  seedPatrol('a3', 'accepted', 'ivanov');
  const { transferAssignmentLocally } = await import('@/db/repositories/patrolTransferRepository');
  await expect(transferAssignmentLocally({ assignmentId: 'a1', toEmployeeId: 'petrov', toEmployeeName: 'Петров П.', sameAccount: true, reason: '' }))
    .rejects.toThrow('уже есть начатый обход');
  await expect(transferAssignmentLocally({ assignmentId: 'a3', toEmployeeId: 'petrov', toEmployeeName: 'Петров П.', sameAccount: true, reason: '' }))
    .rejects.toThrow('только начатый');
  await expect(transferAssignmentLocally({ assignmentId: 'a1', toEmployeeId: 'stranger', toEmployeeName: 'Чужой', sameAccount: true, reason: '' }))
    .rejects.toThrow('не привязан');
  expect(transferCommands()).toEqual([]);
  expect(assignment()).toMatchObject({ employeeId: 'ivanov' });
});

it('pauses a handover to another phone, undoes it on refusal and removes the patrol on acceptance', async () => {
  fillPoint('a1', 'p1');
  const { transferAssignmentLocally } = await import('@/db/repositories/patrolTransferRepository');
  const refused = await transferAssignmentLocally({ assignmentId: 'a1', toEmployeeId: 'sidorov', toEmployeeName: 'Сидоров С.', sameAccount: false, reason: '' });
  expect(assignment()).toMatchObject({ status: 'paused', employeeId: 'sidorov' });

  await respond(refused, 'conflict');
  expect(assignment()).toMatchObject({ status: 'inProgress', employeeId: 'ivanov' });
  expect(selectAll(raw, `SELECT assigned_full_name AS name, status FROM patrol_request_board WHERE request_id = 'request-a1'`))
    .toEqual([{ name: 'Иванов И.', status: 'inProgress' }]);

  const accepted = await transferAssignmentLocally({ assignmentId: 'a1', toEmployeeId: 'sidorov', toEmployeeName: 'Сидоров С.', sameAccount: false, reason: '' });
  await respond(accepted, 'accepted');
  expect(assignment()).toBeUndefined();
  expect(selectAll(raw, `SELECT point_id FROM point_results WHERE assignment_id = 'a1'`)).toEqual([]);
  expect(selectAll(raw, `SELECT request_id FROM patrol_request_board WHERE request_id = 'request-a1'`)).toEqual([]);
});

it('stores points carried from another phone and keeps a queued local handover through bootstrap', async () => {
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');
  const serverAssignment = { assignmentId: 'a1', requestId: 'request-a1', routeId: 'route', status: 'inProgress', revision: 3, routeVersionNo: 0,
    startedAtLocal: null, completedAtLocal: null, routeSnapshot: null, employeeId: 'ivanov',
    transferredPointResults: [
      { pointId: 'p2', status: 'issue', comment: 'Протечка', issueTypeId: 'leak', confirmationType: 'nfc', manualReason: null, completedAtLocal: '2026-10-19T07:00:00Z', performerEmployeeId: 'sidorov', performerName: 'Сидоров С.', photoCount: 2 },
      { pointId: 'unknown-point', status: 'ok', performerEmployeeId: 'sidorov', performerName: 'Сидоров С.' },
      { pointId: 'p3', status: 'pending', performerEmployeeId: 'sidorov', performerName: 'Сидоров С.' }
    ] };
  const { transferAssignmentLocally, getPatrolTransferContext } = await import('@/db/repositories/patrolTransferRepository');
  await transferAssignmentLocally({ assignmentId: 'a1', toEmployeeId: 'petrov', toEmployeeName: 'Петров П.', sameAccount: true, reason: '' });

  await saveBootstrap(bootstrap({ patrolTransfer: true, assignments: [serverAssignment] }));
  // The server still names the previous performer until the queued handover is sent.
  expect(assignment()).toMatchObject({ employeeId: 'petrov' });
  expect(selectAll(raw, `SELECT point_id AS pointId, status, comment, issue_type_id AS issueTypeId, sync_status AS syncStatus, photo_client_file_ids_json AS photos
      FROM point_results WHERE assignment_id = 'a1'`))
    .toEqual([{ pointId: 'p2', status: 'issue', comment: 'Протечка', issueTypeId: 'leak', syncStatus: 'transferred', photos: '[]' }]);
  expect((await getPatrolTransferContext('a1'))).toMatchObject({ serverSupportsTransfer: true, filledPointCount: 1 });

  await saveBootstrap(bootstrap({ patrolTransfer: false, assignments: [serverAssignment] }));
  expect(selectAll(raw, `SELECT point_id FROM point_results WHERE assignment_id = 'a1'`)).toHaveLength(1);
  expect((await getPatrolTransferContext('a1'))?.serverSupportsTransfer).toBe(false);
});

it('lists the employees of this phone with their patrols in progress', async () => {
  seedPatrol('a2', 'inProgress', 'petrov');
  const { listLocalTransferCandidates } = await import('@/db/repositories/patrolTransferRepository');
  expect(await listLocalTransferCandidates()).toEqual([
    { employeeId: 'ivanov', fullName: 'Иванов И.', position: null, sameAccount: true, hasPatrolInProgress: true },
    { employeeId: 'petrov', fullName: 'Петров П.', position: null, sameAccount: true, hasPatrolInProgress: true }
  ]);
});
