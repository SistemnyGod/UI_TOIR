import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Refresh rejection, recovery order, unchanged bootstrap, EMU refresh and forced diagnostics are
// behavior-tested in syncRecoveryBehavior, networkRecoveryCycle, outboxRecoveryBehavior and
// workTaskOutboxBehavior. Only wiring and screen checks stay here.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const layoutSource = read("../app/_layout.tsx");
const requestScreenSource = read("../src/features/patrol/PatrolRequestScreen.tsx");
const dashboardSource = read("../src/features/patrol/RequestBoardScreen.tsx");
const queueScreenSource = read("../src/features/syncQueue/SyncQueueScreen.tsx");

test("returning to the app runs the mobile recovery cycle", () => {
  assert.match(layoutSource, /runMobileRecoveryCycle\("appActive", "normal"\)/);
});

test("background events reload only related screens without restoring the initial loader", () => {
  assert.match(requestScreenSource, /hasLoadedRef\.current/);
  assert.match(requestScreenSource, /zone === "requests" \|\| zone === "activePatrols"/);
  assert.match(dashboardSource, /const touchesRequests/);
  assert.match(dashboardSource, /event\.refreshedZones\?\.includes\("requests"\)/);
  assert.match(dashboardSource, /readVersion !== loadVersion\.current/);
  assert.match(dashboardSource, /retainEqualItems\(previous, rows/);
  assert.match(queueScreenSource, /useFocusedOwnerLoad\(readQueue, publishQueue/);
  assert.doesNotMatch(queueScreenSource, /setIsLoading\(true\)/);
});
