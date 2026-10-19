import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// Behavior for reactivating dormant report commands on the real schema, real outbox
// repository, real sync engine and real token storage/http client (network mocked):
// - network recovery (and the background task) makes offline/timed-out commands deliverable
//   at once, but leaves server- or rate-limit-delayed ones on their schedule;
// - a corrected server contour and a valid session return wrong_contour/waiting_auth commands
//   to delivery, a manual report only reactivates its own assignment;
// - a rejected refresh keeps offline access and parks the queue in waiting_auth;
// - retrying a patrol conflict keeps the assignment and its request-board row aligned.
vi.mock('expo-sqlite', () => ({}));
const s = vi.hoisted(() => ({
  values: new Map<string, string>(), uuid: 0, online: true,
  health: vi.fn(), post: vi.fn(), fetch: vi.fn()
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++s.uuid}` }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => s.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { s.values.set(key, value); },
  deleteItemAsync: async (key: string) => { s.values.delete(key); }
}));
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: async () => 'device' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => s.online }));
vi.mock('@/core/serverSettings', () => ({ getMobileRuntimeConfig: async () => ({ apiBaseUrl: 'https://test', contourId: 'test', syncProtocolVersion: '1.0' }), getServerCandidateBaseUrls: async () => ['https://test'], setServerBaseUrl: vi.fn() }));
vi.mock('@/core/connectionStateEvents', () => ({ getMobileConnectionContextGeneration: () => 1, invalidateMobileConnectionContext: vi.fn(), recordMobileConnectionOutcome: vi.fn() }));
vi.mock('@/api/serverHealthApi', () => ({ checkServerConnection: s.health, probeServerHealthCached: async () => ({ ok: true }), invalidateServerHealthCache: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ postOutbox: s.post, getOutboxResult: async () => null }));
vi.mock('@/api/fileApi', () => ({ uploadMobileFile: vi.fn() }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/sync/outboxRetryScheduler', () => ({ scheduleNextOutboxRetry: async () => {}, registerOutboxRetrySchedulerRunner: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), deleteOrphanPatrolPhotos: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/diagnosticReportService', () => ({ triggerReportDeliveryDiagnostic: vi.fn() }));
vi.mock('@/services/localMediaReclamationService', () => ({ reclaimAcceptedLocalMedia: vi.fn() }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {}, pruneMobileActionLog: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

const stamp = '2030-01-01T00:00:00Z';
const future = '2030-01-01T00:00:00.000Z';
let raw: DatabaseSync;

beforeEach(async () => {
  vi.resetModules();
  s.values.clear(); s.uuid = 0; s.online = true;
  s.health.mockReset().mockResolvedValue({ ok: true });
  s.post.mockReset().mockImplementation(async (commands: { clientOperationId: string }[]) =>
    commands.map(command => ({ clientOperationId: command.clientOperationId, status: 'accepted', serverEntityId: null, message: null })));
  s.fetch.mockReset(); vi.stubGlobal('fetch', s.fetch);
  ({ raw } = await openRealDatabase());
  await (await import('@/auth/tokenStorage')).storeSessionEnvelope({
    ownerUserId: 'alice', accessToken: 'alice-token', refreshToken: 'alice-refresh', accessExpiresAt: stamp, refreshExpiresAt: stamp,
    refreshOperationId: null,
    offlineSession: { userId: 'alice', contourId: 'test', fullName: 'Alice', lastOnlineLoginAt: stamp, expiresAt: stamp, offlineExpiresAt: stamp }
  });
});
afterEach(() => { raw.close(); vi.unstubAllGlobals(); });

type Seed = { status: string; reason?: string | null; next?: string | null; owner?: string; aggregate?: string | null; entity?: string };
function seed(id: string, { status, reason = null, next = null, owner = 'alice', aggregate = id, entity = id }: Seed) {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, retry_reason, next_attempt_at, aggregate_key, sequence_no)
    VALUES (?, ?, 'test', 'savePatrolPointResult', 'patrolPoint', ?, '{}', '2026-10-19', ?, ?, ?, ?, ?)`)
    .run(id, owner, entity, status, reason, next, aggregate, ++s.uuid);
}
const row = (id: string) => raw.prepare(
  'SELECT status, retry_reason AS reason, next_attempt_at AS next FROM outbox_commands WHERE client_operation_id = ?'
).get(id) as { status: string; reason: string | null; next: string | null };
const posted = () => s.post.mock.calls.flatMap(([commands]) => commands.map((command: { clientOperationId: string }) => command.clientOperationId)).sort();

function seedDormantQueue() {
  seed('offline', { status: 'waiting_network', reason: 'network' });
  seed('network', { status: 'retryLater', reason: 'network', next: future });
  seed('timeout', { status: 'retryLater', reason: 'timeout', next: future });
  seed('server', { status: 'retryLater', reason: 'server', next: future });
  seed('throttled', { status: 'retryLater', reason: 'rateLimit', next: future });
  seed('unknown', { status: 'retryLater', reason: 'unknown', next: future });
  seed('foreign', { status: 'waiting_network', reason: 'network', owner: 'bob' });
}

it('network recovery makes offline, timed-out and server-unreachable commands due, but keeps rate-limit and unknown delays', async () => {
  seedDormantQueue();
  const { activateNetworkRecoveredOutboxCommands } = await import('@/db/repositories/outboxRepository');

  await activateNetworkRecoveredOutboxCommands('alice');

  for (const id of ['offline', 'network', 'timeout', 'server']) expect(row(id)).toEqual({ status: 'pending', reason: null, next: null });
  expect(row('throttled')).toEqual({ status: 'retryLater', reason: 'rateLimit', next: future });
  expect(row('unknown')).toEqual({ status: 'retryLater', reason: 'unknown', next: future });
  expect(row('foreign').status).toBe('waiting_network');
});

it('a reconnect sync delivers offline reports at once, while a normal sync waits for their schedule', async () => {
  seedDormantQueue();
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync({ mode: 'normal' });
  expect(posted()).toEqual([]);

  await runForegroundSync({ mode: 'networkRecovered' });
  expect(posted()).toEqual(['network', 'offline', 'server', 'timeout']);
  expect(row('offline').status).toBe('accepted');
  expect(row('throttled').status).toBe('retryLater');
});

it('the background task treats its pass as a network recovery', async () => {
  seed('offline', { status: 'waiting_network', reason: 'network' });
  seed('network', { status: 'retryLater', reason: 'network', next: future });
  const { runBackgroundOutboxSync } = await import('@/sync/syncEngine');

  await expect(runBackgroundOutboxSync()).resolves.toMatchObject({ sent: 2, skipped: null });

  expect(posted()).toEqual(['network', 'offline']);
});

it('a corrected server contour returns wrong-contour commands to delivery', async () => {
  seed('report', { status: 'pending' });
  s.health.mockResolvedValueOnce({ ok: false, failureKind: 'wrongContour', message: 'Другой контур' });
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await expect(runForegroundSync()).resolves.toMatchObject({ skipped: 'wrongContour' });
  expect(row('report').status).toBe('wrong_contour');
  expect(s.post).not.toHaveBeenCalled();

  await runForegroundSync();
  expect(s.health).toHaveBeenLastCalledWith(undefined, { useCache: true });
  expect(posted()).toEqual(['report']);
  expect(row('report').status).toBe('accepted');
});

it('a usable session returns commands that waited for sign-in to delivery', async () => {
  seed('report', { status: 'waiting_auth', reason: 'authentication' });
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync();

  expect(posted()).toEqual(['report']);
  expect(s.fetch).not.toHaveBeenCalled();
});

it('a manual report reactivates only the wrong-contour and waiting-auth commands of its assignment', async () => {
  seed('own-contour', { status: 'wrong_contour', aggregate: 'patrolAssignment:a' });
  seed('legacy-auth', { status: 'waiting_auth', reason: 'authentication', aggregate: null, entity: 'a' });
  seed('other-contour', { status: 'wrong_contour', aggregate: 'patrolAssignment:b' });
  seed('other-auth', { status: 'waiting_auth', reason: 'authentication', aggregate: null, entity: 'b' });
  const queue = await import('@/db/repositories/outboxRepository');

  await queue.activateWrongContourOutboxCommands('alice', 'patrolAssignment:a');
  await queue.activateWaitingAuthOutboxCommands('alice', 'patrolAssignment:a');

  expect(row('own-contour').status).toBe('pending');
  expect(row('legacy-auth')).toEqual({ status: 'pending', reason: null, next: null });
  expect(row('other-contour').status).toBe('wrong_contour');
  expect(row('other-auth').status).toBe('waiting_auth');
});

it('a rejected session refresh keeps offline access and parks queued delivery for online sign-in', async () => {
  seed('queued', { status: 'pending' });
  seed('delayed', { status: 'retryLater', reason: 'server', next: future });
  seed('refused', { status: 'rejected' });
  seed('foreign', { status: 'pending', owner: 'bob' });
  s.fetch.mockResolvedValue({ ok: false, status: 401, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ code: 'device_session_not_found' }) });
  const { refreshStoredAccessToken } = await import('@/api/httpClient');

  await expect(refreshStoredAccessToken()).rejects.toThrow('продолжайте работать офлайн');

  const stored = await (await import('@/auth/tokenStorage')).getStoredSessionSnapshot();
  expect(stored).toMatchObject({ ownerUserId: 'alice', accessToken: null, refreshToken: null, offlineSession: { userId: 'alice', revokedAt: null, requiresReenrollment: true } });
  expect(row('queued')).toEqual({ status: 'waiting_auth', reason: 'authentication', next: null });
  expect(row('delayed')).toEqual({ status: 'waiting_auth', reason: 'authentication', next: null });
  expect(row('refused').status).toBe('rejected');
  expect(row('foreign').status).toBe('pending');
});

it('retrying a patrol conflict marks the assignment and its request-board row completed locally', async () => {
  raw.exec(`
    INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
      VALUES ('request-a', 'alice', 'route', 'Route', '2026-10-19', 'syncError', 1),
             ('request-b', 'alice', 'route', 'Route', '2026-10-19', 'syncError', 1);
    INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
        route_version_no, snapshot_version, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
      VALUES ('a', 'alice', 'test', 'request-a', 'route', 'syncError', 1, 1, 1, 1, 1),
             ('b', 'alice', 'test', 'request-b', 'route', 'syncError', 1, 1, 1, 1, 1);
    INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
        payload_json, created_at_local, status, aggregate_key, sequence_no)
      VALUES ('conflicted', 'alice', 'test', 'completePatrolAssignment', 'patrolAssignment', 'a',
        '{"assignmentId":"a","baseRevision":1}', '2026-10-19', 'conflict', 'patrolAssignment:a', 1);
  `);
  const { retryOutboxConflictWithRevision } = await import('@/db/repositories/outboxRepository');

  const retried = await retryOutboxConflictWithRevision('alice', 'conflicted', 7);

  expect(row('conflicted').status).toBe('superseded');
  const [next] = selectAll<{ status: string; payload: string }>(raw, 'SELECT status, payload_json AS payload FROM outbox_commands WHERE client_operation_id = ?', retried);
  expect(next.status).toBe('pending');
  expect(JSON.parse(next.payload)).toMatchObject({ assignmentId: 'a', baseRevision: 7 });
  expect(selectAll(raw, 'SELECT assignment_id AS id, status FROM patrol_assignments ORDER BY assignment_id'))
    .toEqual([{ id: 'a', status: 'completedLocal' }, { id: 'b', status: 'syncError' }]);
  expect(selectAll(raw, 'SELECT request_id AS id, status FROM patrol_request_board ORDER BY request_id'))
    .toEqual([{ id: 'request-a', status: 'completedLocal' }, { id: 'request-b', status: 'syncError' }]);
});
