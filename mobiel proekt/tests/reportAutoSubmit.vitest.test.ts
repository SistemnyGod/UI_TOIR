import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// Behavior of the auto-submit controller on the real schema, real readiness
// checks and the real local completion transaction (clock and OS mocked):
// a finished patrol the employee forgot is queued once, marked as auto, never
// while incomplete, restarted by edits, and the timer survives an app restart.
vi.mock('expo-sqlite', () => ({}));
const s = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++s.uuid}` }));
vi.mock('expo-notifications', () => ({}));
vi.mock('expo-secure-store', () => ({}));
vi.mock('react-native', () => ({ AppState: { currentState: 'background' }, Platform: { OS: 'android' } }));
vi.mock('react-native-nfc-manager', () => ({ default: {}, NfcAdapter: {}, NfcEvents: {}, NfcTech: {} }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => s.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn(async () => ({ exists: false })) }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

const minute = 60_000;
let raw: DatabaseSync;
const clock = { wall: Date.parse('2026-10-19T08:00:00Z'), mono: 1_000 };
const reminders: { assignmentId: string; inMs: number }[] = [];
const cancelled: string[] = [];
const delivery = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  s.owner = 'alice'; s.generation = 0; s.uuid = 0;
  clock.wall = Date.parse('2026-10-19T08:00:00Z'); clock.mono = 1_000;
  reminders.length = 0; cancelled.length = 0; delivery.mockReset();
  ({ raw } = await openRealDatabase());
});
afterEach(() => raw.close());

function seedPatrol(id: string, points = 2, status = 'inProgress') {
  raw.prepare(`INSERT OR IGNORE INTO routes(route_id, name, version, allow_free_order, nfc_enabled, qr_fallback_enabled)
    VALUES ('route', 'Route', 1, 1, 1, 1)`).run();
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES (?, 'alice', 'route', 'Route', '2026-10-19', ?, 1)`).run(`request-${id}`, status);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
      route_version_no, snapshot_version, snapshot_allow_free_order, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
    VALUES (?, 'alice', 'test', ?, 'route', ?, 1, 1, 1, 1, 1, 1)`).run(id, `request-${id}`, status);
  for (let index = 1; index <= points; index++) {
    raw.prepare(`INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index, nfc_uid_hash, qr_code_hash)
      VALUES (?, ?, 'route', ?, ?, ?, ?)`).run(id, `point-${index}`, `Point ${index}`, index, `04A1B2C${index}`, `qr-${index}`);
  }
}
function seedResult(assignmentId: string, pointId: string, status: string, comment: string | null = null) {
  raw.prepare(`INSERT OR REPLACE INTO point_results(local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, comment, sync_status,
      confirmation_type, completed_at_local, photo_client_file_ids_json)
    VALUES (?, 'alice', 'test', ?, ?, ?, ?, 'pending', 'nfc', '2026-10-19T00:00:00Z', '[]')`)
    .run(`${assignmentId}:${pointId}`, assignmentId, pointId, status, comment);
}
const completions = () => selectAll<{ id: string; status: string; payload: string }>(raw,
  "SELECT client_operation_id AS id, status, payload_json AS payload FROM outbox_commands WHERE command_type = 'completePatrolAssignment' ORDER BY rowid");
const timerRow = (id: string) => raw.prepare('SELECT status, elapsed_ms AS elapsed, client_operation_id AS operation FROM report_auto_submit WHERE assignment_id = ?').get(id) as
  { status: string; elapsed: number; operation: string | null } | undefined;

async function createController(options: { editing?: () => boolean } = {}) {
  const service = await import('@/services/reportAutoSubmitService');
  const repo = await import('@/db/repositories/reportAutoSubmitRepository');
  const patrol = await import('@/db/repositories/patrolRepository');
  return service.createReportAutoSubmitController({
    getOwnerUserId: async () => s.owner,
    listCandidates: repo.listAutoSubmitCandidateAssignmentIds,
    getReadiness: async (assignmentId) => {
      const readiness = await patrol.getReportReadiness(assignmentId);
      return { ready: readiness.ready && readiness.assignment?.status === 'inProgress', routeName: readiness.assignment?.routeName ?? null };
    },
    hasCompletionReport: repo.hasCompletionReport,
    fingerprint: repo.computeAssignmentReportFingerprint,
    getTimer: repo.getAutoSubmitTimer,
    saveTimer: repo.saveAutoSubmitTimer,
    deleteTimer: repo.deleteAutoSubmitTimer,
    submit: (assignmentId) => patrol.completeAssignmentLocally(assignmentId, { submissionMode: 'auto' }),
    markSubmitted: repo.markReportAutoSubmitted,
    requestDelivery: delivery,
    scheduleReminder: async (assignmentId, _route, inMs) => { reminders.push({ assignmentId, inMs }); },
    cancelReminder: async (assignmentId) => { cancelled.push(assignmentId); },
    isEditing: options.editing ?? (() => false),
    wallNow: () => clock.wall,
    monotonicNow: () => clock.mono,
    delayMs: () => 15 * minute,
    logError: (event, error) => { throw Object.assign(new Error(event), { cause: error }); }
  });
}
const advance = (ms: number, wallMs = ms) => { clock.mono += ms; clock.wall += wallMs; };

it('queues a forgotten complete report once after the delay, marked as auto-submitted', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedResult('a', 'point-2', 'ok');
  const controller = await createController();

  expect(await controller.evaluate()).toEqual({ submitted: [], armed: [{ assignmentId: 'a', remainingMs: 15 * minute }] });
  expect(reminders).toEqual([{ assignmentId: 'a', inMs: 10 * minute }]);
  expect(timerRow('a')).toMatchObject({ status: 'armed', elapsed: 0 });

  advance(14 * minute);
  expect(await controller.evaluate()).toMatchObject({ submitted: [], armed: [{ remainingMs: minute }] });
  expect(completions()).toEqual([]);

  advance(minute);
  expect(await controller.evaluate()).toEqual({ submitted: ['a'], armed: [] });
  const [report] = completions();
  expect(JSON.parse(report.payload)).toMatchObject({ assignmentId: 'a', submissionMode: 'auto', summary: { totalPoints: 2, completedPoints: 2 } });
  expect(timerRow('a')).toMatchObject({ status: 'submitted', operation: report.id });
  expect(cancelled).toEqual(['a']);
  expect(delivery).toHaveBeenCalledOnce();

  advance(60 * minute);
  expect(await controller.evaluate()).toEqual({ submitted: [], armed: [] });
  expect(completions()).toHaveLength(1);
});

it('never queues an unfinished patrol and drops its timer when a point is reopened', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  const controller = await createController();

  advance(60 * minute);
  expect(await controller.evaluate()).toEqual({ submitted: [], armed: [] });
  expect(timerRow('a')).toBeUndefined();

  seedResult('a', 'point-2', 'ok');
  await controller.evaluate();
  expect(timerRow('a')?.status).toBe('armed');
  seedResult('a', 'point-2', 'scanned');
  advance(60 * minute);
  expect(await controller.evaluate()).toEqual({ submitted: [], armed: [] });
  expect(timerRow('a')).toBeUndefined();
  expect(cancelled).toEqual(['a']);
  expect(completions()).toEqual([]);
});

it('any change to a point restarts the countdown and the reminder', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedResult('a', 'point-2', 'ok');
  const controller = await createController();
  await controller.evaluate();

  advance(14 * minute);
  seedResult('a', 'point-2', 'ok', 'Проверено повторно');
  expect(await controller.evaluate()).toMatchObject({ armed: [{ remainingMs: 15 * minute }] });
  expect(reminders).toHaveLength(2);

  advance(14 * minute);
  expect(await controller.evaluate()).toMatchObject({ submitted: [] });
  advance(minute);
  expect(await controller.evaluate()).toMatchObject({ submitted: ['a'] });
});

it('a manual send wins cleanly: no second report, the timer is dropped', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedResult('a', 'point-2', 'ok');
  const controller = await createController();
  await controller.evaluate();
  const { requestPatrolSync } = await import('@/sync/PatrolSyncCoordinator');
  vi.mocked(requestPatrolSync).mockResolvedValue({ sent: 0, skipped: 'offline', hasMore: false, nextRetryAt: null, retryableCount: 0, outcome: 'skipped' });
  const { queuePatrolReport } = await import('@/features/patrol/reportSubmissionCoordinator');

  advance(15 * minute);
  const [manual, auto] = await Promise.all([queuePatrolReport('a'), controller.evaluate()]);

  expect(completions()).toHaveLength(1);
  expect(completions()[0].id).toBe(manual.clientOperationId);
  expect(JSON.parse(completions()[0].payload).submissionMode).toBeUndefined();
  expect(auto.submitted).toEqual([]);
  expect(timerRow('a')).toBeUndefined();
});

it('a report rejected by the server waits for a person instead of being re-sent', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedResult('a', 'point-2', 'ok');
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, aggregate_key, sequence_no)
    VALUES ('rejected', 'alice', 'test', 'completePatrolAssignment', 'patrolAssignment', 'a', '{}', '2026-10-19', 'rejected', 'patrolAssignment:a', 1)`).run();
  const controller = await createController();

  advance(60 * minute);
  expect(await controller.evaluate()).toEqual({ submitted: [], armed: [] });
  advance(60 * minute);
  expect(await controller.evaluate()).toEqual({ submitted: [], armed: [] });
  expect(completions().map(row => row.id)).toEqual(['rejected']);
});

it('keeps the countdown across an app restart and reboot, counting the closed time', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedResult('a', 'point-2', 'ok');
  await (await createController()).evaluate();
  advance(5 * minute);
  await (await createController()).evaluate();

  // New process: no monotonic reference, the wall clock moved 9 minutes.
  const restarted = await createController();
  clock.mono = 0;
  clock.wall += 9 * minute;
  expect(await restarted.evaluate()).toMatchObject({ submitted: [], armed: [{ remainingMs: minute }] });
  advance(minute);
  expect(await restarted.evaluate()).toMatchObject({ submitted: ['a'] });
});

it('holds the report while a point form is open', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedResult('a', 'point-2', 'ok');
  let editing = true;
  const controller = await createController({ editing: () => editing });
  await controller.evaluate();

  advance(40 * minute);
  expect(await controller.evaluate()).toMatchObject({ submitted: [], armed: [{ remainingMs: minute }] });
  editing = false;
  advance(minute);
  expect(await controller.evaluate()).toMatchObject({ submitted: ['a'] });
});

it('only the signed-in owner patrols are considered', async () => {
  seedPatrol('a');
  seedResult('a', 'point-1', 'ok');
  seedResult('a', 'point-2', 'ok');
  s.owner = 'bob';
  const controller = await createController();
  advance(60 * minute);
  expect(await controller.evaluate()).toEqual({ submitted: [], armed: [] });
  expect(completions()).toEqual([]);
});
