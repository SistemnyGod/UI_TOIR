import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

async function readSource(relativePath: string) {
  return readFile(join(process.cwd(), relativePath), "utf8");
}

test("work item refresh uses v2 everywhere and prunes an empty server snapshot", async () => {
  const [refreshSource, authSource, repositorySource] = await Promise.all([
    readSource("src/services/mobileDataRefreshService.ts"),
    readSource("src/auth/authService.ts"),
    readSource("src/db/repositories/workTaskRepository.ts")
  ]);

  assert.match(refreshSource, /syncWorkItems\(\)/);
  assert.doesNotMatch(refreshSource, /syncWorkTasks\(\)/);
  assert.match(authSource, /syncWorkItems\(\)/);
  assert.doesNotMatch(authSource, /syncWorkTasks\(\)/);
  assert.match(
    repositorySource,
    /else \{\s*await tx\.runAsync\(\s*"DELETE FROM work_tasks WHERE owner_user_id = \? AND sync_status = 'synced'"/
  );
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
  const protectedStatuses = "'accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision'";

  assert.ok(bootstrapSource.includes(`status IN (${protectedStatuses})`));
  assert.ok(databaseSource.includes(`assignment.status IN (${protectedStatuses})`));
  assert.match(fileApiSource, /lastError instanceof MobileNetworkError[\s\S]*?lastError\.kind/);
  assert.match(syncSource, /error instanceof MobileNetworkError[\s\S]*?new MobileNetworkError\(error\.kind/);
});