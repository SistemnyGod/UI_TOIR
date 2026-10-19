import { beforeEach, expect, it, vi } from 'vitest';
import { openRealDatabase, selectAll } from './support/realDatabase';

vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn() }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: Awaited<ReturnType<typeof openRealDatabase>>['raw'];
beforeEach(async () => {
  vi.resetModules();
  ({ raw } = await openRealDatabase());
  raw.prepare(`INSERT INTO mobile_diagnostic_reports (report_id, owner_user_id, period_start, period_end, payload_json, status, created_at_local)
    VALUES ('report-1', 'alice', '2026-10-18T00:00:00Z', '2026-10-19T00:00:00Z', '{"reportId":"report-1","entries":[]}', 'pending', '2026-10-19T00:00:00Z')`).run();
});

it('an unsent diagnostic report does not block sign-out', async () => {
  const { countBlockingLocalUserData } = await import('@/db/repositories/bootstrapRepository');
  expect(await countBlockingLocalUserData()).toBe(0);
});

it('a report is abandoned after the attempt limit and the next period starts after it', async () => {
  const repository = await import('@/db/repositories/diagnosticReportRepository');
  for (let attempt = 1; attempt < repository.MAX_DIAGNOSTIC_REPORT_ATTEMPTS; attempt += 1) {
    await repository.markDiagnosticReportFailed('report-1', 'server unavailable');
  }
  expect(selectAll(raw, 'SELECT status, attempt_count FROM mobile_diagnostic_reports'))
    .toEqual([{ status: 'pending', attempt_count: repository.MAX_DIAGNOSTIC_REPORT_ATTEMPTS - 1 }]);
  await repository.markDiagnosticReportFailed('report-1', 'server unavailable');
  expect(selectAll(raw, 'SELECT status FROM mobile_diagnostic_reports')).toEqual([{ status: 'abandoned' }]);
  expect(await repository.getPendingDiagnosticReport('alice')).toBeNull();
  expect(selectAll(raw, 'SELECT last_period_end FROM mobile_diagnostic_state')).toEqual([{ last_period_end: '2026-10-19T00:00:00Z' }]);
});

it('a permanent server rejection ends the report immediately', async () => {
  const repository = await import('@/db/repositories/diagnosticReportRepository');
  await repository.markDiagnosticReportFailed('report-1', 'HTTP 400', { permanent: true });
  expect(selectAll(raw, 'SELECT status, attempt_count FROM mobile_diagnostic_reports')).toEqual([{ status: 'abandoned', attempt_count: 1 }]);
});

it('only non-retryable 4xx responses count as permanent rejections', async () => {
  const { isPermanentDiagnosticRejection } = await import('@/services/diagnosticReportPolicy');
  expect(isPermanentDiagnosticRejection({ status: 400 })).toBe(true);
  expect(isPermanentDiagnosticRejection({ status: 413 })).toBe(true);
  for (const status of [401, 408, 429, 500, 503]) expect(isPermanentDiagnosticRejection({ status })).toBe(false);
  expect(isPermanentDiagnosticRejection(new Error('network'))).toBe(false);
});
