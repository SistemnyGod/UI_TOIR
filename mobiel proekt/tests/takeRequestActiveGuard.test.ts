import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("taking a request is blocked when another patrol is active", async () => {
  const repositorySource = await readFile(
    join(process.cwd(), "src/db/repositories/patrolRepository.ts"),
    "utf8"
  );
  const takeStart = repositorySource.indexOf("export async function takeRequestLocally");
  const takeEnd = repositorySource.indexOf("export async function acceptRequestLocally", takeStart);
  assert.ok(takeStart >= 0 && takeEnd > takeStart);

  const takeSource = repositorySource.slice(takeStart, takeEnd);
  const precheck = takeSource.indexOf("assertNoOtherActivePatrol(db, ownerUserId)");
  const transactionCheck = takeSource.indexOf("assertNoOtherActivePatrol(tx, ownerUserId, assignmentId)");
  const assignmentInsert = takeSource.indexOf("INSERT INTO patrol_assignments");

  assert.ok(precheck >= 0);
  assert.ok(transactionCheck > precheck);
  assert.ok(assignmentInsert > transactionCheck);
  assert.match(repositorySource, /status IN \('inProgress', 'paused'\)/);
});

test("paused request resumes instead of starting a new patrol", async () => {
  const screenSource = await readFile(
    join(process.cwd(), "src/features/patrol/PatrolRequestScreen.tsx"),
    "utf8"
  );
  const handleStart = screenSource.slice(
    screenSource.indexOf("async function handleStart()"),
    screenSource.indexOf("  function handleRelease()")
  );

  assert.match(handleStart, /assignment\.status === "paused"/);
  assert.match(handleStart, /resumeAssignmentLocally\(assignment\.assignmentId\)/);
  assert.match(handleStart, /startAssignmentLocally\(assignment\.assignmentId\)/);
});