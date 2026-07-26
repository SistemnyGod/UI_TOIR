import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("repository enforces assignment scan policy before local point/outbox writes", async () => {
  const repositorySource = await readFile(
    join(process.cwd(), "src/db/repositories/patrolRepository.ts"),
    "utf8"
  );

  assert.match(repositorySource, /async function assertScanMethodAllowed\(assignmentId: string, method: "nfc" \| "qr"\)/);
  assert.match(repositorySource, /getAssignmentScanPolicy\(assignmentId\)/);
  assert.match(repositorySource, /method === "nfc" && !policy\.nfcEnabled/);
  assert.match(repositorySource, /method === "qr" && !policy\.qrFallbackEnabled/);
  assert.match(repositorySource, /throw new Error\(nfcDisabledMessage\)/);
  assert.match(repositorySource, /throw new Error\(qrDisabledMessage\)/);

  for (const [functionName, method] of [
    ["scanPointByNfc", "nfc"],
    ["scanPointByQr", "qr"]
  ]) {
    const start = repositorySource.indexOf("export async function " + functionName);
    const end = repositorySource.indexOf("export async function ", start + 1);
    assert.ok(start >= 0 && end > start, functionName + " was not found");
    const handler = repositorySource.slice(start, end);
    const guard = handler.indexOf("assertScanMethodAllowed(assignmentId, \"" + method + "\")");
    const firstLocalWrite = handler.indexOf("upsertPointResultInTransaction");
    const outboxWrite = handler.indexOf("insertOutboxCommandInTransaction");
    assert.ok(guard >= 0 && guard < firstLocalWrite, functionName + " must guard before point result write");
    assert.ok(guard < outboxWrite, functionName + " must guard before outbox write");
    assert.match(handler, /assignment\.owner_user_id = \?/);
    assert.match(handler, /assignment\.contour_id = \?/);
    assert.match(handler, /point\.route_id = assignment\.route_id/);
  }

  const policyStart = repositorySource.indexOf("export async function getAssignmentScanPolicy");
  const policyEnd = repositorySource.indexOf("export async function getAssignmentById", policyStart);
  assert.ok(policyStart >= 0 && policyEnd > policyStart);
  const policy = repositorySource.slice(policyStart, policyEnd);
  assert.match(policy, /assignment\.owner_user_id = \?/);
  assert.match(policy, /assignment\.contour_id = \?/);
});
