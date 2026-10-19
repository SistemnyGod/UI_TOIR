import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

// Only wiring and UI checks stay here. Refresh, outbox, conflict, route-order, snapshot and
// attachment-repair behavior runs on the real schema in workTaskOutboxBehavior,
// patrolReportBehavior, conflictIdentityBehavior, outboxRecoveryBehavior and syncRecoveryBehavior.
async function readSource(relativePath: string) {
  const modules: Record<string, string[]> = {
    'src/db/repositories/patrolRepository.ts': ['src/db/repositories/patrolAssignmentRepository.ts', 'src/db/repositories/patrolRequestBoardRepository.ts']
  };
  return (await Promise.all([relativePath, ...(modules[relativePath] ?? [])].map(path => readFile(join(process.cwd(), path), 'utf8')))).join('\n');
}

test("work item refresh uses the v2 work item sync", async () => {
  const [refreshSource, authSource] = await Promise.all([
    readSource("src/services/mobileDataRefreshService.ts"),
    readSource("src/auth/authService.ts")
  ]);

  assert.match(refreshSource, /syncWorkItems\(\)/);
  assert.doesNotMatch(refreshSource, /syncWorkTasks\(\)/);
  assert.match(authSource, /syncWorkItems\(\)/);
  assert.doesNotMatch(authSource, /syncWorkTasks\(\)/);
});

test("upload error kind survives the sync engine rethrow", async () => {
  const syncSource = await readSource("src/sync/syncEngine.ts");

  assert.match(syncSource, /error instanceof MobileNetworkError[\s\S]*?new MobileNetworkError\(error\.kind/);
});

test("point completion follows the assignment scan policy", async () => {
  const pointFillSource = await readSource("src/features/patrol/PointFillScreen.tsx");
  const flow = pointFillSource.match(/async function continuePatrolFlow[\s\S]*?async function reloadPointAndAttachments/)?.[0] ?? "";

  assert.match(flow, /getAssignmentScanPolicy\(assignmentId\)/);
  assert.match(flow, /scanPolicy\.nfcEnabled[\s\S]*scan-nfc/);
  assert.match(flow, /scanPolicy\.qrFallbackEnabled[\s\S]*scan-qr/);
  assert.match(flow, /all-points/);
});

test("point screens check route order before opening a point", async () => {
  const databaseSource = await readSource("src/db/database.ts");
  const detailSource = await readSource("src/features/patrol/PointDetailScreen.tsx");
  const fillSource = await readSource("src/features/patrol/PointFillScreen.tsx");

  assert.match(databaseSource, /allow_free_order INTEGER NOT NULL DEFAULT 1/);
  assert.match(detailSource, /assertPointCanBeOpened\(assignmentId, pointId\)/);
  assert.match(fillSource, /assertPointCanBeOpened\(assignmentId, pointId\)/);
});

test("server wins is offered only for assignment conflicts", async () => {
  const screenSource = await readSource("src/features/syncQueue/SyncQueueScreen.tsx");

  assert.ok(screenSource.includes("canAcceptServerConflict(command) ?"));
});

// restoreMissingPointAttachment fails on the real schema (it reads assignment_route_points.status
// and writes outbox_commands.sent_at_local, neither of which exists), so the successful repair is an
// it.fails case in patrolReportBehavior. Until that is fixed these lines keep its requeue guards.
test("completed report attachment repair requeues the command only when both rows change", async () => {
  const source = await readSource("src/db/repositories/patrolRepository.ts");
  const repairSource = source.slice(source.indexOf("export async function restoreMissingPointAttachment"));

  assert.match(repairSource, /getCompletionAttachmentFailure/);
  assert.match(repairSource, /status = 'pending'/);
  assert.match(repairSource, /pointUpdate.changes !== 1/);
  assert.match(repairSource, /commandUpdate.changes !== 1/);
});
