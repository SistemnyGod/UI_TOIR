import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lock-screen notices for reports stuck on the phone, the "sent automatically"
// confirmation, and how soon the OS background run is requested.
vi.mock('react-native', () => ({ AppState: { currentState: 'background', addEventListener: vi.fn() }, Platform: { OS: 'android' }, Alert: { alert: vi.fn() } }));
vi.mock('expo-notifications', () => ({}));
vi.mock('expo-secure-store', () => ({}));
vi.mock('expo-intent-launcher', () => ({ ActivityAction: {} }));
vi.mock('expo-background-task', () => ({}));
vi.mock('expo-task-manager', () => ({ isTaskDefined: () => true, defineTask: vi.fn() }));
vi.mock('@/db/database', () => ({ initializeDatabase: vi.fn() }));
vi.mock('@/db/repositories/patrolRepository', () => ({ completeAssignmentLocally: vi.fn(), getReportReadiness: vi.fn() }));
vi.mock('@/db/repositories/outboxReadRepository', () => ({ getReportDeliveryStates: vi.fn() }));
vi.mock('@/db/repositories/outboxRepository', () => ({}));
vi.mock('@/db/repositories/reportAutoSubmitRepository', () => Object.fromEntries([
  'computeAssignmentReportFingerprint', 'deleteAutoSubmitTimer', 'finishAutoSubmittedReport', 'getAutoSubmitTimer', 'hasCompletionReport',
  'listAutoSubmitCandidateAssignmentIds', 'listAutoSubmittedReports', 'listUndeliveredReports', 'markReportAutoSubmitted', 'saveAutoSubmitTimer'
].map(name => [name, vi.fn()])));
vi.mock('@/sync/syncEngine', () => ({}));
vi.mock('@/sync/backgroundSyncState', () => ({}));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 1 }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));

import { decideReportNotices, type ReportNoticeKind } from '@/domain/reporting/reportNoticePolicy';
import { createReportNoticeRunner, type ReportNoticeDependencies } from '@/services/reportAutoSubmitService';
import { resolveBackgroundSyncCadence } from '@/services/reportAutoSubmitLifecycle';

const report = (clientOperationId: string, delivery: Parameters<typeof decideReportNotices>[0][number]['delivery'], assignmentId = clientOperationId) =>
  ({ assignmentId, clientOperationId, routeName: 'Насосная', delivery });

describe('report notices', () => {
  it('announces each kind once per report and drops reports that left the queue', () => {
    const first = decideReportNotices([report('r1', 'waitingNetwork'), report('r2', 'waitingAuth'), report('r3', 'repairRequired')], {});
    expect(first.notices.map(notice => [notice.clientOperationId, notice.kind]))
      .toEqual([['r1', 'savedOffline'], ['r2', 'loginRequired'], ['r3', 'needsDecision']]);

    // r1 flapped to a scheduled retry and back: no second "no network" notice.
    const flap = decideReportNotices([report('r1', 'retryScheduled'), report('r2', 'waitingAuth')], first.sent);
    expect(flap.notices).toEqual([]);
    const back = decideReportNotices([report('r1', 'waitingNetwork')], flap.sent);
    expect(back.notices).toEqual([]);
    expect(back.sent).toEqual({ r1: 'savedOffline' });

    const escalated = decideReportNotices([report('r1', 'conflict')], back.sent);
    expect(escalated.notices.map(notice => notice.kind)).toEqual(['needsDecision']);
  });

  it('does not announce queued, sending or delivered reports', () => {
    expect(decideReportNotices([report('a', 'queued'), report('b', 'sending'), report('c', 'delivered')], {}).notices).toEqual([]);
  });
});

describe('notice runner', () => {
  let sent: Record<string, ReportNoticeKind>;
  let deps: ReportNoticeDependencies;
  const presented: string[] = [];
  beforeEach(() => {
    sent = {};
    presented.length = 0;
    deps = {
      getOwnerUserId: async () => 'alice',
      listUndelivered: vi.fn(async () => [
        { assignmentId: 'a', clientOperationId: 'new', routeName: 'Насосная' },
        { assignmentId: 'a', clientOperationId: 'old', routeName: 'Насосная' },
        { assignmentId: 'b', clientOperationId: 'b-op', routeName: null }
      ]),
      getDeliveryStates: vi.fn(async () => new Map([['a', { status: 'waitingNetwork' as const }], ['b', { status: 'repairRequired' as const }]])),
      listAutoSubmitted: vi.fn(async () => [
        { assignmentId: 'done', clientOperationId: 'x', commandStatus: 'accepted', routeName: 'Котельная' },
        { assignmentId: 'gone', clientOperationId: 'y', commandStatus: 'superseded', routeName: null },
        { assignmentId: 'waiting', clientOperationId: 'z', commandStatus: 'waiting_network', routeName: null }
      ]),
      finishAutoSubmitted: vi.fn(async () => {}),
      readSent: async () => sent,
      saveSent: async (next) => { sent = next; },
      present: async (notice) => { presented.push(`${notice.kind}:${notice.clientOperationId}`); },
      presentAutoSent: vi.fn(async () => {}),
      isAppActive: () => false
    };
  });

  it('in the background announces stuck reports once and confirms auto-sent ones', async () => {
    const runner = createReportNoticeRunner(deps);

    await expect(runner.run()).resolves.toMatchObject({ needsDelivery: true });
    expect(presented).toEqual(['savedOffline:new', 'needsDecision:b-op']);
    expect(deps.presentAutoSent).toHaveBeenCalledExactlyOnceWith('done', 'Котельная');
    expect(vi.mocked(deps.finishAutoSubmitted).mock.calls).toEqual([['alice', 'done'], ['alice', 'gone']]);

    await runner.run();
    expect(presented).toHaveLength(2);
  });

  it('in the foreground leaves the state to the screens but still confirms an auto-sent report', async () => {
    deps.isAppActive = () => true;
    await createReportNoticeRunner(deps).run();
    expect(presented).toEqual([]);
    expect(sent).toEqual({});
    expect(deps.presentAutoSent).toHaveBeenCalledOnce();
  });

  it('reports only needing a person do not ask for urgent background runs', async () => {
    deps.getDeliveryStates = vi.fn(async () => new Map([['a', { status: 'waitingAuth' as const }], ['b', { status: 'repairRequired' as const }]]));
    await expect(createReportNoticeRunner(deps).run()).resolves.toMatchObject({ needsDelivery: false });
  });
});

describe('background cadence', () => {
  it('asks for a run within a minute while a report can still leave on its own', () => {
    expect(resolveBackgroundSyncCadence({ submitted: [], armed: [{ assignmentId: 'a', remainingMs: 600_000 }] }, true))
      .toEqual({ minutes: 1, restart: false });
  });

  it('wakes when the auto-submit countdown ends, and otherwise keeps the normal cadence', () => {
    expect(resolveBackgroundSyncCadence({ submitted: [], armed: [{ assignmentId: 'a', remainingMs: 7.5 * 60_000 }] }, false))
      .toEqual({ minutes: 8, restart: true });
    expect(resolveBackgroundSyncCadence({ submitted: [], armed: [{ assignmentId: 'a', remainingMs: 10_000 }] }, false))
      .toEqual({ minutes: 1, restart: true });
    expect(resolveBackgroundSyncCadence({ submitted: [], armed: [] }, false)).toEqual({ minutes: 15, restart: false });
  });
});
