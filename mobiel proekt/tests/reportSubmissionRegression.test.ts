import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repositorySource = readFileSync(new URL('../src/db/repositories/patrolRepository.ts', import.meta.url), 'utf8');
const reportScreenSource = readFileSync(new URL('../src/features/patrol/SubmitReportScreen.tsx', import.meta.url), 'utf8');
const reportCoordinatorSource = readFileSync(new URL('../src/features/patrol/reportSubmissionCoordinator.ts', import.meta.url), 'utf8');
const requestScreenSource = readFileSync(new URL('../src/features/patrol/PatrolRequestScreen.tsx', import.meta.url), 'utf8');
const outboxRepositorySource = readFileSync(new URL('../src/db/repositories/outboxRepository.ts', import.meta.url), 'utf8');
const activePatrolScreenSource = readFileSync(new URL('../src/features/patrol/ActivePatrolScreen.tsx', import.meta.url), 'utf8');
const scanNfcScreenSource = readFileSync(new URL('../src/features/patrol/ScanNfcScreen.tsx', import.meta.url), 'utf8');
const nfcServiceSource = readFileSync(new URL('../src/services/nfcService.ts', import.meta.url), 'utf8');
const bootstrapRepositorySource = readFileSync(new URL('../src/db/repositories/bootstrapRepository.ts', import.meta.url), 'utf8');
const attachmentPolicySource = readFileSync(new URL('../src/domain/files/completionAttachmentPolicy.ts', import.meta.url), 'utf8');

const has = (source: string, value: string) => assert.ok(source.includes(value), value);

test('report submission commits locally before background delivery', () => {
  const completion = repositorySource.slice(
    repositorySource.indexOf('export async function completeAssignmentLocally'),
    repositorySource.indexOf('export async function getAssignmentProgress')
  );

  assert.ok(!completion.includes('requestSyncAfterMutation()'));
  has(reportCoordinatorSource, 'await completeAssignmentLocally(assignmentId)');
  has(reportCoordinatorSource, "void requestPatrolSync({ mode: 'manualReport', assignmentId }).catch");
  has(reportScreenSource, 'queuePatrolReport(assignmentId)');
  assert.ok(!reportScreenSource.includes('Alert.alert'));
});
test('request acceptance and report repair cannot regress concurrently', () => {
  const acceptance = repositorySource.slice(
    repositorySource.indexOf('export async function acceptRequestLocally'),
    repositorySource.indexOf('export async function releaseAcceptedRequestLocally')
  );
  const repair = repositorySource.slice(
    repositorySource.indexOf('export async function reopenInvalidCompletionReportLocally'),
    repositorySource.indexOf('export async function completeAssignmentLocally')
  );
  const completion = repositorySource.slice(
    repositorySource.indexOf('export async function completeAssignmentLocally'),
    repositorySource.indexOf('export async function getAssignmentProgress')
  );

  has(requestScreenSource, 'actionInProgressRef.current');
  has(acceptance, 'request_id = ?');
  has(acceptance, 'assignment_id <> ?');
  has(acceptance, 'status NOT IN');
  has(repair, 'if (assignmentUpdate.changes === 1)');
  has(repair, "SET status = 'inProgress'");
  has(completion, 'WHERE owner_user_id = ?');
  has(completion, 'AND contour_id = ?');
  has(completion, 'AND assignment_id = ?');
});

test('lifecycle and completed report commands are idempotent', () => {
  const lifecycle = repositorySource.slice(
    repositorySource.indexOf('async function updateAssignmentLifecycleLocally'),
    repositorySource.indexOf('async function snapshotRoutePointsInTransaction')
  );
  const completeLookup = repositorySource.slice(
    repositorySource.indexOf('async function getQueuedCompleteAssignmentCommand'),
    repositorySource.indexOf('async function requireOwnerUserId')
  );

  has(lifecycle, 'current.status === "inProgress"');
  has(lifecycle, 'lifecycleChanged = true');
  has(lifecycle, 'if (lifecycleChanged) {');
  has(lifecycle, 'requestSyncAfterMutation()');
  has(completeLookup, "'waiting_network'");
  has(completeLookup, "'waiting_auth'");
  has(completeLookup, "'wrong_contour'");
  has(completeLookup, "'conflict'");
  assert.ok(!completeLookup.includes("'rejected'"));
});

test('manual retry reactivates server failures without bypassing rate limits', () => {
  const activation = outboxRepositorySource.slice(
    outboxRepositorySource.indexOf('export async function activateRetryableReportCommands'),
    outboxRepositorySource.indexOf('export async function activateRetryableOutboxCommandsForImmediateRetry')
  );

  has(activation, "status IN ('waiting_network', 'retryLater') THEN 'pending'");
  has(activation, "COALESCE(retry_reason, 'unknown') <> 'rateLimit'");
});

test('NFC waits for a non-empty route snapshot and arms automatically', () => {
  has(activePatrolScreenSource, 'isReadyForReview');
  has(activePatrolScreenSource, 'router.push');
  has(activePatrolScreenSource, '/submit');
  has(scanNfcScreenSource, 'loadedProgress.total === 0');
  has(scanNfcScreenSource, "setStatus('routeUnavailable')");
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
  has(bootstrapRepositorySource, 'includes(local.status)');
  has(bootstrapRepositorySource, 'local.snapshotVersion ?? assignment.routeVersionNo');
  assert.ok(!attachmentPolicySource.includes('local file'));
  assert.ok(!attachmentPolicySource.includes('video exceeds'));
  assert.ok(!attachmentPolicySource.includes('photo exceeds'));
  assert.ok(!attachmentPolicySource.includes('required evidence'));
});

test('report screen uses a large confirmation sheet and one local submit action', () => {
  has(reportScreenSource, 'ConfirmationSheet');
  has(reportScreenSource, 'setIsConfirmOpen(true)');
  has(reportScreenSource, 'confirmLocalSubmission');
  has(reportScreenSource, 'setSyncNotice(');
});
