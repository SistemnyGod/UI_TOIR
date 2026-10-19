import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositorySource = readFileSync(
  new URL("../src/db/repositories/outboxRepository.ts", import.meta.url),
  "utf8"
);
const databaseSource = readFileSync(
  new URL("../src/db/database.ts", import.meta.url),
  "utf8"
);
const syncEngineSource = readFileSync(
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

// Requeueing recoverable rejections, reactivating legacy rejected starts and refusing an
// unaccepted start are behavior-tested in patrolLifecycleRecovery.vitest.test.ts. What is
// left here is wiring, an architectural ban, UI wording and the server-side contract.
test("legacy start recovery stays wired and the server keeps rejecting legacy take requests", () => {
  assert.match(syncEngineSource, /await reactivateRecoverableRejectedStartCommands\(ownerUserId, options\.assignmentId\)/);
  assert.doesNotMatch(repositorySource, /sequence_no = sequence_no \+ 1/);
  assert.match(databaseSource, /repairMisorderedPatrolOutbox/);
  assert.match(databaseSource, /20260728_repair_misordered_patrol_outbox/);
  assert.match(repositorySource, /reactivateRecoverableRejectedPointCommands/);
  assert.match(queueScreenSource, /completePatrolAssignment.*Отчёт.*Маршрут/);
  assert.doesNotMatch(queueScreenSource, /Boolean\(command\.lastError\)/);
  assert.match(nfcScreenSource, /'blocked'/);
  assert.match(serverOutboxSource, /RejectLegacyTakePatrolRequest/);
  assert.doesNotMatch(serverOutboxSource, /ProcessTakePatrolRequest\(account, command\)/);
  assert.doesNotMatch(serverOutboxSource, /TryRecoverRejectedLegacyStart/);
  assert.doesNotMatch(serverLifecycleSource, /allowMissingAcceptRecovery/);
  const startIndex = serverLifecycleSource.indexOf("ProcessStartPatrolAssignment");
  const serverStartFunction = serverLifecycleSource.slice(startIndex, serverLifecycleSource.indexOf("ProcessPausePatrolAssignment", startIndex));
  assert.doesNotMatch(serverStartFunction, /AssignmentStatusValues\.Accepted/);
});