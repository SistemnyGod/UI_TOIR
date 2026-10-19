import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

// "Take request" was retired in favour of accept + start; the single-active-patrol rule now lives in the
// lifecycle update (start/resume) and in patrolEntryService, which switches patrols instead of starting a second one.
test("starting or resuming is blocked while the employee has another active patrol", async () => {
  const repositorySource = await readFile(
    join(process.cwd(), "src/db/repositories/patrolRepository.ts"),
    "utf8"
  );
  const lifecycleStart = repositorySource.indexOf("async function updateAssignmentLifecycleLocally");
  const lifecycleEnd = repositorySource.indexOf("\nexport async function ", lifecycleStart);
  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart);

  const lifecycle = repositorySource.slice(lifecycleStart, lifecycleEnd);
  const activeConflict = "У сотрудника уже есть выполняемый обход. Используйте смену маршрута.";
  const precheck = lifecycle.indexOf(activeConflict);
  const transaction = lifecycle.indexOf("withProtectedExclusiveTransactionAsync(db, async (tx)");
  const transactionCheck = lifecycle.indexOf(activeConflict, transaction);
  const assignmentUpdate = lifecycle.indexOf("UPDATE patrol_assignments", transaction);

  assert.ok(precheck >= 0 && precheck < transaction, "active patrol must be rejected before opening the transaction");
  assert.ok(transactionCheck > transaction, "active patrol must be re-checked inside the transaction");
  assert.ok(assignmentUpdate > transactionCheck, "re-check must precede the status update");
  assert.match(lifecycle, /commandType === "startPatrolAssignment" \|\| commandType === "resumePatrolAssignment"/);
  assert.match(lifecycle, /AND status = 'inProgress'/);
});

test("entering a request resumes a paused patrol or switches instead of starting a second one", async () => {
  const serviceSource = await readFile(
    join(process.cwd(), "src/services/patrolEntryService.ts"),
    "utf8"
  );
  const screenSource = await readFile(
    join(process.cwd(), "src/features/patrol/PatrolRequestScreen.tsx"),
    "utf8"
  );
  const handleStart = screenSource.slice(
    screenSource.indexOf("async function handleStart()"),
    screenSource.indexOf("  function handleRelease()")
  );

  assert.match(handleStart, /enterPatrolRequest\(requestId, employeeId,/);
  assert.match(serviceSource, /if \(competing && [^)]*\)\)? await switchPatrolLocally\(competing\.assignmentId, assignment\.assignmentId/);
  assert.match(serviceSource, /else if \(assignment\.status === 'paused'\) await resumeAssignmentLocally\(assignment\.assignmentId\)/);
  assert.match(serviceSource, /else await startAssignmentLocally\(assignment\.assignmentId\)/);
});
