import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

async function readSource(relativePath: string) {
  const modules: Record<string, string[]> = {
    'src/db/repositories/patrolRepository.ts': ['src/db/repositories/patrolAssignmentRepository.ts', 'src/db/repositories/patrolRequestBoardRepository.ts'],
    'src/db/repositories/outboxRepository.ts': ['src/db/repositories/outboxResponseRepository.ts', 'src/db/repositories/outboxReadRepository.ts']
  };
  return (await Promise.all([relativePath, ...(modules[relativePath] ?? [])].map(path => readFile(join(process.cwd(), path), 'utf8')))).join('\n');
}

test("work item refresh uses v2 without pruning a partial server snapshot", async () => {
  const [refreshSource, authSource, repositorySource] = await Promise.all([
    readSource("src/services/mobileDataRefreshService.ts"),
    readSource("src/auth/authService.ts"),
    readSource("src/db/repositories/workTaskRepository.ts")
  ]);

  assert.match(refreshSource, /syncWorkItems\(\)/);
  assert.doesNotMatch(refreshSource, /syncWorkTasks\(\)/);
  assert.match(authSource, /syncWorkItems\(\)/);
  assert.doesNotMatch(authSource, /syncWorkTasks\(\)/);
  const saveWorkItemsStart = repositorySource.indexOf("export async function saveWorkItems");
  const saveWorkItemsEnd = repositorySource.indexOf("export async function listLocalWorkItems", saveWorkItemsStart);
  const saveWorkItemsSource = repositorySource.slice(saveWorkItemsStart, saveWorkItemsEnd);
  assert.doesNotMatch(saveWorkItemsSource, /DELETE FROM work_tasks WHERE owner_user_id = \? AND sync_status = 'synced'/);
});


test("V2 work items do not fabricate completion time from planned time", async () => {
  const apiSource = await readSource("src/api/emuApi.ts");

  assert.match(apiSource, /completedAtLocal: null/);
  assert.doesNotMatch(apiSource, /completedAtLocal: item\.status[\s\S]*item\.plannedAt/);
});
test("work task transitions reject a second active command of the same type", async () => {
  const source = await readSource("src/db/repositories/workTaskRepository.ts");

  for (const commandType of ["pauseWorkTask", "resumeWorkTask", "completeWorkTask"]) {
    assert.match(source, new RegExp(`hasActiveWorkTaskCommand\\(tx, ownerUserId, task\\.taskId, "${commandType}"\\)`));
  }
  assert.match(
    source,
    /status IN \('pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked'\)/
  );
});

test("active patrol route data and upload error kind survive refresh failures", async () => {
  const [bootstrapSource, databaseSource, fileApiSource, syncSource] = await Promise.all([
    readSource("src/db/repositories/bootstrapRepository.ts"),
    readSource("src/db/database.ts"),
    readSource("src/api/fileApi.ts"),
    readSource("src/sync/syncEngine.ts")
  ]);
  const protectedStatuses = "'accepted', 'releasePending', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision'";

  assert.ok(bootstrapSource.includes(`status IN (${protectedStatuses})`));
  assert.ok(databaseSource.includes(`assignment.status IN (${protectedStatuses})`));
  assert.match(fileApiSource, /lastError instanceof MobileNetworkError[\s\S]*?lastError\.kind/);
  assert.match(syncSource, /error instanceof MobileNetworkError[\s\S]*?new MobileNetworkError\(error\.kind/);
});

test("offline report becomes immediately retryable when network returns", async () => {
  const [triggerSource, engineSource, repositorySource] = await Promise.all([
    readSource("src/sync/syncTriggers.ts"),
    readSource("src/sync/syncEngine.ts"),
    readSource("src/db/repositories/outboxRepository.ts")
  ]);

  assert.match(triggerSource, /networkBecameUsable[\s\S]*runMobileRecoveryCycle\("network", "networkRecovered"\)/);
  assert.match(triggerSource, /activeSyncRequests\.get\(requestKey\)/);
  assert.match(engineSource, /options\.mode === "networkRecovered"[\s\S]*activateNetworkRecoveredOutboxCommands\(ownerUserId\)/);
  assert.match(
    repositorySource,
    /next_attempt_at = NULL[\s\S]*status = 'waiting_network'[\s\S]*retry_reason IN \('network', 'timeout'\)/
  );
});

test("EMU mutations re-read current SQLite state before enqueue", async () => {
  const repositorySource = await readSource("src/db/repositories/workTaskRepository.ts");

  assert.match(repositorySource, /const currentTask = await getCurrentWorkTaskInTransaction\(tx, ownerUserId, input.task.taskId\)/);
  assert.match(repositorySource, /const currentTask = await getCurrentWorkTaskInTransaction\(tx, ownerUserId, task.taskId\)/);
  assert.match(repositorySource, /const currentItem = await tx.getFirstAsync/);
  assert.ok((repositorySource.match(/if \(result.changes !== 1\)/g) ?? []).length >= 4);
});

test("EMU refresh preserves local conflict, rejection, and waiting state", async () => {
  const repositorySource = await readSource("src/db/repositories/workTaskRepository.ts");
  const saveWorkTasksSource = repositorySource.match(/export async function saveWorkTasks[\s\S]*?export async function listLocalWorkTasks/)?.[0] ?? "";

  assert.match(
    saveWorkTasksSource,
    /status = CASE WHEN work_tasks\.sync_status <> 'synced' OR excluded\.revision < work_tasks\.revision THEN work_tasks\.status ELSE excluded\.status END/
  );
  assert.match(
    saveWorkTasksSource,
    /sync_status = CASE WHEN work_tasks\.sync_status <> 'synced' OR excluded\.revision < work_tasks\.revision THEN work_tasks\.sync_status ELSE excluded\.sync_status END/
  );
  assert.match(
    saveWorkTasksSource,
    /completed_at_local = CASE WHEN work_tasks\.sync_status <> 'synced' OR excluded\.revision < work_tasks\.revision THEN work_tasks\.completed_at_local ELSE excluded\.completed_at_local END/
  );
  assert.match(
    saveWorkTasksSource,
    /outbox_commands\.status IN \(\'pending\', \'sending\', \'retryLater\', \'waiting_auth\', \'waiting_network\', \'wrong_contour\', \'blocked\', \'rejected\', \'conflict\', \'invalidPayload\'\)/
  );
});

test("point completion follows the assignment scan policy", async () => {
  const pointFillSource = await readSource("src/features/patrol/PointFillScreen.tsx");
  const flow = pointFillSource.match(/async function continuePatrolFlow[\s\S]*?async function reloadPointAndAttachments/)?.[0] ?? "";

  assert.match(flow, /getAssignmentScanPolicy\(assignmentId\)/);
  assert.match(flow, /scanPolicy\.nfcEnabled[\s\S]*scan-nfc/);
  assert.match(flow, /scanPolicy\.qrFallbackEnabled[\s\S]*scan-qr/);
  assert.match(flow, /all-points/);
});

test("NFC and QR enforce route point order when free order is disabled", async () => {
  const repositorySource = await readSource("src/db/repositories/patrolRepository.ts");
  const databaseSource = await readSource("src/db/database.ts");
  const detailSource = await readSource("src/features/patrol/PointDetailScreen.tsx");
  const fillSource = await readSource("src/features/patrol/PointFillScreen.tsx");

  assert.match(repositorySource, /allowFreeOrder: row\?\.allowFreeOrder !== 0/);
  assert.match(repositorySource, /async function assertPointOrderAllowed/);
  assert.match(repositorySource, /scanPointByNfc[\s\S]*?assertPointOrderAllowed\(db, ownerUserId, assignmentId, point\.pointId, point\.orderIndex, scanPolicy\.allowFreeOrder\)/);
  assert.match(repositorySource, /scanPointByQr[\s\S]*?assertPointOrderAllowed\(db, ownerUserId, assignmentId, point\.pointId, point\.orderIndex, scanPolicy\.allowFreeOrder\)/);
  assert.match(repositorySource, /point\.order_index < \?/);
  assert.match(repositorySource, /COALESCE\(result\.status, 'pending'\) NOT IN \('ok', 'issue', 'skipped'\)/);
  assert.match(databaseSource, /allow_free_order INTEGER NOT NULL DEFAULT 1/);
  assert.match(repositorySource, /export async function assertPointCanBeOpened/);
  assert.match(detailSource, /assertPointCanBeOpened\(assignmentId, pointId\)/);
  assert.match(fillSource, /assertPointCanBeOpened\(assignmentId, pointId\)/);
});

test("patrol request conflicts use one assignment identity during resolution", async () => {
  const [policySource, repositorySource, serviceSource, bootstrapSource] = await Promise.all([
    readSource("src/db/repositories/outboxPolicies.ts"),
    readSource("src/db/repositories/outboxRepository.ts"),
    readSource("src/services/conflictResolutionService.ts"),
    readSource("src/db/repositories/bootstrapRepository.ts")
  ]);

  assert.match(policySource, /resolvePatrolAssignmentIdentity/);
  assert.match(policySource, /acceptPatrolRequest[\s\S]*takePatrolRequest/);
  assert.match(repositorySource, /const patrolAssignmentIdentity = resolvePatrolAssignmentIdentity/);
  assert.match(repositorySource, /assignmentUpdate\.changes !== 1/);
  assert.match(repositorySource, /const restoredStatus = command\.command_type === "releasePatrolRequest" \|\| command\.command_type === "acceptPatrolRequest"/);
  assert.match(serviceSource, /isPatrolAssignmentCommand\(assignmentCommandInput\)/);
  assert.match(bootstrapSource, /const assignmentId = resolvePatrolAssignmentIdentity\(assignmentInput\)/);
});


test("server wins is limited to assignment conflicts", async () => {
  const [serviceSource, screenSource, repositorySource] = await Promise.all([
    readSource("src/services/conflictResolutionService.ts"),
    readSource("src/features/syncQueue/SyncQueueScreen.tsx"),
    readSource("src/db/repositories/outboxRepository.ts")
  ]);

  assert.match(serviceSource, /function canAcceptServerConflict/);
  assert.ok(serviceSource.includes("if (!canAcceptServerConflict(command))"));
  assert.ok(screenSource.includes("canAcceptServerConflict(command) ?"));
  assert.ok(repositorySource.includes("if (!patrolAssignmentCommand)"));
});

test("bootstrap keeps non-assignment conflicts open without server entity state", async () => {
  const source = await readSource("src/db/repositories/bootstrapRepository.ts");
  const entityGuard = source.indexOf("if (!assignmentCommand)");
  const assignmentUpdate = source.indexOf("const assignmentUpdate = await tx.runAsync", entityGuard);
  const closeOutbox = source.indexOf("UPDATE outbox_commands", assignmentUpdate);

  assert.ok(entityGuard >= 0);
  assert.match(
    source,
    /case "patrolPoint":[\s\S]*case "workTask":[\s\S]*case "shiftRemark":[\s\S]*continue;/
  );
  assert.ok(assignmentUpdate > entityGuard);
  assert.match(source, /assignmentUpdate\.changes !== 1/);
  assert.ok(closeOutbox > assignmentUpdate);
  const assignmentReconcile = source.indexOf("await reconcileAssignmentIdentityInTransaction");
  const bootstrapResolution = source.indexOf("await applyBootstrapConflictResolutionsInTransaction");
  assert.ok(bootstrapResolution > assignmentReconcile);
});


test("frozen snapshot readiness ignores current route version", async () => {
  const source = await readSource("src/db/repositories/patrolRepository.ts");
  const databaseSource = await readSource("src/db/database.ts");
  const parsed = ts.createSourceFile('repository.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getReportReadiness');
  assert.ok(declaration, 'getReportReadiness must exist');
  const readiness = declaration.getText(parsed);
  const startedBlockStart = readiness.indexOf("if (assignment && frozenSnapshotAssignmentStatuses.has(assignment.status))");
  const startedBlockEnd = readiness.indexOf("if (assignment && points.length === 0)", startedBlockStart);

  assert.match(source, /const frozenSnapshotAssignmentStatuses = new Set\(\[/);
  assert.match(readiness, /frozenSnapshotAssignmentStatuses\.has\(assignment\.status\)/);
  assert.match(readiness, /assignment\.snapshotVersion !== assignment\.routeVersionNo/);
  assert.match(readiness, /hasConsistentAssignmentSnapshot\(db, assignment, points, ownerUserId\)/);
  assert.match(source, /snapshot_allow_free_order AS snapshotAllowFreeOrder/);
  assert.match(source, /frozenSnapshotAssignmentStatuses\.has\(row\.status\)/);
  assert.match(databaseSource, /snapshot_allow_free_order INTEGER/);
  assert.match(databaseSource, /20260726_assignment_snapshot_policy/);
  // Immutable bootstrap persistence, empty-snapshot repair and late replies are
  // covered with a real SQLite database in assignmentSnapshotDatabase.vitest.test.ts.
  assert.ok(startedBlockStart >= 0 && startedBlockEnd > startedBlockStart);
  assert.doesNotMatch(readiness.slice(startedBlockStart, startedBlockEnd), /route\.version/);
});

test("completed report attachment repair validates physical file and requeues rejected command", async () => {
  const source = await readSource("src/db/repositories/patrolRepository.ts");
  const repairStart = source.indexOf("export async function listMissingCompleteAssignmentAttachmentIds");
  const repairSource = source.slice(repairStart);

  assert.match(repairSource, /status IN \('pending', 'retryLater', 'waiting_network', 'waiting_auth', 'rejected'\)/);
  assert.match(repairSource, /getLocalFileInfo/);
  assert.match(repairSource, /currentAssignment\.status !== "completedLocal"/);
  assert.match(repairSource, /contour_id = \?/);
  assert.match(repairSource, /persistedIds\.includes\(missingClientFileId\)/);
  assert.match(repairSource, /getCompletionAttachmentFailure/);
  assert.match(repairSource, /status = 'pending'/);
  assert.match(repairSource, /pointUpdate.changes !== 1/);
  assert.match(repairSource, /commandUpdate.changes !== 1/);
});
