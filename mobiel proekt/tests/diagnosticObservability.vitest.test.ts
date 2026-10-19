import { beforeEach, expect, it, vi } from 'vitest';
import { openRealDatabase } from './support/realDatabase';

const s = vi.hoisted(() => ({ post: vi.fn(async (_report: unknown) => {}) }));
vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'report-uuid' }));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {} }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn() }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ postDailyDiagnosticReport: s.post }));
vi.mock('@/auth/appMetadata', () => ({ getAppRuntimeMetadata: () => ({ appVersion: '0.1.51', platform: 'android' }) }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/services/diagnosticContextService', () => ({ collectDiagnosticContext: async () => undefined }));

let raw: Awaited<ReturnType<typeof openRealDatabase>>['raw'];
const memory = { text: null as string | null };

beforeEach(async () => {
  vi.resetModules();
  s.post.mockReset().mockResolvedValue(undefined);
  memory.text = null;
  ({ raw } = await openRealDatabase());
  const store = await import('@/services/crashRecordStore');
  store.setCrashRecordStorageForTests({
    read: () => memory.text,
    write: (text) => { memory.text = text; },
    remove: () => { memory.text = null; }
  });
});

function insertCommand(id: string, values: { type?: string; status: string; created: string; updated?: string; owner?: string }) {
  raw.prepare(`INSERT INTO outbox_commands (client_operation_id, owner_user_id, contour_id, command_type, entity_type, payload_json, created_at_local, updated_at_local, status)
    VALUES (?, ?, 'test', ?, 'patrolAssignment', '{}', ?, ?, ?)`)
    .run(id, values.owner ?? 'alice', values.type ?? 'completePatrolAssignment', values.created, values.updated ?? null, values.status);
}

it('median and maximum ignore negative and unreadable durations', async () => {
  const { summarizeDeliveryLatencies } = await import('@/services/diagnosticReportPolicy');
  expect(summarizeDeliveryLatencies([])).toEqual({ count: 0, medianSeconds: null, maxSeconds: null });
  expect(summarizeDeliveryLatencies([30, 10, 20])).toEqual({ count: 3, medianSeconds: 20, maxSeconds: 30 });
  expect(summarizeDeliveryLatencies([40, 10, 20, 30, -5, Number.NaN])).toEqual({ count: 4, medianSeconds: 25, maxSeconds: 40 });
});

it('reports the oldest undelivered command and save-to-receipt times of reports delivered in the period', async () => {
  // Undelivered: the oldest one waits since 06:00; an accepted command is not "undelivered".
  insertCommand('waiting-auth', { type: 'scanPatrolPointNfc', status: 'waiting_auth', created: '2026-10-19T06:00:00.000Z' });
  insertCommand('pending', { type: 'markPatrolPointOk', status: 'pending', created: '2026-10-19T08:00:00.000Z' });
  insertCommand('old-accepted', { type: 'markPatrolPointOk', status: 'accepted', created: '2026-10-18T01:00:00.000Z', updated: '2026-10-18T01:00:05.000Z' });
  // Delivered reports in the period: 60 s, 120 s and 1 h.
  insertCommand('report-a', { status: 'accepted', created: '2026-10-19T07:00:00.000Z', updated: '2026-10-19T07:01:00.000Z' });
  insertCommand('report-b', { status: 'duplicate', created: '2026-10-19T07:30:00.000Z', updated: '2026-10-19T07:32:00.000Z' });
  insertCommand('report-c', { status: 'accepted', created: '2026-10-19T03:00:00.000Z', updated: '2026-10-19T04:00:00.000Z' });
  // Outside the period, not yet delivered, or another account: ignored.
  insertCommand('report-before', { status: 'accepted', created: '2026-10-18T05:00:00.000Z', updated: '2026-10-18T07:00:00.000Z' });
  insertCommand('report-sending', { status: 'sending', created: '2026-10-19T08:30:00.000Z' });
  insertCommand('report-bob', { status: 'accepted', created: '2026-10-19T07:00:00.000Z', updated: '2026-10-19T09:00:00.000Z', owner: 'bob' });

  const { readDeliveryMetrics } = await import('@/db/repositories/diagnosticReportRepository');
  const metrics = await readDeliveryMetrics('alice', new Date('2026-10-18T09:00:00.000Z'), new Date('2026-10-19T09:00:00.000Z'));

  expect(metrics).toEqual({
    oldestUndeliveredCommandAgeSeconds: 3 * 3600,
    deliveredReportCount: 3,
    reportDeliveryMedianSeconds: 120,
    reportDeliveryMaxSeconds: 3600
  });
});

it('an empty outbox gives null ages and no deliveries', async () => {
  const { readDeliveryMetrics } = await import('@/db/repositories/diagnosticReportRepository');
  expect(await readDeliveryMetrics('alice', new Date('2026-10-18T09:00:00.000Z'), new Date('2026-10-19T09:00:00.000Z'))).toEqual({
    oldestUndeliveredCommandAgeSeconds: null, deliveredReportCount: 0, reportDeliveryMedianSeconds: null, reportDeliveryMaxSeconds: null
  });
});

it('a crash from the previous run is sent in the daily report and deleted once the server accepts it', async () => {
  const store = await import('@/services/crashRecordStore');
  store.recordCrash('js.fatal', new Error('token=abc123 failed at https://10.0.0.5/api/v1/mobile/bootstrap'), { now: new Date(Date.now() - 60_000) });
  insertCommand('report-a', { status: 'accepted', created: new Date(Date.now() - 3_600_000).toISOString(), updated: new Date(Date.now() - 3_500_000).toISOString() });

  const service = await import('@/services/diagnosticReportService');
  expect(await service.triggerDailyDiagnosticReportUpload()).toEqual({ status: 'sent', reportId: 'report-uuid' });

  const sent = s.post.mock.calls[0][0] as { entries: { eventType: string; message: string; count: number }[]; delivery: unknown };
  expect(sent.entries[0]).toMatchObject({ eventType: 'app.crash.js.fatal', count: 1 });
  expect(sent.entries[0].message).not.toMatch(/abc123|10\.0\.0\.5|AI_server/);
  expect(sent.delivery).toEqual({
    oldestUndeliveredCommandAgeSeconds: null, deliveredReportCount: 1, reportDeliveryMedianSeconds: 100, reportDeliveryMaxSeconds: 100
  });
  expect(store.readCrashRecords()).toEqual([]);
  expect(memory.text).toBeNull();
});

it('crash records stay on the phone while the server has not accepted the report', async () => {
  const store = await import('@/services/crashRecordStore');
  store.recordCrash('render', new Error('screen failed'), { now: new Date(Date.now() - 60_000) });
  s.post.mockRejectedValue(Object.assign(new Error('Service unavailable'), { status: 503 }));

  const service = await import('@/services/diagnosticReportService');
  expect(await service.triggerDailyDiagnosticReportUpload()).toMatchObject({ status: 'failed' });
  expect(store.readCrashRecords()).toEqual([expect.objectContaining({ kind: 'render' })]);
});
