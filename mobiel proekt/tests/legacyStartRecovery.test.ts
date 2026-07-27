import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositorySource = readFileSync(
  new URL("../src/db/repositories/outboxRepository.ts", import.meta.url),
  "utf8"
);
const syncEngineSource = readFileSync(
  new URL("../src/sync/syncEngine.ts", import.meta.url),
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
  assert.match(syncEngineSource, /await reactivateRecoverableRejectedStartCommands\(ownerUserId\)/);
  assert.match(serverOutboxSource, /TryRecoverRejectedLegacyStart/);
  assert.match(serverOutboxSource, /existing\.EntityLocalId, command\.EntityLocalId/);
  assert.match(serverLifecycleSource, /allowMissingAcceptRecovery/);
  assert.match(serverLifecycleSource, /assignment\.Status = AssignmentStatusValues\.Accepted/);
});