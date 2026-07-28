import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("NFC scan matches both NDEF content and the physical tag UID", async () => {
  const serviceSource = await readFile(
    join(process.cwd(), "src/services/nfcService.ts"),
    "utf8"
  );
  const repositorySource = await readFile(
    join(process.cwd(), "src/db/repositories/patrolRepository.ts"),
    "utf8"
  );
  const screenSource = await readFile(
    join(process.cwd(), "src/features/patrol/ScanNfcScreen.tsx"),
    "utf8"
  );

  assert.match(serviceSource, /export function getNfcCodes\(tag: unknown\)/);
  assert.match(serviceSource, /codes\.add\(normalizeNfcCode\(ndefCode\)\)/);
  assert.match(serviceSource, /codes\.add\(normalizeNfcCode\(candidate\)\)/);
  assert.match(repositorySource, /nfcCode: string \| string\[\]/);
  assert.match(repositorySource, /scannedCodes\.flatMap\(getNfcCodeCandidates\)/);
  assert.match(screenSource, /const nfcCodes = getNfcCodes\(tag\)/);
  assert.match(screenSource, /scanPointByNfc\(assignmentId, nfcCodes\)/);
  assert.match(screenSource, /setStatus\("unmatched"\)/);
});
