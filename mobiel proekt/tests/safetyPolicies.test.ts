import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { assertSessionOwner } from "../src/auth/sessionIdentity.ts";
import { isReauthenticationRequiredError, isSessionExpiredError } from "../src/auth/sessionErrors.ts";
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
  assert.equal(isSessionExpiredError("Mobile API temporarily rejected the request after token refresh"), false);
  assert.equal(isReauthenticationRequiredError("session owner mismatch"), true);
  assert.equal(isReauthenticationRequiredError("Server temporarily unavailable"), false);
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
  assert.equal(isOfflineSessionValid({ ...session, contourId: "patrol360-local-enterprise" }, "patrol360-local-enterprise"), true);
  assert.equal(isOfflineSessionValid({ ...session, contourId: "patrol360-test" }, "patrol360-local-enterprise"), false);
  assert.equal(isOfflineSessionValid(session, "patrol360-local-enterprise"), false);
  assert.equal(isOfflineSessionValid({ ...session, revokedAt: "2026-07-08T00:00:00.000Z" }), false);
});

test("work item pruning binds only the owner and returned item identifiers", async () => {
  const source = await readFile(
    join(process.cwd(), "src/db/repositories/workTaskRepository.ts"),
    "utf8"
  );
  const pruneCall = source.match(
    /DELETE FROM work_tasks WHERE owner_user_id = \?[\s\S]*?\[ownerUserId,[^\]]+\]/
  );

  assert.ok(pruneCall, "Work item pruning query was not found.");
  assert.match(pruneCall[0], /\[ownerUserId, \.\.\.itemIds\]/);
  assert.doesNotMatch(pruneCall[0], /\[ownerUserId, currentContourId,/);
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
