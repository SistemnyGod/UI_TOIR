import { beforeEach, expect, it, vi } from 'vitest';

// Behavior of the diagnostic upload queue: a manual upload requested during an automatic
// one waits for it, then runs forced (ignoring the automatic-upload setting and including
// an empty report). Preparation errors become a visible "failed" result.
const state = vi.hoisted(() => ({
  automatic: 'true' as string | null,
  prepare: vi.fn(),
  post: vi.fn(async () => {}),
  sent: vi.fn(async () => {})
}));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => state.automatic, setItemAsync: async () => {} }));
vi.mock('@/api/mobileApi', () => ({ postDailyDiagnosticReport: state.post }));
vi.mock('@/auth/appMetadata', () => ({ getAppRuntimeMetadata: () => ({ appVersion: '0.1.51', platform: 'android' }) }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/db/repositories/diagnosticReportRepository', () => ({
  getOrCreatePendingDiagnosticReport: state.prepare,
  getPendingDiagnosticReport: vi.fn(async () => null),
  listDiagnosticReports: vi.fn(async () => []),
  markDiagnosticReportFailed: vi.fn(async () => {}),
  markDiagnosticReportSent: state.sent
}));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => true }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/services/diagnosticContextService', () => ({ collectDiagnosticContext: async () => ({}) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const preparedOptions = () => state.prepare.mock.calls.map(call => call[3] as { force: boolean; includeEmpty: boolean });

beforeEach(() => {
  vi.resetModules();
  state.automatic = 'true';
  state.prepare.mockReset();
  state.post.mockClear();
  state.sent.mockClear();
});

it('queues a manual upload behind an active automatic upload and then runs it forced', async () => {
  const daily = deferred<unknown>();
  state.prepare
    .mockImplementationOnce(() => daily.promise)
    .mockImplementationOnce(async () => ({ reportId: 'manual-report' }));
  const service = await import('@/services/diagnosticReportService');

  const automatic = service.triggerDailyDiagnosticReportUpload();
  await flush();
  const manual = service.triggerManualDiagnosticReportUpload();
  await flush();

  expect(manual).not.toBe(automatic);
  expect(state.prepare).toHaveBeenCalledTimes(1);
  // The automatic setting must not block the queued manual upload.
  state.automatic = 'false';

  daily.resolve(null);
  expect(await automatic).toEqual({ status: 'notDue' });
  expect(await manual).toEqual({ status: 'sent', reportId: 'manual-report' });
  expect(preparedOptions()).toEqual([
    expect.objectContaining({ force: false, includeEmpty: false }),
    expect.objectContaining({ force: true, includeEmpty: true })
  ]);
  expect(state.post).toHaveBeenCalledWith({ reportId: 'manual-report' });
});

it('joins repeated requests instead of starting parallel uploads', async () => {
  const daily = deferred<unknown>();
  state.prepare.mockImplementationOnce(() => daily.promise).mockImplementation(async () => ({ reportId: 'manual-report' }));
  const service = await import('@/services/diagnosticReportService');

  const automatic = service.triggerDailyDiagnosticReportUpload();
  await flush();
  expect(service.triggerDailyDiagnosticReportUpload()).toBe(automatic);
  const firstManual = service.triggerManualDiagnosticReportUpload();
  const secondManual = service.triggerManualDiagnosticReportUpload();
  expect(secondManual).toBe(firstManual);

  daily.resolve(null);
  await Promise.all([automatic, firstManual]);
  expect(state.prepare).toHaveBeenCalledTimes(2);
});

it('reports a preparation failure as a failed result', async () => {
  state.prepare.mockRejectedValueOnce(new Error('disk full'));
  const service = await import('@/services/diagnosticReportService');

  expect(await service.triggerManualDiagnosticReportUpload()).toEqual({ status: 'failed', message: 'disk full' });
});
