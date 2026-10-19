import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll, type QueryHook } from './support/realDatabase';

// Behavior for the rule "one running patrol per employee": start/resume are rejected
// while the same employee has another inProgress patrol, and entering a request
// switches or resumes instead of starting a second one. Uses the real schema.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

const activeConflict = 'У сотрудника уже есть выполняемый обход';
let raw: DatabaseSync;
let hooks: { afterRead: QueryHook | null };

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  ({ raw, hooks } = await openRealDatabase());
  raw.exec(`
    INSERT INTO routes(route_id, name, version, nfc_enabled, qr_fallback_enabled) VALUES ('route', 'Route', 1, 1, 1);
    INSERT INTO mobile_employees(employee_id, owner_user_id, full_name) VALUES ('bob', 'alice', 'Bob'), ('carol', 'alice', 'Carol');
  `);
});
afterEach(() => raw.close());

function seedPatrol(id: string, status: string, employeeId: string | null) {
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision,
      route_switch_available, assigned_employee_id)
    VALUES (?, 'alice', 'route', 'Route', '2026-10-19', ?, 1, 1, ?)`).run(`request-${id}`, status, employeeId);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
      route_version_no, snapshot_version, employee_id, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
    VALUES (?, 'alice', 'test', ?, 'route', ?, 1, 1, 1, ?, 1, 1)`).run(id, `request-${id}`, status, employeeId);
}

const statusOf = (id: string) =>
  (raw.prepare('SELECT status FROM patrol_assignments WHERE assignment_id = ?').get(id) as { status: string }).status;
const lifecycleCommands = () =>
  selectAll<{ type: string; entity: string }>(raw, `SELECT command_type AS type, entity_local_id AS entity FROM outbox_commands
    WHERE command_type IN ('startPatrolAssignment', 'resumePatrolAssignment', 'switchPatrolAssignment') ORDER BY sequence_no`);
const runningFor = (employeeId: string) =>
  selectAll(raw, "SELECT assignment_id FROM patrol_assignments WHERE employee_id = ? AND status = 'inProgress'", employeeId);

it('rejects starting a second patrol for an employee who already has one running', async () => {
  seedPatrol('a', 'inProgress', 'bob');
  seedPatrol('b', 'accepted', 'bob');
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.startAssignmentLocally('b')).rejects.toThrow(activeConflict);

  expect(statusOf('b')).toBe('accepted');
  expect(lifecycleCommands()).toEqual([]);
  expect(runningFor('bob')).toHaveLength(1);
});

it('rejects resuming a paused patrol while the employee runs another one', async () => {
  seedPatrol('a', 'inProgress', 'bob');
  seedPatrol('b', 'paused', 'bob');
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.resumeAssignmentLocally('b')).rejects.toThrow(activeConflict);

  expect(statusOf('b')).toBe('paused');
  expect(lifecycleCommands()).toEqual([]);
});

it('re-checks inside the transaction when another patrol starts after the first check', async () => {
  seedPatrol('a', 'paused', 'bob');
  seedPatrol('b', 'accepted', 'bob');
  let raced = false;
  // The first competing-patrol lookup runs before the write transaction; start 'a' right after it.
  hooks.afterRead = sql => {
    if (!raced && sql.includes("status = 'inProgress'") && sql.includes('assignment_id <> ?')) {
      raced = true;
      raw.exec("UPDATE patrol_assignments SET status = 'inProgress' WHERE assignment_id = 'a'");
    }
  };
  const patrol = await import('@/db/repositories/patrolRepository');

  await expect(patrol.startAssignmentLocally('b')).rejects.toThrow(activeConflict);

  expect(raced).toBe(true);
  expect(statusOf('b')).toBe('accepted');
  expect(lifecycleCommands()).toEqual([]);
});

it('does not block a start because a different employee is running a patrol', async () => {
  seedPatrol('a', 'inProgress', 'carol');
  seedPatrol('b', 'accepted', 'bob');
  const patrol = await import('@/db/repositories/patrolRepository');

  await patrol.startAssignmentLocally('b');

  expect(statusOf('b')).toBe('inProgress');
  expect(lifecycleCommands()).toEqual([{ type: 'startPatrolAssignment', entity: 'b' }]);
});

it('entering a request of an employee with a running patrol switches to it atomically', async () => {
  seedPatrol('a', 'inProgress', 'bob');
  seedPatrol('b', 'accepted', 'bob');
  const { enterPatrolRequest } = await import('@/services/patrolEntryService');

  expect(await enterPatrolRequest('request-b', 'bob')).toBe('/patrol/assignment/b/scan-nfc');

  expect(statusOf('a')).toBe('paused');
  expect(statusOf('b')).toBe('inProgress');
  expect(runningFor('bob')).toEqual([{ assignment_id: 'b' }]);
  expect(lifecycleCommands()).toEqual([{ type: 'switchPatrolAssignment', entity: 'b' }]);
});

it('entering a paused request resumes it instead of starting it again', async () => {
  seedPatrol('b', 'paused', 'bob');
  const { enterPatrolRequest } = await import('@/services/patrolEntryService');

  await enterPatrolRequest('request-b', 'bob');

  expect(statusOf('b')).toBe('inProgress');
  expect(lifecycleCommands()).toEqual([{ type: 'resumePatrolAssignment', entity: 'b' }]);
});
