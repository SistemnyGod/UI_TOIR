import assert from "node:assert/strict";
import test from "node:test";

import { canSubmitPointResult } from "../src/domain/patrol/patrolRules.ts";
import type { PatrolPointResultDto } from "../src/domain/patrol/patrolTypes.ts";

function result(status: PatrolPointResultDto["status"], photoClientFileIds: string[] = [], commentOverride?: string | null): PatrolPointResultDto {
  return {
    localResultId: "result-1",
    assignmentId: "assignment-1",
    pointId: "point-1",
    status,
    comment: commentOverride ?? (status === "issue" ? "Leak detected" : null),
    issueTypeId: status === "issue" ? "leak" : null,
    severity: status === "issue" ? "medium" : null,
    deferredReason: null,
    completedAtLocal: new Date(0).toISOString(),
    syncStatus: "pending",
    photoClientFileIds
  };
}

function incompleteResult(status: PatrolPointResultDto["status"]): PatrolPointResultDto {
  return {
    ...result(status),
    comment: null,
    issueTypeId: null
  };
}

test("requiresPhoto does not block an OK point without a photo", () => {
  assert.equal(canSubmitPointResult(result("ok"), true), true);
});

test("requiresPhoto blocks issue and skipped states until evidence is attached", () => {
  assert.equal(canSubmitPointResult(result("issue"), true), false);
  assert.equal(canSubmitPointResult(result("skipped"), true), false);
  assert.equal(canSubmitPointResult(result("issue", ["photo-1"]), true), true);
  assert.equal(canSubmitPointResult(result("skipped", ["photo-1"], "Tag unavailable"), true), true);
});

test("does not submit a point until a scanned state is completed with required issue data", () => {
  assert.equal(canSubmitPointResult(incompleteResult("scanned"), false), false);
  assert.equal(canSubmitPointResult(incompleteResult("issue"), false), false);
  assert.equal(canSubmitPointResult(incompleteResult("skipped"), false), false);
  assert.equal(canSubmitPointResult(result("issue"), false), true);
});
