import assert from 'node:assert/strict';
import test from 'node:test';
import { getSnapshotRefreshPlan } from '../src/domain/patrol/snapshotPolicy.ts';

// Local commit before delivery, acceptance races and completion are behavior-tested in
// patrolReportBehavior and outboxRecoveryBehavior; the screens in submitReportUi,
// patrolRequestUi, activePatrolUi and scanFeedbackUi; attachment wording in
// completionAttachmentPreflight.
test('a started patrol keeps its frozen route snapshot when the route version moves ahead', () => {
  assert.deepEqual(getSnapshotRefreshPlan({ localStatus: 'inProgress', localSnapshotVersion: 1, localPointCount: 1, routeVersion: 2, incomingPointIds: ['new-point'] }),
    { shouldReplace: false, snapshotVersion: 1, pointIds: ['new-point'] });
  assert.equal(getSnapshotRefreshPlan({ localStatus: 'inProgress', localSnapshotVersion: 99, localPointCount: 0, routeVersion: 1, incomingPointIds: ['assigned-point'] }).snapshotVersion, 1);
});
