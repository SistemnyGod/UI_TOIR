import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// Behavior for recoverable lifecycle rejections: a server answer saying the patrol was not
// yet accepted/in progress must put the command back in the queue and keep the patrol
// running locally, instead of opening a conflict. Legacy rows rejected this way are
// reactivated by reactivateRecoverableRejectedStartCommands.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

const legacyStartRejection = 'Only an accepted patrol assignment can be started.';
let raw: DatabaseSync;

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  ({ raw } = await openRealDatabase());
});
afterEach(() => raw.close());

function seedPatrol(id: string, status: string, owner = 'alice') {
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES (?, ?, 'route', 'Route', '2026-10-19', ?, 1)`).run(`request-${id}`, owner, status);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision)
    VALUES (?, ?, 'test', ?, 'route', ?, 1)`).run(id, owner, `request-${id}`, status);
}

function seedCommand(id: string, commandType: string, assignmentId: string, status: string, lastError: string | null = null, owner = 'alice') {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, last_error, aggregate_key, sequence_no)
    VALUES (?, ?, 'test', ?, 'patrolAssignment', ?, ?, '2026-10-19', ?, ?, ?, 1)`)
    .run(id, owner, commandType, assignmentId, JSON.stringify({ assignmentId }), status, lastError, `patrolAssignment:${assignmentId}`);
}

const command = (id: string) => raw.prepare(
  'SELECT status, next_attempt_at AS nextAttemptAt, retry_reason AS retryReason FROM outbox_commands WHERE client_operation_id = ?'
).get(id) as { status: string; nextAttemptAt: string | null; retryReason: string | null };
const patrolStatus = (id: string) => ({
  assignment: (raw.prepare('SELECT status FROM patrol_assignments WHERE assignment_id = ?').get(id) as { status: string }).status,
  board: (raw.prepare('SELECT status FROM patrol_request_board WHERE request_id = ?').get(`request-${id}`) as { status: string }).status
});
const openConflicts = () => selectAll(raw, "SELECT client_operation_id FROM sync_conflicts WHERE status = 'open'");
const rejected = (clientOperationId: string, message: string) =>
  ({ clientOperationId, status: 'rejected', serverEntityId: null, serverRevision: null, message, retryAfterSeconds: null }) as never;

it('requeues a start rejected as not-yet-accepted and keeps the patrol running', async () => {
  seedPatrol('a', 'inProgress');
  seedCommand('start', 'startPatrolAssignment', 'a', 'sending');
  const { applyOutboxResponses } = await import('@/db/repositories/outboxRepository');

  await applyOutboxResponses('alice', [rejected('start', legacyStartRejection)]);

  expect(command('start')).toMatchObject({ status: 'retryLater', retryReason: 'server' });
  expect(command('start').nextAttemptAt).not.toBeNull();
  expect(openConflicts()).toEqual([]);
  expect(patrolStatus('a')).toEqual({ assignment: 'inProgress', board: 'inProgress' });
});

it('keeps a locally completed report completed when its submit is recoverably rejected', async () => {
  seedPatrol('a', 'completedLocal');
  seedCommand('complete', 'completePatrolAssignment', 'a', 'sending');
  const { applyOutboxResponses } = await import('@/db/repositories/outboxRepository');

  await applyOutboxResponses('alice', [rejected('complete', 'Patrol assignment must be in progress before report submit.')]);

  expect(command('complete').status).toBe('retryLater');
  expect(openConflicts()).toEqual([]);
  expect(patrolStatus('a').assignment).toBe('completedLocal');
});

it('still opens a conflict for other start rejections', async () => {
  seedPatrol('a', 'inProgress');
  seedCommand('start', 'startPatrolAssignment', 'a', 'sending');
  const { applyOutboxResponses } = await import('@/db/repositories/outboxRepository');

  await applyOutboxResponses('alice', [rejected('start', 'Route was archived.')]);

  expect(command('start').status).toBe('rejected');
  expect(openConflicts()).toEqual([{ client_operation_id: 'start' }]);
  expect(patrolStatus('a').assignment).toBe('syncError');
});

it('reactivates legacy rejected starts and resolves their conflicts', async () => {
  seedPatrol('a', 'syncError');
  seedPatrol('b', 'syncError');
  seedCommand('legacy-start', 'startPatrolAssignment', 'a', 'rejected', legacyStartRejection);
  seedCommand('other-start', 'startPatrolAssignment', 'b', 'rejected', 'Route was archived.');
  raw.exec(`INSERT INTO sync_conflicts(conflict_id, owner_user_id, contour_id, client_operation_id, entity_type, reason, payload_snapshot_json, status)
    VALUES ('c-legacy', 'alice', 'test', 'legacy-start', 'patrolAssignment', 'x', '{}', 'open'),
           ('c-other', 'alice', 'test', 'other-start', 'patrolAssignment', 'x', '{}', 'open')`);
  const { reactivateRecoverableRejectedStartCommands } = await import('@/db/repositories/outboxRepository');

  await reactivateRecoverableRejectedStartCommands('alice');

  expect(command('legacy-start')).toMatchObject({ status: 'retryLater', retryReason: 'server' });
  expect(patrolStatus('a')).toEqual({ assignment: 'inProgress', board: 'inProgress' });
  expect(openConflicts()).toEqual([{ client_operation_id: 'other-start' }]);
  expect(command('other-start').status).toBe('rejected');
  expect(patrolStatus('b').assignment).toBe('syncError');
});

it('does not reactivate another owner\'s legacy rejected start', async () => {
  seedPatrol('a', 'syncError', 'bob');
  seedCommand('foreign-start', 'startPatrolAssignment', 'a', 'rejected', legacyStartRejection, 'bob');
  const { reactivateRecoverableRejectedStartCommands } = await import('@/db/repositories/outboxRepository');

  await reactivateRecoverableRejectedStartCommands('alice');

  expect(command('foreign-start').status).toBe('rejected');
  expect(patrolStatus('a').assignment).toBe('syncError');
});

it('does not start an unaccepted request or enqueue an implicit acceptance', async () => {
  seedPatrol('a', 'assigned');
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.startAssignmentLocally('a')).rejects.toThrow();

  expect(patrolStatus('a').assignment).toBe('assigned');
  expect(selectAll(raw, 'SELECT command_type FROM outbox_commands')).toEqual([]);
});

it('startup repairs a legacy start queued after its point commands, once and without gaps', async () => {
  seedPatrol('a', 'inProgress');
  const insert = raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, last_error, aggregate_key, sequence_no)
    VALUES (?, 'alice', 'test', ?, 'patrolAssignment', 'a', '{"assignmentId":"a"}', '2026-10-19', ?, ?, 'patrolAssignment:a', ?)`);
  insert.run('accept', 'acceptPatrolRequest', 'accepted', null, 1);
  insert.run('scan', 'scanPatrolPointNfc', 'pending', null, 2);
  insert.run('mark', 'markPatrolPointOk', 'pending', null, 3);
  insert.run('start', 'startPatrolAssignment', 'rejected', legacyStartRejection, 4);
  raw.exec("DELETE FROM schema_migrations WHERE id = '20260728_repair_misordered_patrol_outbox'");

  vi.resetModules();
  await openRealDatabase(raw);

  const order = () => selectAll(raw, "SELECT client_operation_id AS id FROM outbox_commands ORDER BY sequence_no").map(row => row.id);
  expect(order()).toEqual(['accept', 'start', 'scan', 'mark']);
  expect(selectAll(raw, 'SELECT sequence_no FROM outbox_commands ORDER BY sequence_no').map(row => row.sequence_no)).toEqual([1, 2, 3, 4]);

  // Later launches leave the repaired order alone.
  vi.resetModules();
  await openRealDatabase(raw);
  expect(order()).toEqual(['accept', 'start', 'scan', 'mark']);
});
