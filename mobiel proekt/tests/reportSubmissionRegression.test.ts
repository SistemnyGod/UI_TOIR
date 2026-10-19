import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getSnapshotRefreshPlan } from '../src/domain/patrol/snapshotPolicy.ts';

// Local commit before delivery, acceptance/repair races, idempotent lifecycle and completion commands,
// completion-time preservation and manual retry are behavior-tested in patrolReportBehavior and
// outboxRecoveryBehavior. Screen wiring and wording stay here.
const reportScreenSource = readFileSync(new URL('../src/features/patrol/SubmitReportScreen.tsx', import.meta.url), 'utf8');
const requestScreenSource = readFileSync(new URL('../src/features/patrol/PatrolRequestScreen.tsx', import.meta.url), 'utf8');
const activePatrolScreenSource = readFileSync(new URL('../src/features/patrol/ActivePatrolScreen.tsx', import.meta.url), 'utf8');
const scanNfcScreenSource = readFileSync(new URL('../src/features/patrol/ScanNfcScreen.tsx', import.meta.url), 'utf8');
const nfcServiceSource = readFileSync(new URL('../src/services/nfcService.ts', import.meta.url), 'utf8');
const attachmentPolicySource = readFileSync(new URL('../src/domain/files/completionAttachmentPolicy.ts', import.meta.url), 'utf8');

const has = (source: string, value: string) => assert.ok(source.includes(value), value);

test('report screen queues the report without a blocking alert', () => {
  has(reportScreenSource, 'queuePatrolReport(assignmentId)');
  assert.ok(!reportScreenSource.includes('Alert.alert'));
});

test('request screen serializes acceptance actions', () => {
  has(requestScreenSource, 'actionInProgressRef.current');
});

test('NFC waits for a non-empty route snapshot and arms automatically', () => {
  has(activePatrolScreenSource, 'isReadyForReview');
  has(activePatrolScreenSource, 'router.push');
  has(activePatrolScreenSource, '/submit');
  has(scanNfcScreenSource, 'loadedProgress.total === 0');
  has(scanNfcScreenSource, "show('routeUnavailable'");
  has(scanNfcScreenSource, 'await armReader()');
  has(scanNfcScreenSource, 'startNfcReaderSession(handleTag)');
  has(scanNfcScreenSource, 'screenActiveRef.current = false');
  has(scanNfcScreenSource, 'stopNfcReaderSession()');
  assert.ok(!scanNfcScreenSource.includes('onPress={handleScan}'));
  assert.ok(!nfcServiceSource.includes('requestTechnology'));
});

test('active patrol recovers from reload failures and serializes actions', () => {
  has(activePatrolScreenSource, 'Promise.all');
  has(activePatrolScreenSource, 'finally');
  has(activePatrolScreenSource, 'setIsLoading(false)');
  has(activePatrolScreenSource, 'actionInProgressRef.current');
  has(activePatrolScreenSource, 'patrol.active-sync-load.failed');
  has(activePatrolScreenSource, 'patrol.active-reconcile.failed');
});

test('snapshot freeze uses local lifecycle and attachment errors are user-facing', () => {
  assert.deepEqual(getSnapshotRefreshPlan({ localStatus: 'inProgress', localSnapshotVersion: 1, localPointCount: 1, routeVersion: 2, incomingPointIds: ['new-point'] }),
    { shouldReplace: false, snapshotVersion: 1, pointIds: ['new-point'] });
  assert.equal(getSnapshotRefreshPlan({ localStatus: 'inProgress', localSnapshotVersion: 99, localPointCount: 0, routeVersion: 1, incomingPointIds: ['assigned-point'] }).snapshotVersion, 1);
  assert.ok(!attachmentPolicySource.includes('local file'));
  assert.ok(!attachmentPolicySource.includes('video exceeds'));
  assert.ok(!attachmentPolicySource.includes('photo exceeds'));
  assert.ok(!attachmentPolicySource.includes('required evidence'));
});

// One-click submission and the synchronous duplicate guard are exercised on the
// mounted screen in submitReportUi.vitest.test.ts.
