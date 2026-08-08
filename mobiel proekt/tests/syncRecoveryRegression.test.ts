import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const triggerSource = read("../src/sync/syncTriggers.ts");
const engineSource = read("../src/sync/syncEngine.ts");
const repositorySource = read("../src/db/repositories/outboxRepository.ts");
const backgroundSource = read("../src/sync/backgroundSyncTask.ts");
const syncTypesSource = read("../src/domain/sync/syncTypes.ts");
const bootstrapSource = read("../src/core/bootstrap.ts");

test("network events coalesce sync and only recover on a real transition", () => {
  assert.match(triggerSource, /const activeSyncRequests = new Map/);
  assert.match(triggerSource, /const activeRequest = activeSyncRequests\.get\(requestKey\)/);
  assert.match(triggerSource, /if \(networkBecameUsable\) \{/);
  assert.doesNotMatch(triggerSource, /if \(networkUsable\) \{[\s\S]*?triggerForegroundSyncWithRetry/);
});

test("background and corrected contour reactivate dormant report commands", () => {
  assert.match(backgroundSource, /runForegroundSync\(\{ mode: "networkRecovered" \}\)/);
  assert.match(engineSource, /activateWrongContourOutboxCommands\(ownerUserId, aggregateKey\)/);
  assert.match(engineSource, /checkServerConnection\(undefined, \{ useCache: true \}\)/);
  assert.match(engineSource, /activateWaitingAuthOutboxCommands\(ownerUserId, aggregateKey\)/);
  assert.match(repositorySource, /status = 'wrong_contour'/);
  assert.match(repositorySource, /aggregate_key IS NULL AND entity_local_id = \?/);
});

test("recovers interrupted sending commands on bootstrap and releases cancelled FIFO heads", () => {
  assert.equal(syncTypesSource.includes("cancelledLocal"), true);
  assert.equal(repositorySource.includes("resetSendingOutboxCommandsForProcessRestart"), true);
  assert.equal(repositorySource.includes("status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal')"), true);
  assert.equal(bootstrapSource.includes("recoverSendingOutboxCommandsAfterProcessRestart"), true);
  assert.equal(repositorySource.includes("status = 'sending'"), true);
});
test("keeps request board aligned when retrying a patrol conflict", () => {
  const retryStart = repositorySource.indexOf("export async function retryOutboxConflictWithRevision");
  const retryEnd = repositorySource.indexOf("export async function cancelRejectedOutboxCommand");
  const retrySource = repositorySource.slice(retryStart, retryEnd);
  assert.equal(retrySource.includes("UPDATE patrol_assignments"), true);
  assert.equal(retrySource.includes("UPDATE patrol_request_board"), true);
  assert.ok(retrySource.indexOf("UPDATE patrol_request_board") > retrySource.indexOf("UPDATE patrol_assignments"));
});
