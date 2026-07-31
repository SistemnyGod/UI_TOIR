import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tokenSource = read("../src/auth/tokenStorage.ts");
const httpSource = read("../src/api/httpClient.ts");
const refreshSource = read("../src/services/mobileDataRefreshService.ts");
const triggerSource = read("../src/sync/syncTriggers.ts");
const layoutSource = read("../app/_layout.tsx");
const workTaskSource = read("../src/db/repositories/workTaskRepository.ts");
const diagnosticSource = read("../src/db/repositories/diagnosticReportRepository.ts");
const requestScreenSource = read("../src/features/patrol/PatrolRequestScreen.tsx");
const dashboardSource = read("../src/features/patrolHome/usePatrolHomeDashboard.ts");
const queueScreenSource = read("../src/features/syncQueue/SyncQueueScreen.tsx");

test("refresh rejection preserves offline access and pauses delivery for online sign-in", () => {
  assert.match(tokenSource, /requiresReenrollment: true/);
  assert.match(httpSource, /markPendingOutboxCommandsAuthRequired\(ownerUserId, message\)/);
  assert.match(httpSource, /продолжайте работать офлайн/);
});

test("network recovery refreshes auth, delivers outbox, then downloads a fresh snapshot", () => {
  const start = triggerSource.indexOf("export async function runMobileRecoveryCycle");
  const end = triggerSource.indexOf("export type TriggerForegroundSyncResult", start);
  const recovery = triggerSource.slice(start, end);
  const refreshToken = recovery.indexOf("refreshStoredAccessTokenIfNeeded()");
  const outbox = recovery.indexOf("triggerForegroundSyncWithRetry({ mode })");
  const snapshot = recovery.indexOf("refreshMobileData()");
  assert.ok(refreshToken >= 0 && refreshToken < outbox && outbox < snapshot);
  assert.match(layoutSource, /runMobileRecoveryCycle\("appActive", "normal"\)/);
  assert.match(triggerSource, /if \(networkRecoveryPromise\)/);
});

test("unchanged bootstrap does not notify every screen", () => {
  assert.match(refreshSource, /if \(snapshotUpdated\) \{[\s\S]*?emitSyncEvent/);
  assert.doesNotMatch(refreshSource, /const snapshotUpdated = await saveBootstrap\(bootstrap\);\s*emitSyncEvent/);
});

test("pending EMU mutations keep locally visible values during stale server refresh", () => {
  assert.match(workTaskSource, /title = CASE WHEN work_tasks\.sync_status <> 'synced' THEN work_tasks\.title ELSE excluded\.title END/);
  assert.match(workTaskSource, /section_id = CASE WHEN work_tasks\.sync_status <> 'synced' THEN work_tasks\.section_id ELSE excluded\.section_id END/);
  assert.match(workTaskSource, /capabilities_json = CASE WHEN work_tasks\.sync_status <> 'synced'/);
  assert.match(workTaskSource, /'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked'/);
});

test("forced diagnostics refresh an existing pending payload", () => {
  assert.match(diagnosticSource, /if \(pending && !options\.force\)/);
  assert.match(diagnosticSource, /const refreshedReport: MobileDiagnosticReport/);
  assert.match(diagnosticSource, /SET period_end = \?, payload_json = \?, last_error = NULL/);
});
test("background events reload only related screens without restoring the initial loader", () => {
  assert.match(requestScreenSource, /hasLoadedRef\.current/);
  assert.match(requestScreenSource, /zone === "requests" \|\| zone === "activePatrols"/);
  assert.match(dashboardSource, /const touchesDashboard/);
  assert.match(dashboardSource, /zone === "requests" \|\| zone === "activePatrols" \|\| zone === "points"/);
  assert.match(queueScreenSource, /if \(!hasLoadedRef\.current\)/);
});