import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// How the real sync engine and outbox treat failed report deliveries, on the
// real schema and real session storage (network mocked):
// - the HTTP status decides: a whole-request 4xx is terminal and asks for a
//   decision, 5xx/429 retry quickly with jitter and honor Retry-After;
// - a reconnect forgets cached health failures, probes fast and revives
//   unexplained failures, but never a server rate limit or a terminal 4xx;
// - an expired session parks the report and a new sign-in resumes it;
// - "patrol not in progress" is retried only as a short ordering race;
// - an attachment upload that finds no network parks the whole queue for the network.
vi.mock('expo-sqlite', () => ({}));
const s = vi.hoisted(() => ({
  values: new Map<string, string>(), uuid: 0, online: true,
  health: vi.fn(), post: vi.fn(), upload: vi.fn(), fetch: vi.fn(), invalidateFailures: vi.fn()
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
vi.mock('@/api/serverHealthApi', () => ({ invalidateServerHealthFailures: s.invalidateFailures, checkServerConnection: s.health, probeServerHealthCached: async () => ({ ok: true }), invalidateServerHealthCache: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ postOutbox: s.post, getOutboxResult: async () => null }));
vi.mock('@/api/fileApi', () => ({ uploadMobileFile: s.upload }));
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
let raw: DatabaseSync;

async function storeSession(accessToken: string) {
  await (await import('@/auth/tokenStorage')).storeSessionEnvelope({
    ownerUserId: 'alice', accessToken, refreshToken: `${accessToken}-refresh`, accessExpiresAt: stamp, refreshExpiresAt: stamp,
    refreshOperationId: null,
    offlineSession: { userId: 'alice', contourId: 'test', fullName: 'Alice', lastOnlineLoginAt: stamp, expiresAt: stamp, offlineExpiresAt: stamp }
  });
}

beforeEach(async () => {
  vi.resetModules();
  s.values.clear(); s.uuid = 0; s.online = true;
  s.health.mockReset().mockResolvedValue({ ok: true });
  s.invalidateFailures.mockReset(); s.upload.mockReset();
  s.post.mockReset().mockImplementation(async (commands: { clientOperationId: string }[]) =>
    commands.map(command => ({ clientOperationId: command.clientOperationId, status: 'accepted', serverEntityId: null, message: '', serverRevision: null, conflictId: null, retryAfterSeconds: null })));
  s.fetch.mockReset(); vi.stubGlobal('fetch', s.fetch);
  ({ raw } = await openRealDatabase());
  await storeSession('alice-token');
});
afterEach(() => { raw.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const reportPayload = JSON.stringify({
  assignmentId: 'a', requestId: 'request-a', baseRevision: 1,
  summary: { totalPoints: 1, completedPoints: 1 },
  pointResults: [{ pointId: 'p1', status: 'ok', photoClientFileIds: [] }]
});
function seedReport(options: { status?: string; reason?: string | null; next?: string | null; attempts?: number } = {}) {
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES ('request-a', 'alice', 'route', 'Route', '2026-10-19', 'completedLocal', 1)`).run();
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
      route_version_no, snapshot_version, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
    VALUES ('a', 'alice', 'test', 'request-a', 'route', 'completedLocal', 1, 1, 1, 1, 1)`).run();
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, retry_reason, next_attempt_at, attempt_count, aggregate_key, sequence_no)
    VALUES ('report', 'alice', 'test', 'completePatrolAssignment', 'patrolAssignment', 'a', ?, '2026-10-19', ?, ?, ?, ?, 'patrolAssignment:a', 1)`)
    .run(reportPayload, options.status ?? 'pending', options.reason ?? null, options.next ?? null, options.attempts ?? 0);
}
const report = () => raw.prepare(
  "SELECT status, retry_reason AS reason, next_attempt_at AS next, last_error AS error, attempt_count AS attempts FROM outbox_commands WHERE client_operation_id = 'report'"
).get() as { status: string; reason: string | null; next: string | null; error: string | null; attempts: number };
const delaySeconds = () => (Date.parse(report().next!) - Date.now()) / 1000;
async function httpError(status: number, retryAfterSeconds: number | null = null) {
  const { MobileHttpError } = await import('@/api/httpClient');
  return new MobileHttpError(`HTTP ${status} от сервера`, status, retryAfterSeconds);
}

it('a whole-request 4xx is terminal: the report asks for a decision and a reconnect does not resend it', async () => {
  seedReport();
  s.post.mockRejectedValueOnce(await httpError(413));
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync();

  expect(report()).toMatchObject({ status: 'rejected', reason: null, next: null });
  expect(report().error).toContain('HTTP 413');
  expect(report().error).toContain('Нужно решение');
  const { getReportDeliveryState } = await import('@/db/repositories/outboxRepository');
  expect(await getReportDeliveryState('alice', 'a')).toMatchObject({ status: 'repairRequired', blockingOperationId: 'report' });

  await runForegroundSync({ mode: 'networkRecovered' });
  await runForegroundSync({ mode: 'manualAll' });
  expect(s.post).toHaveBeenCalledOnce();
});

it('a 503 with Retry-After waits exactly as long as the server asked', async () => {
  seedReport();
  s.post.mockRejectedValueOnce(await httpError(503, 120));
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync();

  expect(report()).toMatchObject({ status: 'retryLater', reason: 'server', attempts: 1 });
  expect(delaySeconds()).toBeGreaterThan(118);
  expect(delaySeconds()).toBeLessThanOrEqual(120);
});

it('a 5xx without a hint retries after about five seconds with jitter', async () => {
  seedReport();
  s.post.mockRejectedValueOnce(await httpError(502));
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync();

  expect(report()).toMatchObject({ status: 'retryLater', reason: 'server' });
  expect(delaySeconds()).toBeGreaterThan(2.5);
  expect(delaySeconds()).toBeLessThanOrEqual(6);
});

it('a 429 keeps its server delay even on reconnect; an unexplained failure is revived', async () => {
  seedReport();
  s.post.mockRejectedValueOnce(await httpError(429, 600));
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync();
  expect(report()).toMatchObject({ status: 'retryLater', reason: 'rateLimit' });
  await runForegroundSync({ mode: 'networkRecovered' });
  expect(s.post).toHaveBeenCalledOnce();

  raw.prepare("UPDATE outbox_commands SET retry_reason = 'unknown' WHERE client_operation_id = 'report'").run();
  await runForegroundSync({ mode: 'networkRecovered' });
  expect(s.post).toHaveBeenCalledTimes(2);
  expect(report().status).toBe('accepted');
});

it('a malformed response is an unexplained failure: retried patiently, not rejected', async () => {
  seedReport();
  const { MobileApiProtocolError } = await import('@/api/protocolValidation');
  s.post.mockRejectedValueOnce(new MobileApiProtocolError('Неверный ответ'));
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync();

  expect(report()).toMatchObject({ status: 'retryLater', reason: 'unknown' });
  expect(delaySeconds()).toBeGreaterThan(23);
  expect(delaySeconds()).toBeLessThanOrEqual(36);
});

it('a reconnect forgets cached health failures and probes with a short budget', async () => {
  seedReport({ status: 'waiting_network', reason: 'network' });
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync({ mode: 'normal' });
  expect(s.invalidateFailures).not.toHaveBeenCalled();
  expect(s.health).toHaveBeenLastCalledWith(undefined, { useCache: true, timeoutMs: undefined });
  // The server answered, so the offline-parked report was sent by the normal pass.
  expect(report().status).toBe('accepted');

  await runForegroundSync({ mode: 'networkRecovered' });
  expect(s.invalidateFailures).toHaveBeenCalledOnce();
  expect(s.health).toHaveBeenLastCalledWith(undefined, { useCache: true, timeoutMs: 3_000 });
});

it('Wi-Fi without Internet: a failed health check keeps the report on the phone and retries in about 30 s', async () => {
  seedReport({ status: 'waiting_network', reason: 'network' });
  s.health.mockResolvedValue({ ok: false, failureKind: 'serverUnavailable', message: 'Сервер не ответил' });
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await expect(runForegroundSync({ mode: 'networkRecovered' })).resolves.toMatchObject({ skipped: 'serverUnavailable' });

  expect(s.post).not.toHaveBeenCalled();
  expect(report()).toMatchObject({ status: 'retryLater', reason: 'server' });
  expect(delaySeconds()).toBeGreaterThan(23);
  expect(delaySeconds()).toBeLessThanOrEqual(36);
});

it('an expired session parks the report, the employee is asked to sign in, and the report leaves after sign-in', async () => {
  seedReport();
  s.fetch.mockResolvedValue({ ok: false, status: 401, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ code: 'device_session_not_found' }) });
  const { refreshStoredAccessToken } = await import('@/api/httpClient');
  await expect(refreshStoredAccessToken()).rejects.toThrow();
  expect(report()).toMatchObject({ status: 'waiting_auth', reason: 'authentication' });

  const { runForegroundSync } = await import('@/sync/syncEngine');
  await expect(runForegroundSync()).resolves.toMatchObject({ skipped: 'unauthenticated', sent: 0 });
  expect(report().status).toBe('waiting_auth');
  const { getReportDeliveryState } = await import('@/db/repositories/outboxRepository');
  const { noticeKindForDelivery } = await import('@/domain/reporting/reportNoticePolicy');
  expect(noticeKindForDelivery((await getReportDeliveryState('alice', 'a')).status)).toBe('loginRequired');

  await storeSession('alice-new-token');
  await runForegroundSync();

  expect(s.post).toHaveBeenCalledOnce();
  expect(report().status).toBe('accepted');
});

it('"patrol not in progress" is retried as an ordering race only a few times, then needs a decision', async () => {
  seedReport({ attempts: 2 });
  const closed = 'Patrol assignment must be in progress before report submit.';
  s.post.mockImplementation(async (commands: { clientOperationId: string }[]) => commands.map(command => ({
    clientOperationId: command.clientOperationId, status: 'rejected', serverEntityId: null, message: closed,
    serverRevision: null, conflictId: null, retryAfterSeconds: null
  })));
  const { runForegroundSync } = await import('@/sync/syncEngine');
  const { getReportDeliveryState } = await import('@/db/repositories/outboxRepository');

  await runForegroundSync();
  expect(report()).toMatchObject({ status: 'retryLater', reason: 'server', attempts: 3 });
  expect(await getReportDeliveryState('alice', 'a')).toMatchObject({ status: 'retryScheduled' });

  raw.prepare("UPDATE outbox_commands SET attempt_count = 5, next_attempt_at = NULL WHERE client_operation_id = 'report'").run();
  await runForegroundSync();

  expect(report()).toMatchObject({ status: 'rejected', attempts: 6 });
  expect(report().error).toContain('Нужно решение');
  expect(await getReportDeliveryState('alice', 'a')).toMatchObject({ status: 'repairRequired' });
  const conflicts = raw.prepare("SELECT status FROM sync_conflicts WHERE client_operation_id = 'report'").all();
  expect(conflicts).toEqual([{ status: 'open' }]);
});

it('a photo upload that finds no network stops the pass: the report and the rest of the queue wait for the network', async () => {
  seedReport();
  const payload = JSON.parse(reportPayload);
  payload.pointResults[0].photoClientFileIds = ['photo-1'];
  raw.prepare("UPDATE outbox_commands SET payload_json = ? WHERE client_operation_id = 'report'").run(JSON.stringify(payload));
  raw.prepare(`INSERT INTO files(client_file_id, owner_user_id, contour_id, local_path, status, sha256, size_bytes, content_type, media_kind,
      assignment_id, point_id, created_at_local) VALUES ('photo-1', 'alice', 'test', 'file:///photo-1.jpg', 'localOnly', 'hash', 100, 'image/jpeg', 'photo', 'a', 'p1', ?)`).run(stamp);
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, attempt_count, aggregate_key, sequence_no)
    VALUES ('other', 'alice', 'test', 'createShiftRemark', 'shiftRemark', 'r1', '{"remarkId":"r1","text":"x","mediaClientFileIds":[]}', '2026-10-20', 'pending', 0, 'shiftRemark:r1', 1)`).run();
  const { MobileNetworkError } = await import('@/api/networkTimeout');
  s.upload.mockRejectedValueOnce(new MobileNetworkError('offline', null, 'Нет сети.'));
  const { runForegroundSync } = await import('@/sync/syncEngine');

  // The pass ends with the network error itself, so callers see "offline", not a generic failure.
  await expect(runForegroundSync()).rejects.toMatchObject({ name: 'MobileNetworkError', kind: 'offline' });

  expect(s.upload).toHaveBeenCalledOnce();
  expect(s.post).not.toHaveBeenCalled();
  expect(report().status).toBe('waiting_network');
  expect(raw.prepare("SELECT status FROM files WHERE client_file_id = 'photo-1'").get()).toEqual({ status: 'retryLater' });
  expect(raw.prepare("SELECT status FROM outbox_commands WHERE client_operation_id = 'other'").get()).toEqual({ status: 'waiting_network' });
});

it('a sync pass revives legacy-rejected start and point commands and sends them in their original order', async () => {
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES ('request-a', 'alice', 'route', 'Route', '2026-10-19', 'inProgress', 1)`).run();
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision)
    VALUES ('a', 'alice', 'test', 'request-a', 'route', 'syncError', 1)`).run();
  const insert = raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, last_error, aggregate_key, sequence_no)
    VALUES (?, 'alice', 'test', ?, ?, ?, ?, '2026-10-19', 'rejected', ?, 'patrolAssignment:a', ?)`);
  insert.run('start', 'startPatrolAssignment', 'patrolAssignment', 'a', JSON.stringify({ assignmentId: 'a', startedAtLocal: stamp }), 'Only an accepted patrol assignment can be started.', 1);
  insert.run('scan', 'scanPatrolPointNfc', 'patrolPoint', 'p1', JSON.stringify({ assignmentId: 'a', pointId: 'p1', nfcUidHash: '04A1B2C3', scannedAtLocal: stamp }),
    'Patrol point actions are allowed only while patrol is in progress.', 2);
  const { runForegroundSync } = await import('@/sync/syncEngine');

  await runForegroundSync();

  expect(s.post.mock.calls.flatMap(([commands]) => commands.map((command: { clientOperationId: string }) => command.clientOperationId))).toEqual(['start', 'scan']);
  expect(selectAll(raw, 'SELECT client_operation_id AS id, status, sequence_no AS seq FROM outbox_commands ORDER BY seq')).toEqual([
    { id: 'start', status: 'accepted', seq: 1 },
    { id: 'scan', status: 'accepted', seq: 2 }
  ]);
});
