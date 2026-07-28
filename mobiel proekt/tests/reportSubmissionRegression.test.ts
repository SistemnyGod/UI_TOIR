import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositorySource = readFileSync(
  new URL("../src/db/repositories/patrolRepository.ts", import.meta.url),
  "utf8"
);
const reportScreenSource = readFileSync(
  new URL("../src/features/patrol/SubmitReportScreen.tsx", import.meta.url),
  "utf8"
);const outboxRepositorySource = readFileSync(
  new URL("../src/db/repositories/outboxRepository.ts", import.meta.url),
  "utf8"
);
const activePatrolScreenSource = readFileSync(
  new URL("../src/features/patrol/ActivePatrolScreen.tsx", import.meta.url),
  "utf8"
);
const scanNfcScreenSource = readFileSync(
  new URL("../src/features/patrol/ScanNfcScreen.tsx", import.meta.url),
  "utf8"
);const bootstrapRepositorySource = readFileSync(
  new URL("../src/db/repositories/bootstrapRepository.ts", import.meta.url),
  "utf8"
);
const attachmentPolicySource = readFileSync(
  new URL("../src/domain/files/completionAttachmentPolicy.ts", import.meta.url),
  "utf8"
);

test("manual report submission owns one scoped sync pass", () => {
  const completion = repositorySource.slice(
    repositorySource.indexOf("export async function completeAssignmentLocally"),
    repositorySource.indexOf("export async function getAssignmentProgress")
  );
  const submitBranch = reportScreenSource.slice(
    reportScreenSource.indexOf('if (presentation.action === "submit")'),
    reportScreenSource.indexOf('const syncResult = await requestPatrolSync({ mode: "manualReport", assignmentId });', reportScreenSource.indexOf('if (presentation.action === "submit")')) + 100
  );

  assert.doesNotMatch(completion, /requestSyncAfterMutation\(\)/);
  assert.match(submitBranch, /await requestPatrolSync\(\{ mode: "manualReport", assignmentId \}\)/);
  assert.doesNotMatch(submitBranch, /void requestPatrolSync|mode: "normal"/);
});

test("lifecycle and completed report commands are idempotent", () => {
  const lifecycle = repositorySource.slice(
    repositorySource.indexOf("async function updateAssignmentLifecycleLocally"),
    repositorySource.indexOf("async function snapshotRoutePointsInTransaction")
  );
  const completeLookup = repositorySource.slice(
    repositorySource.indexOf("async function getQueuedCompleteAssignmentCommand"),
    repositorySource.indexOf("async function requireOwnerUserId")
  );

  assert.match(lifecycle, /current\.status === "inProgress"[\s\S]*?return;/);
  assert.match(lifecycle, /lifecycleChanged = true/);
  assert.match(lifecycle, /if \(lifecycleChanged\) \{[\s\S]*?requestSyncAfterMutation\(\)/);
  assert.match(completeLookup, /'waiting_network'.*'waiting_auth'/s);
  assert.match(completeLookup, /'wrong_contour'.*'conflict'/s);
  assert.doesNotMatch(completeLookup, /'rejected'.*'invalidPayload'/s);
});
test("manual retry reactivates server failures without bypassing rate limits", () => {
  const activation = outboxRepositorySource.slice(
    outboxRepositorySource.indexOf("export async function activateRetryableReportCommands"),
    outboxRepositorySource.indexOf("export async function activateRetryableOutboxCommandsForImmediateRetry")
  );

  assert.match(activation, /status IN \('waiting_network', 'retryLater'\) THEN 'pending'/);
  assert.match(activation, /COALESCE\(retry_reason, 'unknown'\) <> 'rateLimit'/);
});

test("NFC waits for a non-empty route snapshot", () => {
  assert.match(activePatrolScreenSource, /disabled=\{isActing \|\| progress\.total === 0\}/);
  assert.match(scanNfcScreenSource, /if \(autoScanStartedRef\.current \|\| progress === null\)/);
  assert.match(scanNfcScreenSource, /if \(loadedProgress\.total === 0\)[\s\S]*setStatus\("routeUnavailable"\)/);
  assert.match(activePatrolScreenSource, /progress\.total === 0 \? "Загружаем точки маршрута"/);
});
test("active patrol recovers from reload failures and serializes actions", () => {
  assert.match(activePatrolScreenSource, /try \{[\s\S]*Promise\.all\([\s\S]*finally \{[\s\S]*setIsLoading\(false\)/);
  assert.match(activePatrolScreenSource, /actionInProgressRef\.current/);
  assert.match(activePatrolScreenSource, /patrol\.active-sync-load\.failed/);
  assert.match(activePatrolScreenSource, /patrol\.active-reconcile\.failed/);
});

test("snapshot freeze uses local lifecycle and attachment errors are user-facing", () => {
  assert.match(bootstrapRepositorySource, /includes\(local\.status\)/);
  assert.match(bootstrapRepositorySource, /local\.snapshotVersion \?\? assignment\.routeVersionNo/);
  assert.doesNotMatch(attachmentPolicySource, /local file|video exceeds|photo exceeds|required evidence/);
  assert.match(attachmentPolicySource, /Файл вложения отсутствует или пуст на телефоне/);
});