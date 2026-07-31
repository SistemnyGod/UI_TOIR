import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { assertSessionOwner } from "../src/auth/sessionIdentity.ts";
import {
  isMobileSessionKeyUnavailableError,
  isReauthenticationRequiredError,
  isSessionExpiredError
} from "../src/auth/sessionErrors.ts";
import { isOfflineSessionValid } from "../src/auth/offlineSession.ts";
import { normalizePointDraft, restoreDeferredPointSelection, skippedPointDraftReason } from "../src/domain/patrol/pointDraftPolicy.ts";
import { assertRecordsBelongToOwner } from "../src/sync/ownerIsolation.ts";

test("refresh accepts the stored account and binds a legacy session once", () => {
  assert.doesNotThrow(() => assertSessionOwner("user-a", "user-a"));
  assert.doesNotThrow(() => assertSessionOwner(null, "user-a"));
  assert.throws(() => assertSessionOwner("user-a", "user-b"), /другого пользователя/);
  assert.throws(() => assertSessionOwner("user-a", undefined), /другого пользователя/);
});

test("only explicit revocation forces re-authentication", () => {
  assert.equal(isSessionExpiredError("Session revoked by administrator"), true);
  assert.equal(isSessionExpiredError("Device revoked"), true);
  assert.equal(isSessionExpiredError("Mobile session is invalid"), true);
  assert.equal(isSessionExpiredError("Device session not found"), false);
  assert.equal(isSessionExpiredError("Device mismatch"), false);
  assert.equal(isSessionExpiredError("Refresh session expired"), false);
  assert.equal(isSessionExpiredError("Mobile API temporarily rejected the request after token refresh"), false);
  assert.equal(isReauthenticationRequiredError("session owner mismatch"), true);
  assert.equal(isSessionExpiredError("\u041a\u043b\u044e\u0447 \u043c\u043e\u0431\u0438\u043b\u044c\u043d\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d."), false);
  assert.equal(isMobileSessionKeyUnavailableError("\u041a\u043b\u044e\u0447 \u043c\u043e\u0431\u0438\u043b\u044c\u043d\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d."), true);
  assert.equal(isReauthenticationRequiredError("\u041a\u043b\u044e\u0447 \u043c\u043e\u0431\u0438\u043b\u044c\u043d\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d."), true);
  assert.equal(isReauthenticationRequiredError("Server temporarily unavailable"), false);
});

test("technical refresh failure preserves offline data and does not create a refresh loop", async () => {
  const [httpSource, tokenSource] = await Promise.all([
    readFile(join(process.cwd(), "src/api/httpClient.ts"), "utf8"),
    readFile(join(process.cwd(), "src/auth/tokenStorage.ts"), "utf8")
  ]);

  assert.match(httpSource, /preserveOfflineSessionAfterRefreshFailure\(failureCode\)/);
  assert.match(httpSource, /refreshPromise \?\?= refreshAccessTokenInternal/);
  assert.match(httpSource, /finally\(\(\) => \{[\s\S]*?refreshPromise = null/);
  assert.match(tokenSource, /revokedAt: null/);
  const preserveStart = tokenSource.indexOf("export async function preserveOfflineSessionAfterRefreshFailure");
  const preserveEnd = tokenSource.indexOf("export async function revokeStoredSession", preserveStart);
  assert.ok(preserveStart >= 0 && preserveEnd > preserveStart);
  assert.doesNotMatch(tokenSource.slice(preserveStart, preserveEnd), /clearAuthTokens|clearTokens|lockSession/);
  assert.match(tokenSource.slice(preserveStart, preserveEnd), /requiresReenrollment: true/);
  assert.match(httpSource, /markPendingOutboxCommandsAuthRequired\(ownerUserId, message\)/);
  assert.match(httpSource, /требуется повторный вход/);
});
test("sync refuses a mixed-owner batch", () => {
  assert.deepEqual(
    assertRecordsBelongToOwner("user-a", [{ ownerUserId: "user-a", id: 1 }]),
    [{ ownerUserId: "user-a", id: 1 }]
  );
  assert.throws(
    () => assertRecordsBelongToOwner("user-a", [
      { ownerUserId: "user-a" },
      { ownerUserId: "user-b" }
    ]),
    /другого пользователя/
  );
});

test("offline access remains available until explicit revocation", () => {
  const session = {
    userId: "user-a",
    fullName: "Илья",
    lastOnlineLoginAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-07-08T00:00:00.000Z"
  };

  assert.equal(isOfflineSessionValid(session), true);
  assert.equal(isOfflineSessionValid({ ...session, offlineExpiresAt: "2026-07-02T00:00:00.000Z" }), true);
  assert.equal(isOfflineSessionValid({ ...session, contourId: "patrol360-local-enterprise" }, "patrol360-local-enterprise"), true);
  assert.equal(isOfflineSessionValid({ ...session, contourId: "patrol360-test" }, "patrol360-local-enterprise"), false);
  assert.equal(isOfflineSessionValid(session, "patrol360-local-enterprise"), false);
  assert.equal(isOfflineSessionValid({ ...session, revokedAt: "2026-07-08T00:00:00.000Z" }), false);
});

test("partial work item refresh does not prune local rows", async () => {
  const source = await readFile(
    join(process.cwd(), "src/db/repositories/workTaskRepository.ts"),
    "utf8"
  );

  const saveWorkItemsStart = source.indexOf("export async function saveWorkItems");
  const saveWorkItemsEnd = source.indexOf("export async function listLocalWorkItems", saveWorkItemsStart);
  const saveWorkItemsSource = source.slice(saveWorkItemsStart, saveWorkItemsEnd);

  assert.ok(saveWorkItemsStart >= 0 && saveWorkItemsEnd > saveWorkItemsStart);
  assert.doesNotMatch(saveWorkItemsSource, /DELETE FROM work_tasks/);
  assert.match(saveWorkItemsSource, /ON CONFLICT\(task_id\) DO UPDATE SET/);
  assert.match(saveWorkItemsSource, /sync_status = CASE WHEN work_tasks\.sync_status <> 'synced'/);
});

test("unfinished point draft preserves the selected status and issue details", () => {
  const skipped = normalizePointDraft({
    selectedStatus: "skipped",
    comment: "Метка демонтирована"
  });
  assert.equal(skipped.deferredReason, skippedPointDraftReason);
  assert.equal(restoreDeferredPointSelection(skipped), "skipped");

  const issue = normalizePointDraft({
    selectedStatus: "issue",
    comment: "Повреждён корпус",
    issueTypeId: "Механическое повреждение"
  });
  assert.equal(issue.issueTypeId, "Механическое повреждение");
  assert.equal(restoreDeferredPointSelection(issue), "issue");

  const ok = normalizePointDraft({
    selectedStatus: "ok",
    issueTypeId: "Не должно сохраниться"
  });
  assert.equal(ok.issueTypeId, null);
  assert.equal(restoreDeferredPointSelection(ok), "ok");
});
