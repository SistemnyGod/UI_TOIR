import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const patrolRepositorySource = readFileSync(
  new URL("../src/db/repositories/patrolRepository.ts", import.meta.url),
  "utf8"
);
const repositorySource = readFileSync(
  new URL("../src/db/repositories/outboxRepository.ts", import.meta.url),
  "utf8"
);
const databaseSource = readFileSync(
  new URL("../src/db/database.ts", import.meta.url),
  "utf8"
);const syncEngineSource = readFileSync(
  new URL("../src/sync/syncEngine.ts", import.meta.url),
  "utf8"
);
const queueScreenSource = readFileSync(
  new URL("../src/features/syncQueue/SyncQueueScreen.tsx", import.meta.url),
  "utf8"
);
const nfcScreenSource = readFileSync(
  new URL("../src/features/patrol/ScanNfcScreen.tsx", import.meta.url),
  "utf8"
);
const serverOutboxSource = readFileSync(
  new URL("../../libs/infrastructure/Persistence/MobileApp/EfMobileAppService.Outbox.Patrol.cs", import.meta.url),
  "utf8"
);
const serverLifecycleSource = readFileSync(
  new URL("../../libs/infrastructure/Persistence/MobileApp/EfMobileAppService.Outbox.Patrol.RequestLifecycle.cs", import.meta.url),
  "utf8"
);

test("recovers a legacy rejected start before sending its queued completed report", () => {
  assert.match(repositorySource, /command_type = 'startPatrolAssignment'/);
  assert.match(repositorySource, /status = 'rejected'/);
  assert.match(repositorySource, /command_type = 'completePatrolAssignment'/);
  assert.match(repositorySource, /reactivateRecoverableRejectedStartCommands/);
  const startFunction = patrolRepositorySource.slice(patrolRepositorySource.indexOf("export async function startAssignmentLocally"));
  assert.doesNotMatch(startFunction, /commandType: "acceptPatrolRequest"/);
  assert.match(patrolRepositorySource.slice(0, patrolRepositorySource.indexOf("export async function startAssignmentLocally")), /commandType: "acceptPatrolRequest"/);
  assert.match(syncEngineSource, /await reactivateRecoverableRejectedStartCommands\(ownerUserId, options\.assignmentId\)/);
  assert.doesNotMatch(repositorySource, /sequence_no = sequence_no \+ 1/);
  assert.match(databaseSource, /repairMisorderedPatrolOutbox/);
  assert.match(databaseSource, /20260728_repair_misordered_patrol_outbox/);
  assert.match(repositorySource, /reactivateRecoverableRejectedPointCommands/);
  assert.match(repositorySource, /recoverableLifecycleRejection/);
  assert.match(repositorySource, /CASE WHEN status = 'completedLocal' THEN status ELSE 'inProgress' END/);
  assert.match(queueScreenSource, /completePatrolAssignment.*Отчёт.*Маршрут/);
  assert.doesNotMatch(queueScreenSource, /Boolean\(command\.lastError\)/);
  assert.match(nfcScreenSource, /case "blocked":/);
  assert.match(serverOutboxSource, /TryRecoverRejectedLegacyStart/);
  assert.match(serverOutboxSource, /existing\.EntityLocalId, command\.EntityLocalId/);
  assert.match(serverLifecycleSource, /allowMissingAcceptRecovery/);
  assert.match(serverLifecycleSource, /assignment\.Status = AssignmentStatusValues\.Accepted/);
});