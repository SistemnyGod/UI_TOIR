import assert from "node:assert/strict";
import test from "node:test";

import { shouldReloadAssignmentAfterSync, shouldReloadReportAfterSync } from "../src/sync/syncEvents.ts";

test("assignment screens reload only for their assignment or a refreshed snapshot", () => {
  const assignmentId = "assignment-current";

  assert.equal(shouldReloadAssignmentAfterSync({
    acceptedOperationIds: ["point-operation"],
    completedAssignmentIds: []
  }, assignmentId), false);

  assert.equal(shouldReloadAssignmentAfterSync({
    acceptedOperationIds: ["complete-operation"],
    completedAssignmentIds: [assignmentId]
  }, assignmentId), true);

  assert.equal(shouldReloadAssignmentAfterSync({
    acceptedOperationIds: [],
    cancelledAssignmentIds: [assignmentId],
    completedAssignmentIds: []
  }, assignmentId), true);

  assert.equal(shouldReloadAssignmentAfterSync({
    acceptedOperationIds: [],
    completedAssignmentIds: [],
    snapshotRefreshed: true
  }, assignmentId), true);
});

test("assignment screens reload after retry, rejection, or conflict", () => {
  assert.equal(shouldReloadAssignmentAfterSync({
    acceptedOperationIds: [],
    completedAssignmentIds: [],
    changedAssignmentIds: ["assignment-current"]
  }, "assignment-current"), true);
});

test("report screen ignores point updates and reloads only delivery changes", () => {
  assert.equal(shouldReloadReportAfterSync({
    acceptedOperationIds: ["point-operation"],
    completedAssignmentIds: [],
    changedAssignmentIds: ["assignment-current"]
  }, "assignment-current"), false);

  assert.equal(shouldReloadReportAfterSync({
    acceptedOperationIds: [],
    completedAssignmentIds: [],
    deliveryChangedAssignmentIds: ["assignment-current"]
  }, "assignment-current"), true);
});
