import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ owner: 'alice', generation: 0, online: true, claim: vi.fn(), batch: vi.fn(), post: vi.fn(), health: vi.fn(), files: vi.fn(), unconfirmed: vi.fn(), receipt: vi.fn(), applied: vi.fn(), cleanup: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => s.owner, getAccessToken: async () => 'token' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => s.generation }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => s.online }));
vi.mock('@/api/serverHealthApi', () => ({ checkServerConnection: s.health }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessToken: async () => 'token', refreshStoredAccessTokenIfNeeded: async () => 'token' }));
vi.mock('@/api/mobileApi', () => ({ postOutbox: s.post, getOutboxResult: s.receipt }));
vi.mock('@/api/fileApi', () => ({ uploadMobileFile: vi.fn() }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/diagnosticReportService', () => ({ triggerReportDeliveryDiagnostic: vi.fn() }));
vi.mock('@/services/localMediaReclamationService', () => ({ reclaimAcceptedLocalMedia: s.cleanup }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/repositories/filesRepository', () => ({ listFilesByClientIds: s.files, listWorkTaskFiles: async () => [], markFileUploaded: vi.fn(), markFileUploadFailed: vi.fn(), markFileUploading: vi.fn() }));
vi.mock('@/sync/outboxProcessor', () => ({ getPendingOutboxBatch: s.batch }));
vi.mock('@/sync/outboxRetryScheduler', () => ({ scheduleNextOutboxRetry: async () => {} }));
vi.mock('@/db/repositories/outboxRepository', () => {
  const names = ['activateNetworkRecoveredOutboxCommands', 'activateRetryableOutboxCommandsForImmediateRetry', 'activateRetryableReportCommands', 'activateWaitingAuthOutboxCommands', 'activateWrongContourOutboxCommands', 'applyOutboxResponses', 'markPendingOutboxCommandsAuthRequired', 'markPendingOutboxCommandsWaitingNetwork', 'markPendingOutboxCommandsWrongContour', 'markOutboxCommandsWrongContour', 'markOutboxCommandsRejected', 'markOutboxCommandsRetryLater', 'markPendingOutboxCommandsRetryLater', 'reactivateRecoverableRejectedPointCommands', 'reactivateRecoverableRejectedStartCommands', 'resetSendingOutboxCommandsForProcessRestart', 'resetStaleSendingOutboxCommands'];
  return { ...Object.fromEntries(names.map(name => [name, vi.fn(async () => {})])),
    applyOutboxResponses: s.applied, markOutboxCommandsSending: s.claim, countRetryableOutboxCommands: async () => 0, countOutboxDeliveryProblems: async () => 0,
    finalizeAcceptedCompleteReportCommands: async () => ({ finalized: 0 }), getNextOutboxRetryAt: async () => null,
    listUnconfirmedCompleteReportCommands: s.unconfirmed, quarantineInvalidPatrolCompletionCommands: async () => ({ assignmentIds: [] }), markReportDeliveryDiagnosticIfDue: async () => false
  };
});
import { runForegroundSync, reconcileAcceptedCompleteReports, runBackgroundOutboxSync } from '@/sync/syncEngine';
import { subscribeToSyncEvents } from '@/sync/syncEvents';
const command = { clientOperationId: 'op', ownerUserId: 'alice', contourId: 'test', commandType: 'savePatrolPointResult', entityType: 'patrolPoint', entityLocalId: 'point', payload: { assignmentId: 'assignment', mediaClientFileIds: [] }, createdAtLocal: '2026-09-30', status: 'pending', attemptCount: 0 };
beforeEach(() => {
  s.owner = 'alice'; s.generation = 0; s.online = true; vi.clearAllMocks();
  s.cleanup.mockReset().mockResolvedValue(undefined);
  s.unconfirmed.mockReset().mockResolvedValue([]); s.receipt.mockReset().mockResolvedValue(null); s.applied.mockReset().mockResolvedValue(undefined);
  s.claim.mockReset().mockResolvedValue(1); s.health.mockReset().mockResolvedValue({ ok: true });
  s.files.mockReset().mockResolvedValue([]); s.post.mockReset().mockResolvedValue([]);
  s.batch.mockReset().mockResolvedValueOnce([command]).mockResolvedValue([]);
});
it('never posts a command after cancellation or another worker wins the claim', async () => {
  s.claim.mockResolvedValue(0);
  expect(await runForegroundSync()).toMatchObject({ sent: 0 });
  expect(s.post).not.toHaveBeenCalled(); expect(s.files).not.toHaveBeenCalled();
});
it('does not claim or post old-owner operations after a switch during preparation', async () => {
  s.health.mockImplementation(async () => { s.owner = 'bob'; s.generation++; return { ok: true }; });
  await expect(runForegroundSync()).rejects.toThrow('Устаревший');
  expect(s.claim).not.toHaveBeenCalled(); expect(s.post).not.toHaveBeenCalled();
});
it('stops delivery after a switch between claiming and reading attachment records', async () => {
  s.files.mockImplementation(async () => { s.generation++; return []; });
  await expect(runForegroundSync()).rejects.toThrow('Устаревший');
  expect(s.claim).toHaveBeenCalledOnce(); expect(s.post).not.toHaveBeenCalled();
});
it('posts a successfully claimed same-session operation', async () => {
  await runForegroundSync();
  expect(s.claim).toHaveBeenCalledWith('alice', ['op'], command.payload);
  expect(s.post).toHaveBeenCalledWith([command]);
});

const report = { ...command, clientOperationId: 'report-op', commandType: 'completePatrolAssignment', entityType: 'patrolAssignment', entityLocalId: 'assignment', payload: { assignmentId: 'assignment', pointResults: [] } };
const tick = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };

it('updates the open report during upload and immediately after its receipt, before an unrelated slow operation', async () => {
  let finishReport!: (value: any) => void;
  let finishOther!: (value: any) => void;
  let persisted = false;
  const seen: boolean[] = [];
  s.batch.mockReset().mockResolvedValueOnce([report, { ...command, clientOperationId: 'other-op', payload: { assignmentId: 'other', mediaClientFileIds: [] } }]).mockResolvedValue([]);
  s.post.mockImplementationOnce(() => new Promise(resolve => { finishReport = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishOther = resolve; }));
  s.applied.mockImplementation(async () => { persisted = true; });
  const stop = subscribeToSyncEvents(event => {
    if (event.deliveryChangedAssignmentIds?.includes('assignment')) seen.push(persisted);
  });
  const pending = runForegroundSync();
  try {
    await tick();
    const whileUploading = seen.slice();
    finishReport([{ clientOperationId: 'report-op', status: 'accepted' }]);
    await tick();
    const whileOtherPending = seen.slice();
    finishOther([]);
    await pending;
    expect(whileUploading).toContain(false);
    expect(whileOtherPending).toContain(true);
  } finally { stop(); }
});

it('manual retry offline does not wait for remote receipts', async () => {
  s.online = false;
  s.unconfirmed.mockResolvedValue([report]);
  await expect(runForegroundSync({ mode: 'manualReport', assignmentId: 'assignment' })).resolves.toMatchObject({ skipped: 'offline' });
  expect(s.receipt).not.toHaveBeenCalled();
  expect(s.post).not.toHaveBeenCalled();
});

it('manual retry checks a missing receipt once before safe resend with the same operation id', async () => {
  s.unconfirmed.mockResolvedValue([report]);
  s.batch.mockReset().mockResolvedValueOnce([report]).mockResolvedValue([]);
  await runForegroundSync({ mode: 'manualReport', assignmentId: 'assignment' });
  expect(s.receipt).toHaveBeenCalledExactlyOnceWith('report-op');
  expect(s.post).toHaveBeenCalledWith([report]);
});

it('receipt recovery updates the report before slow media cleanup completes', async () => {
  let finishCleanup!: () => void;
  s.cleanup.mockImplementation(() => new Promise<void>(resolve => { finishCleanup = resolve; }));
  s.unconfirmed.mockResolvedValue([report]);
  s.receipt.mockResolvedValue({ clientOperationId: 'report-op', status: 'accepted' });
  const events: any[] = [];
  const stop = subscribeToSyncEvents(event => events.push(event));
  const recovery = reconcileAcceptedCompleteReports('assignment');
  await tick();
  const beforeCleanup = events.slice();
  finishCleanup();
  await recovery;
  stop();
  expect(s.applied).toHaveBeenCalledOnce();
  expect(beforeCleanup.some(event => event.completedAssignmentIds.includes('assignment'))).toBe(true);
});

it('manual report preempts between normal commands and preserves its dependency order', async () => {
  let finishFirst!: (value: any) => void;
  const order: string[] = [];
  const unrelated = { ...command, clientOperationId: 'unrelated', payload: { assignmentId: 'other' } };
  const point = { ...command, clientOperationId: 'report-point' };
  let normalRead = 0; let reportRead = 0;
  s.batch.mockReset().mockImplementation(async (_owner, _limit, _attempted, aggregate) => {
    if (aggregate === 'patrolAssignment:other') return [unrelated];
    if (aggregate) return reportRead++ === 0 ? [point] : reportRead === 2 ? [report] : [];
    return normalRead++ === 0 ? [command, unrelated] : [];
  });
  s.post.mockImplementation(async ([item]) => {
    order.push(item.clientOperationId);
    if (item === command) return new Promise(resolve => { finishFirst = resolve; });
    return [{ clientOperationId: item.clientOperationId, status: 'accepted' }];
  });
  const normal = runForegroundSync();
  await tick();
  const manual = runForegroundSync({ mode: 'manualReport', assignmentId: 'assignment' });
  await tick();
  expect(order).toEqual(['op']);
  finishFirst([{ clientOperationId: 'op', status: 'accepted' }]);
  await Promise.all([normal, manual]);
  expect(order).toEqual(['op', 'report-point', 'report-op', 'unrelated']);
});

it('a queued manual request cannot start under a replacement session', async () => {
  let finish!: (value: any) => void;
  s.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const normal = runForegroundSync();
  await tick();
  const manual = runForegroundSync({ mode: 'manualReport', assignmentId: 'assignment' });
  const rejectedManual = expect(manual).rejects.toThrow('Сессия изменилась');
  const rejectedNormal = expect(normal).rejects.toThrow('Устаревший');
  s.generation++;
  finish([]);
  await Promise.all([rejectedManual, rejectedNormal]);
  expect(s.post).toHaveBeenCalledOnce();
});

it('resuming a paused pass respects a retry scheduled by the priority request', async () => {
  let finishFirst!: (value: any) => void;
  const head = { ...report, clientOperationId: 'retry-report' };
  let normalReads = 0; let manualReads = 0;
  s.batch.mockReset().mockImplementation(async (_owner, _limit, _attempted, aggregate) => aggregate
    ? manualReads++ === 0 ? [head] : []
    : normalReads++ === 0 ? [command, head] : []);
  s.post.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
    .mockResolvedValue([{ clientOperationId: head.clientOperationId, status: 'retryLater', retryAfterSeconds: 120 }]);
  const normal = runForegroundSync();
  await tick();
  const manual = runForegroundSync({ mode: 'manualReport', assignmentId: 'assignment' });
  finishFirst([]);
  await Promise.all([normal, manual]);
  expect(s.post.mock.calls.map(([items]) => items[0].clientOperationId)).toEqual(['op', 'retry-report']);
});

it('background completion waits for the next batch instead of leaving a detached continuation', async () => {
  let finishLast!: (value: any) => void;
  const commands = Array.from({ length: 6 }, (_, index) => ({ ...command, clientOperationId: `background-${index}` }));
  let sent = 0; let completed = false;
  s.batch.mockReset().mockImplementation(async () => commands[sent] ? [commands[sent]] : []);
  s.post.mockImplementation(async ([item]) => {
    if (item.clientOperationId === 'background-5') return new Promise(resolve => { finishLast = resolve; });
    sent++;
    return [{ clientOperationId: item.clientOperationId, status: 'accepted' }];
  });
  const task = runBackgroundOutboxSync().then(result => { completed = true; return result; });
  await vi.waitFor(() => expect(s.post).toHaveBeenCalledTimes(6));
  expect(completed).toBe(false);
  sent++;
  finishLast([{ clientOperationId: 'background-5', status: 'accepted' }]);
  await expect(task).resolves.toMatchObject({ sent: 6, hasMore: false });
});
