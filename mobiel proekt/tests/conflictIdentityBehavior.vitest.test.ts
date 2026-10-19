import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll, type QueryHook } from './support/realDatabase';

// Behavior for conflict identity and bootstrap reconciliation on the real schema:
// - request acceptance commands resolve to their assignment, and every resolution path
//   (server wins, cancel rejected, bootstrap) changes exactly that assignment or leaves
//   the conflict open;
// - accepting the server version is limited to assignment conflicts;
// - bootstrap closes non-assignment conflicts only with a server entity snapshot and
//   resolves conflicts after local/server assignment ids are merged;
// - refresh and startup migration keep route data of patrols that are still active locally.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0, bootstrap: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner, getAccessToken: async () => 'token' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ getBootstrap: session.bootstrap }));

const protectedStatuses = ['accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision'];
let raw: DatabaseSync;
let hooks: { afterRead: QueryHook | null; afterWrite: QueryHook | null };

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0; session.bootstrap.mockReset();
  ({ raw, hooks } = await openRealDatabase());
});
afterEach(() => raw.close());

function seedPatrol(id: string, status: string, options: { requestId?: string; routeId?: string } = {}) {
  const requestId = options.requestId ?? `request-${id}`;
  raw.prepare(`INSERT OR IGNORE INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES (?, 'alice', 'route', 'Route', '2026-10-19', ?, 1)`).run(requestId, status);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision)
    VALUES (?, 'alice', 'test', ?, ?, ?, 1)`).run(id, requestId, options.routeId ?? 'route', status);
}
function seedCommand(id: string, commandType: string, entityType: string, entityLocalId: string, status: string, payload: Record<string, unknown> = {}) {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      entity_server_id, payload_json, created_at_local, status, aggregate_key, sequence_no)
    VALUES (?, 'alice', 'test', ?, ?, ?, ?, ?, '2026-10-19', ?, ?, 1)`)
    .run(id, commandType, entityType, entityLocalId, `request-${entityLocalId}`, JSON.stringify(payload), status, `${entityType}:${entityLocalId}`);
  raw.prepare(`INSERT INTO sync_conflicts(conflict_id, owner_user_id, contour_id, client_operation_id, entity_type, reason, payload_snapshot_json, status)
    VALUES (?, 'alice', 'test', ?, ?, 'x', '{}', 'open')`).run(`conflict-${id}`, id, entityType);
}
const patrol = (id: string) => raw.prepare(`SELECT assignment.status, assignment.revision, board.status AS boardStatus
  FROM patrol_assignments assignment LEFT JOIN patrol_request_board board ON board.request_id = assignment.request_id
  WHERE assignment.assignment_id = ?`).get(id) as { status: string; revision: number; boardStatus: string } | undefined;
const command = (id: string) => raw.prepare('SELECT status, entity_local_id AS entityLocalId FROM outbox_commands WHERE client_operation_id = ?')
  .get(id) as { status: string; entityLocalId: string };
const conflict = (id: string) => raw.prepare('SELECT status, resolution_status AS resolutionStatus FROM sync_conflicts WHERE client_operation_id = ?')
  .get(id) as { status: string; resolutionStatus: string };
const serverWins = (assignmentId: string) => ({ assignmentId, requestId: `request-${assignmentId}`, assignmentStatus: 'accepted', requestStatus: 'accepted', revision: 3, startedAtLocal: null, completedAtLocal: null }) as never;

function bootstrap(overrides: Record<string, unknown> = {}) {
  return {
    user: { serverUserId: 'alice', fullName: 'Alice', roles: [], permissions: [], updatedAtServer: '2026-10-19T00:00:00Z' },
    device: { deviceId: 'device', ownerUserId: 'alice', trusted: true, blockedAt: null },
    boundEmployees: [], emuSections: [], requestBoard: [], assignments: [], routes: [], points: [], conflictResolutions: [],
    serverTime: '2026-10-19T10:00:00Z', syncCursor: `cursor-${++session.uuid}`, contourId: 'test',
    ...overrides
  } as never;
}
const serverAssignment = (assignmentId: string, requestId = `request-${assignmentId}`) => ({
  assignmentId, requestId, routeId: 'route', status: 'accepted', revision: 4, routeVersionNo: 1,
  startedAtLocal: null, completedAtLocal: null, routeSnapshot: null
});
const resolution = (clientOperationId: string, responseSnapshot: unknown = null) => ({
  clientOperationId, entityLocalId: null, entityServerId: null, operationStatus: 'conflict',
  resolutionStatus: 'serverWins', responseSnapshot, resolvedAt: '2026-10-19T09:00:00Z'
});

it('resolves request acceptance commands to their assignment and only those may accept the server state', async () => {
  const { resolvePatrolAssignmentIdentity } = await import('@/db/repositories/outboxPolicies');
  const { canAcceptServerConflict } = await import('@/services/conflictResolutionService');

  expect(resolvePatrolAssignmentIdentity({ commandType: 'acceptPatrolRequest', entityType: 'patrolRequest', entityLocalId: 'a' })).toBe('a');
  expect(resolvePatrolAssignmentIdentity({ commandType: 'takePatrolRequest', entityType: 'patrolRequest', payload: '{"assignmentId":"a"}' })).toBe('a');
  expect(resolvePatrolAssignmentIdentity({ commandType: 'savePatrolPointResult', entityType: 'patrolPoint', entityLocalId: 'p', payload: '{"assignmentId":"a"}' })).toBeNull();
  const accepts = (commandType: string, entityType: string) => canAcceptServerConflict({ commandType, entityType, entityLocalId: 'x' } as never);
  expect(accepts('acceptPatrolRequest', 'patrolRequest')).toBe(true);
  expect(accepts('takePatrolRequest', 'patrolRequest')).toBe(true);
  expect(accepts('startPatrolAssignment', 'patrolAssignment')).toBe(true);
  expect([accepts('savePatrolPointResult', 'patrolPoint'), accepts('updateWorkTask', 'workTask'), accepts('createShiftRemark', 'shiftRemark')])
    .toEqual([false, false, false]);
});

it('server wins for a request acceptance updates exactly the resolved assignment', async () => {
  seedPatrol('a', 'needsDispatcherDecision');
  seedPatrol('b', 'needsDispatcherDecision');
  seedCommand('accept', 'acceptPatrolRequest', 'patrolRequest', 'a', 'conflict');
  const { resolveOutboxConflictAsServerWins } = await import('@/db/repositories/outboxRepository');

  await resolveOutboxConflictAsServerWins('alice', 'accept', serverWins('a'));

  expect(patrol('a')).toEqual({ status: 'accepted', revision: 3, boardStatus: 'accepted' });
  expect(patrol('b')).toEqual({ status: 'needsDispatcherDecision', revision: 1, boardStatus: 'needsDispatcherDecision' });
  expect(command('accept').status).toBe('superseded');
  expect(conflict('accept')).toEqual({ status: 'resolved', resolutionStatus: 'resolvedServerWins' });
});

it('server wins keeps the conflict open for another assignment\'s snapshot or a missing local assignment', async () => {
  seedPatrol('a', 'needsDispatcherDecision');
  seedPatrol('b', 'needsDispatcherDecision');
  seedCommand('accept', 'acceptPatrolRequest', 'patrolRequest', 'a', 'conflict');
  seedCommand('orphan', 'acceptPatrolRequest', 'patrolRequest', 'gone', 'conflict');
  const { resolveOutboxConflictAsServerWins } = await import('@/db/repositories/outboxRepository');

  await expect(resolveOutboxConflictAsServerWins('alice', 'accept', serverWins('b'))).rejects.toThrow();
  await expect(resolveOutboxConflictAsServerWins('alice', 'orphan', serverWins('gone'))).rejects.toThrow();

  for (const id of ['accept', 'orphan']) {
    expect(command(id).status).toBe('conflict');
    expect(conflict(id).status).toBe('open');
  }
  expect(patrol('a')?.status).toBe('needsDispatcherDecision');
  expect(patrol('b')?.status).toBe('needsDispatcherDecision');
});

it.each([
  ['patrolPoint', 'savePatrolPointResult', { assignmentId: 'a', pointId: 'p' }],
  ['workTask', 'updateWorkTask', {}],
  ['shiftRemark', 'createShiftRemark', {}]
])('refuses to accept the server version for a %s conflict', async (entityType, commandType, payload) => {
  seedCommand('local', commandType, entityType, 'p', 'conflict', payload);
  const { acceptServerConflict } = await import('@/services/conflictResolutionService');
  const { resolveOutboxConflictAsServerWins } = await import('@/db/repositories/outboxRepository');
  const item = { clientOperationId: 'local', commandType, entityType, entityLocalId: 'p' } as never;

  await expect(acceptServerConflict('alice', item)).rejects.toThrow();
  await expect(resolveOutboxConflictAsServerWins('alice', 'local', serverWins('a'))).rejects.toThrow();

  expect(session.bootstrap).not.toHaveBeenCalled();
  expect(command('local').status).toBe('conflict');
  expect(conflict('local').status).toBe('open');
});

it.each([
  ['releasePatrolRequest', 'accepted'],
  ['startPatrolAssignment', 'accepted'],
  ['resumePatrolAssignment', 'paused'],
  ['completePatrolAssignment', 'inProgress']
])('cancelling a rejected %s restores only its assignment to %s', async (commandType, restored) => {
  seedPatrol('a', 'syncError');
  seedPatrol('b', 'syncError');
  seedCommand('rejected', commandType, 'patrolAssignment', 'a', 'rejected', { assignmentId: 'a' });
  const { cancelRejectedOutboxCommand } = await import('@/db/repositories/outboxRepository');

  await cancelRejectedOutboxCommand('alice', 'rejected', 'cancelled by user');

  expect(patrol('a')).toMatchObject({ status: restored, boardStatus: restored });
  expect(patrol('b')).toMatchObject({ status: 'syncError', boardStatus: 'syncError' });
  expect(command('rejected').status).toBe('cancelled');
  expect(conflict('rejected')).toEqual({ status: 'resolved', resolutionStatus: 'cancelledLocal' });
});

it('cancelling a rejected request acceptance releases that assignment; a missing assignment keeps the command', async () => {
  seedPatrol('a', 'syncError');
  seedPatrol('b', 'syncError');
  seedCommand('accept', 'acceptPatrolRequest', 'patrolRequest', 'a', 'rejected');
  seedCommand('orphan', 'releasePatrolRequest', 'patrolAssignment', 'gone', 'rejected', { assignmentId: 'gone' });
  const { cancelRejectedOutboxCommand } = await import('@/db/repositories/outboxRepository');

  await cancelRejectedOutboxCommand('alice', 'accept', 'cancelled by user');
  await expect(cancelRejectedOutboxCommand('alice', 'orphan', 'cancelled by user')).rejects.toThrow();

  expect(patrol('a')).toMatchObject({ status: 'cancelledServer', boardStatus: 'cancelledServer' });
  expect(patrol('b')?.status).toBe('syncError');
  expect(command('accept').status).toBe('cancelledLocal');
  expect(command('orphan').status).toBe('rejected');
  expect(conflict('orphan').status).toBe('open');
});

it('bootstrap closes a request acceptance conflict on the assignment it resolves to', async () => {
  seedPatrol('a', 'needsDispatcherDecision');
  seedPatrol('b', 'needsDispatcherDecision');
  seedCommand('accept', 'acceptPatrolRequest', 'patrolRequest', 'a', 'conflict');
  seedCommand('waiting', 'acceptPatrolRequest', 'patrolRequest', 'b', 'conflict');
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ assignments: [serverAssignment('a')], conflictResolutions: [resolution('accept'), resolution('waiting')] }));

  expect(patrol('a')).toMatchObject({ status: 'accepted', revision: 4 });
  expect(command('accept').status).toBe('superseded');
  expect(conflict('accept')).toEqual({ status: 'resolved', resolutionStatus: 'resolvedServerWins' });
  // The server did not return assignment b, so its resolution cannot be applied.
  expect(command('waiting').status).toBe('conflict');
  expect(conflict('waiting').status).toBe('open');
  expect(patrol('b')?.status).toBe('needsDispatcherDecision');
});

it('bootstrap resolves a conflict after merging the local assignment id into the server one', async () => {
  seedPatrol('local-a', 'needsDispatcherDecision', { requestId: 'request-a' });
  seedCommand('accept', 'acceptPatrolRequest', 'patrolRequest', 'local-a', 'conflict');
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ assignments: [serverAssignment('server-a', 'request-a')], conflictResolutions: [resolution('accept')] }));

  expect(selectAll(raw, 'SELECT assignment_id, status FROM patrol_assignments')).toEqual([{ assignment_id: 'server-a', status: 'accepted' }]);
  expect(command('accept')).toEqual({ status: 'superseded', entityLocalId: 'server-a' });
  expect(conflict('accept').status).toBe('resolved');
});

it('bootstrap closes an assignment conflict only when the assignment row was updated', async () => {
  seedPatrol('a', 'needsDispatcherDecision');
  seedCommand('accept', 'acceptPatrolRequest', 'patrolRequest', 'a', 'conflict');
  // The assignment row disappears between the bootstrap upsert and conflict resolution.
  hooks.afterRead = (sql, args) => {
    if (sql.includes('command_type AS commandType') && args.includes('accept')) raw.exec("DELETE FROM patrol_assignments WHERE assignment_id = 'a'");
  };
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ assignments: [serverAssignment('a')], conflictResolutions: [resolution('accept')] }));

  expect(command('accept').status).toBe('conflict');
  expect(conflict('accept').status).toBe('open');
});

it.each([
  ['patrolPoint', 'savePatrolPointResult', { assignmentId: 'a', pointId: 'p' }],
  ['workTask', 'updateWorkTask', {}],
  ['shiftRemark', 'createShiftRemark', {}]
])('bootstrap keeps a %s conflict open without a server entity snapshot', async (entityType, commandType, payload) => {
  seedCommand('local', commandType, entityType, 'p', 'conflict', payload);
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ conflictResolutions: [resolution('local')] }));

  expect(command('local').status).toBe('conflict');
  expect(conflict('local').status).toBe('open');
});

it('bootstrap closes a point conflict once the server sends the point state', async () => {
  raw.exec(`INSERT INTO point_results(local_result_id, owner_user_id, assignment_id, point_id, status, sync_status)
    VALUES ('result', 'alice', 'a', 'p', 'issue', 'conflict')`);
  seedCommand('local', 'savePatrolPointResult', 'patrolPoint', 'p', 'conflict', { assignmentId: 'a', pointId: 'p' });
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ conflictResolutions: [resolution('local', { entityType: 'patrolPoint', assignmentId: 'a', pointId: 'p', status: 'ok', serverRevision: 7 })] }));

  expect(command('local').status).toBe('superseded');
  expect(conflict('local').status).toBe('resolved');
  expect(raw.prepare("SELECT status, sync_status, server_revision FROM point_results WHERE local_result_id = 'result'").get())
    .toEqual({ status: 'ok', sync_status: 'synced', server_revision: 7 });
});

function seedRoute(routeId: string, assignmentStatus: string) {
  raw.prepare("INSERT INTO routes(route_id, name, version) VALUES (?, 'Route', 1)").run(routeId);
  raw.prepare("INSERT INTO route_points(point_id, route_id, name, order_index, revision) VALUES (?, ?, 'Point', 1, 1)").run(`${routeId}-point`, routeId);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision)
    VALUES (?, 'alice', 'test', ?, ?, ?, 1)`).run(`${routeId}-assignment`, `${routeId}-request`, routeId, assignmentStatus);
}
const listedRoute = (routeId: string) => ({ routeId, name: 'Route', version: 2, allowFreeOrder: true, nfcEnabled: false, qrFallbackEnabled: true });

it.each(protectedStatuses)('refresh keeps route data of a %s patrol that the server catalog omits', async status => {
  seedRoute('active-omitted', status);
  seedRoute('active-listed', status);
  seedRoute('done-omitted', 'completedServer');
  seedRoute('done-listed', 'completedServer');
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ routes: [listedRoute('active-listed'), listedRoute('done-listed')] }));

  expect(selectAll(raw, 'SELECT route_id FROM routes ORDER BY route_id').map(row => row.route_id))
    .toEqual(['active-listed', 'active-omitted', 'done-listed']);
  expect(selectAll(raw, 'SELECT point_id FROM route_points ORDER BY point_id').map(row => row.point_id))
    .toEqual(['active-listed-point', 'active-omitted-point']);
});

it.each(protectedStatuses)('an empty server catalog keeps route data of a %s patrol', async status => {
  seedRoute('active', status);
  seedRoute('done', 'cancelledServer');
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ routes: [] }));

  expect(selectAll(raw, 'SELECT route_id FROM routes')).toEqual([{ route_id: 'active' }]);
  expect(selectAll(raw, 'SELECT point_id FROM route_points')).toEqual([{ point_id: 'active-point' }]);
});

it.each(protectedStatuses)('the startup migration freezes the route of a %s patrol', async status => {
  seedRoute('active', status);
  seedRoute('done', 'completedServer');
  raw.exec("DELETE FROM assignment_route_points; DELETE FROM schema_migrations WHERE id = '20260526_assignment_snapshot_outbox_recovery'");
  const adapter = await (await import('@/db/encryptedDatabase')).openProtectedDatabase();
  vi.resetModules();
  const storage = await import('@/db/encryptedDatabase');
  vi.mocked(storage.openProtectedDatabase).mockResolvedValue(adapter);
  vi.mocked(storage.openProtectedDatabaseConnection).mockResolvedValue(adapter);

  await (await import('@/db/database')).initializeDatabase();

  expect(selectAll(raw, 'SELECT assignment_id, point_id FROM assignment_route_points'))
    .toEqual([{ assignment_id: 'active-assignment', point_id: 'active-point' }]);
});

function seedPlainCommand(id: string, commandType: string, entityLocalId: string, aggregateKey: string, payload: Record<string, unknown>, createdAtLocal = '2026-10-19T08:00:00Z') {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, aggregate_key, sequence_no)
    VALUES (?, 'alice', 'test', ?, 'patrolAssignment', ?, ?, ?, 'pending', ?, 1)`)
    .run(id, commandType, entityLocalId, JSON.stringify(payload), createdAtLocal, aggregateKey);
}
const queued = (id: string) => {
  const row = raw.prepare('SELECT entity_local_id AS entityLocalId, aggregate_key AS aggregateKey, payload_json AS payload FROM outbox_commands WHERE client_operation_id = ?')
    .get(id) as { entityLocalId: string; aggregateKey: string; payload: string };
  return { ...row, payload: JSON.parse(row.payload) };
};

it('bootstrap moves every local reference of a merged assignment to the server id', async () => {
  seedPatrol('local-a', 'inProgress', { requestId: 'request-a' });
  seedPlainCommand('start', 'startPatrolAssignment', 'local-a', 'patrolAssignment:local-a', { assignmentId: 'local-a' });
  seedPlainCommand('switch', 'switchPatrolAssignment', 'other', 'patrolAssignment:other', { assignmentId: 'other', sourceAssignmentId: 'local-a' });
  raw.prepare(`INSERT INTO patrol_report_cache(owner_user_id, contour_id, assignment_id, route_name, employee_name, completed_at, cached_at)
    VALUES ('alice', 'test', 'local-a', 'Route', 'Alice', NULL, '2026-10-19')`).run();
  raw.prepare(`INSERT INTO patrol_device_context(owner_user_id, contour_id, employee_id, assignment_id, updated_at)
    VALUES ('alice', 'test', NULL, 'local-a', '2026-10-19')`).run();
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ assignments: [{ ...serverAssignment('server-a', 'request-a'), status: 'inProgress' }] }));

  expect(selectAll(raw, 'SELECT assignment_id FROM patrol_assignments')).toEqual([{ assignment_id: 'server-a' }]);
  expect(queued('start')).toMatchObject({ entityLocalId: 'server-a', aggregateKey: 'patrolAssignment:server-a', payload: { assignmentId: 'server-a' } });
  // The other side of a pending switch keeps its own queue but points at the merged assignment.
  expect(queued('switch')).toMatchObject({ aggregateKey: 'patrolAssignment:other', payload: { assignmentId: 'other', sourceAssignmentId: 'server-a' } });
  expect(selectAll(raw, 'SELECT assignment_id FROM patrol_report_cache')).toEqual([{ assignment_id: 'server-a' }]);
  expect(selectAll(raw, 'SELECT assignment_id FROM patrol_device_context')).toEqual([{ assignment_id: 'server-a' }]);
});

const completedAt = (id: string) => (raw.prepare('SELECT completed_at_local AS value FROM patrol_assignments WHERE assignment_id = ?').get(id) as { value: string | null }).value;

it('bootstrap recovers a lost local completion time from the queued report, never from server time', async () => {
  // Realistic ids: the completion command is also found by the id inside its payload.
  seedPatrol('patrol-1111', 'completedLocal');
  seedPatrol('patrol-2222', 'completedLocal');
  seedPlainCommand('report-a', 'completePatrolAssignment', 'patrol-1111', 'patrolAssignment:patrol-1111', { assignmentId: 'patrol-1111', completedAtLocal: '2026-10-19T09:15:00Z' });
  seedPlainCommand('report-b', 'completePatrolAssignment', 'patrol-2222', 'patrolAssignment:patrol-2222', { assignmentId: 'patrol-2222' }, '2026-10-19T09:20:00Z');
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ assignments: [{ ...serverAssignment('patrol-1111'), status: 'inProgress' }, { ...serverAssignment('patrol-2222'), status: 'inProgress' }] }));

  expect(completedAt('patrol-1111')).toBe('2026-10-19T09:15:00Z');
  expect(completedAt('patrol-2222')).toBe('2026-10-19T09:20:00Z');
});

it('bootstrap keeps the local completion time of a report that is still on the phone', async () => {
  seedPatrol('a', 'completedLocal');
  raw.prepare("UPDATE patrol_assignments SET completed_at_local = '2026-10-19T09:15:00Z' WHERE assignment_id = 'a'").run();
  seedPlainCommand('report-a', 'completePatrolAssignment', 'a', 'patrolAssignment:a', { assignmentId: 'a', completedAtLocal: '2026-10-19T09:15:00Z' });
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');

  await saveBootstrap(bootstrap({ assignments: [{ ...serverAssignment('a'), status: 'inProgress', completedAtLocal: '2026-10-19T10:00:00Z' }] }));

  expect(completedAt('a')).toBe('2026-10-19T09:15:00Z');
  expect(patrol('a')?.status).toBe('completedLocal');
});
