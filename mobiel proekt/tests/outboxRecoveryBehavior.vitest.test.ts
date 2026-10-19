import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll } from './support/realDatabase';

// Behavior for outbox recovery and diagnostics on the real schema:
// - automatic recovery (quarantine, server responses, cancelling a rejection) never erases
//   a locally completed report; only the explicit report repair clears it;
// - manual report retry reactivates network/server waits but respects rate limits;
// - an unchanged bootstrap does not announce a snapshot refresh to every screen;
// - a forced diagnostic refresh rewrites the existing pending report;
// - attachment upload failover keeps the network error kind.
vi.mock('expo-sqlite', () => ({}));
const s = vi.hoisted(() => ({
  owner: 'alice', generation: 0, uuid: 0, bootstrap: vi.fn(), event: vi.fn(), health: vi.fn(), upload: vi.fn(), urls: [] as string[]
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++s.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => s.owner, getAccessToken: async () => 'token' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ getBootstrap: s.bootstrap }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessTokenIfNeeded: async () => 'token', refreshStoredAccessToken: async () => 'token' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/db/repositories/patrolAppealRepository', () => ({ refreshPatrolAppealsPage: async () => {} }));
vi.mock('@/services/notificationService', () => ({ refreshPushRegistrationIfAllowed: async () => {}, syncMobileNotifications: async () => {} }));
vi.mock('@/services/workTaskService', () => ({ syncWorkItems: async () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/sync/syncEvents', () => ({ emitSyncEvent: s.event }));
vi.mock('@/core/serverSettings', () => ({
  getMobileRuntimeConfig: async () => ({ apiBaseUrl: 'https://a', contourId: 'test', syncProtocolVersion: '1' }), getServerCandidateBaseUrls: async () => s.urls
}));
vi.mock('@/api/serverHealthApi', () => ({ probeServerHealthCached: s.health, invalidateServerHealthCache: vi.fn() }));
vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async () => ({ exists: true, size: 100 }), FileSystemUploadType: { MULTIPART: 1 },
  createUploadTask: () => ({ uploadAsync: s.upload, cancelAsync: async () => {} })
}));

let raw: DatabaseSync;

beforeEach(async () => {
  vi.resetModules();
  s.owner = 'alice'; s.generation = 0; s.uuid = 0; s.urls = ['https://a', 'https://b'];
  s.bootstrap.mockReset(); s.event.mockReset(); s.health.mockReset().mockResolvedValue({ ok: true }); s.upload.mockReset();
  ({ raw } = await openRealDatabase());
});
afterEach(() => raw.close());

const completedAt = '2026-10-19T08:30:00.000Z';
function seedCompletedPatrol(status = 'completedLocal') {
  raw.prepare(`INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
    VALUES ('request-a', 'alice', 'route', 'Route', '2026-10-19', ?, 1)`).run(status);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision, completed_at_local, local_report_present)
    VALUES ('a', 'alice', 'test', 'request-a', 'route', ?, 1, ?, 1)`).run(status, completedAt);
}
function seedCommand(id: string, status: string, options: { type?: string; payload?: unknown; retryReason?: string | null; aggregate?: string | null; entity?: string } = {}) {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, retry_reason, next_attempt_at, aggregate_key, sequence_no)
    VALUES (?, 'alice', 'test', ?, 'patrolAssignment', ?, ?, '2026-10-19', ?, ?, '2026-10-19T12:00:00Z', ?, 1)`)
    .run(id, options.type ?? 'completePatrolAssignment', options.entity ?? 'a', JSON.stringify(options.payload ?? { assignmentId: 'a' }), status,
      options.retryReason ?? null, options.aggregate === undefined ? `patrolAssignment:${options.entity ?? 'a'}` : options.aggregate);
}
const assignment = () => raw.prepare("SELECT status, completed_at_local AS completedAtLocal, local_report_present AS reportPresent FROM patrol_assignments WHERE assignment_id = 'a'")
  .get() as { status: string; completedAtLocal: string | null; reportPresent: number };
const commandStatus = (id: string) => (raw.prepare('SELECT status FROM outbox_commands WHERE client_operation_id = ?').get(id) as { status: string }).status;

it('quarantining an invalid completion reopens the patrol but keeps its completion time', async () => {
  seedCompletedPatrol();
  seedCommand('complete', 'pending', { payload: { assignmentId: 'a' } });
  const { quarantineInvalidPatrolCompletionCommands } = await import('@/db/repositories/outboxRepository');

  await expect(quarantineInvalidPatrolCompletionCommands('alice')).resolves.toEqual({ quarantined: 1, assignmentIds: ['a'] });

  expect(commandStatus('complete')).toBe('invalidPayload');
  expect(assignment()).toEqual({ status: 'inProgress', completedAtLocal: completedAt, reportPresent: 1 });
});

it.each(['accepted', 'duplicate', 'rejected', 'conflict', 'retryLater'])('a %s response to a completion keeps its completion time', async status => {
  seedCompletedPatrol();
  seedCommand('complete', 'sending');
  const { applyOutboxResponses } = await import('@/db/repositories/outboxRepository');

  await applyOutboxResponses('alice', [{ clientOperationId: 'complete', status, serverEntityId: null, serverRevision: null, message: 'Route was archived.', retryAfterSeconds: null } as never]);

  expect(assignment().completedAtLocal).toBe(completedAt);
});

it('cancelling a rejected completion reopens the patrol but keeps its completion time', async () => {
  seedCompletedPatrol('syncError');
  seedCommand('complete', 'rejected');
  const { cancelRejectedOutboxCommand } = await import('@/db/repositories/outboxRepository');

  await cancelRejectedOutboxCommand('alice', 'complete', 'cancelled by user');

  expect(assignment()).toMatchObject({ status: 'inProgress', completedAtLocal: completedAt });
});

it('only the explicit report repair clears the completion time', async () => {
  seedCompletedPatrol();
  seedCommand('complete', 'invalidPayload');
  const { reopenInvalidCompletionReportLocally } = await import('@/db/repositories/patrolRepository');

  await expect(reopenInvalidCompletionReportLocally('a')).resolves.toEqual({ reopened: true });

  expect(commandStatus('complete')).toBe('superseded');
  expect(assignment()).toEqual({ status: 'inProgress', completedAtLocal: null, reportPresent: 0 });
});

it('manual report retry reactivates network and server waits but not rate limits', async () => {
  const type = 'pausePatrolAssignment';
  seedCommand('offline', 'waiting_network', { type });
  seedCommand('server', 'retryLater', { type, retryReason: 'server' });
  seedCommand('legacy-reason', 'retryLater', { type });
  seedCommand('legacy-aggregate', 'waiting_network', { type, aggregate: null });
  seedCommand('rate-limited', 'retryLater', { type, retryReason: 'rateLimit' });
  seedCommand('refused', 'rejected', { type });
  seedCommand('other-patrol', 'waiting_network', { type, entity: 'b' });
  const { activateRetryableReportCommands } = await import('@/db/repositories/outboxRepository');

  await activateRetryableReportCommands('alice', 'a');

  expect(selectAll(raw, 'SELECT client_operation_id AS id, status, retry_reason AS reason, next_attempt_at AS nextAt FROM outbox_commands ORDER BY rowid')).toEqual([
    { id: 'offline', status: 'pending', reason: null, nextAt: null },
    { id: 'server', status: 'pending', reason: null, nextAt: null },
    { id: 'legacy-reason', status: 'pending', reason: null, nextAt: null },
    { id: 'legacy-aggregate', status: 'pending', reason: null, nextAt: null },
    { id: 'rate-limited', status: 'retryLater', reason: 'rateLimit', nextAt: '2026-10-19T12:00:00Z' },
    { id: 'refused', status: 'rejected', reason: null, nextAt: '2026-10-19T12:00:00Z' },
    { id: 'other-patrol', status: 'waiting_network', reason: null, nextAt: '2026-10-19T12:00:00Z' }
  ]);
});

it('an unchanged bootstrap does not announce a snapshot refresh', async () => {
  const snapshot = {
    user: { serverUserId: 'alice', fullName: 'Alice', roles: [], permissions: [], updatedAtServer: '2026-10-19T00:00:00Z' },
    device: { deviceId: 'device', ownerUserId: 'alice', trusted: true, blockedAt: null },
    boundEmployees: [], emuSections: [], requestBoard: [], assignments: [], routes: [], points: [],
    serverTime: '2026-10-19T10:00:00Z', syncCursor: 'cursor-1', contourId: 'test'
  };
  s.bootstrap.mockResolvedValue(snapshot);
  const { refreshMobileData } = await import('@/services/mobileDataRefreshService');
  const snapshotEvents = () => s.event.mock.calls.filter(([event]) => event.snapshotRefreshed || event.refreshedZones?.includes('requests'));

  await expect(refreshMobileData()).resolves.toBe(true);
  expect(snapshotEvents()).toHaveLength(1);

  await expect(refreshMobileData()).resolves.toBe(true);
  expect(snapshotEvents()).toHaveLength(1);

  s.bootstrap.mockResolvedValue({ ...snapshot, syncCursor: 'cursor-2' });
  await expect(refreshMobileData()).resolves.toBe(true);
  expect(snapshotEvents()).toHaveLength(2);
});

it('a forced diagnostic refresh rewrites the existing pending report; a regular one reuses it', async () => {
  const stored = { reportId: 'r1', appVersion: '0.1.0', platform: 'android', periodStart: '2026-10-18T00:00:00.000Z', periodEnd: '2026-10-18T06:00:00.000Z', generatedAt: '2026-10-18T06:00:00.000Z', pendingOutboxCount: 0, entries: [] };
  raw.prepare(`INSERT INTO mobile_diagnostic_reports(report_id, owner_user_id, period_start, period_end, payload_json, status, created_at_local, last_error)
    VALUES ('r1', 'alice', ?, ?, ?, 'pending', ?, 'HTTP 500')`).run(stored.periodStart, stored.periodEnd, JSON.stringify(stored), stored.generatedAt);
  const row = () => raw.prepare('SELECT period_end AS periodEnd, payload_json AS payload, last_error AS lastError FROM mobile_diagnostic_reports').get() as { periodEnd: string; payload: string; lastError: string | null };
  const { getOrCreatePendingDiagnosticReport } = await import('@/db/repositories/diagnosticReportRepository');
  const device = { appVersion: '0.2.0', platform: 'android' };
  const now = new Date('2026-10-19T09:00:00.000Z');

  await expect(getOrCreatePendingDiagnosticReport('alice', device, now)).resolves.toEqual(stored);
  expect(row()).toEqual({ periodEnd: stored.periodEnd, payload: JSON.stringify(stored), lastError: 'HTTP 500' });

  const forced = await getOrCreatePendingDiagnosticReport('alice', device, now, { force: true, includeEmpty: true });

  expect(forced).toMatchObject({ reportId: 'r1', periodStart: stored.periodStart, periodEnd: now.toISOString(), appVersion: '0.2.0' });
  expect(row()).toEqual({ periodEnd: now.toISOString(), payload: JSON.stringify(forced), lastError: null });
  expect(selectAll(raw, 'SELECT report_id FROM mobile_diagnostic_reports')).toEqual([{ report_id: 'r1' }]);
});

const file = { clientFileId: '11111111-1111-4111-8111-111111111111', ownerUserId: 'alice', contourId: 'test', assignmentId: 'a', pointId: 'p', localPath: 'file:///photo.jpg', sizeBytes: 100, sha256: 'hash', contentType: 'image/jpeg', mediaKind: 'photo', createdAtLocal: '2026-10-19T00:00:00Z', status: 'queued' } as never;

it('attachment upload failover keeps the network error kind of the last server', async () => {
  s.health.mockResolvedValue({ ok: false, errorKind: 'timeout', message: 'health timed out' });
  const { uploadMobileFile } = await import('@/api/fileApi');
  const { MobileNetworkError } = await import('@/api/networkTimeout');

  const failure = await uploadMobileFile(file).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(MobileNetworkError);
  expect(failure).toMatchObject({ kind: 'timeout', message: expect.stringContaining('https://a, https://b') });
  expect(s.upload).not.toHaveBeenCalled();
});

it('a transport failure on every server surfaces as a network error', async () => {
  s.upload.mockRejectedValue(new Error('socket closed'));
  const { uploadMobileFile } = await import('@/api/fileApi');
  const { MobileNetworkError } = await import('@/api/networkTimeout');

  const failure = await uploadMobileFile(file).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(MobileNetworkError);
  expect(failure).toMatchObject({ kind: 'network' });
  expect(s.upload).toHaveBeenCalledTimes(2);
});
