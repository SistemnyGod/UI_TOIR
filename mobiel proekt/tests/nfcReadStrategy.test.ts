import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("NFC fallback technologies are requested in one tag session", async () => {
  const source = await readFile(
    join(process.cwd(), "src/services/nfcService.ts"),
    "utf8"
  );

  assert.equal(source.match(/NfcManager\.requestTechnology\(/g)?.length, 1);
  assert.match(source, /requestTechnology\(nfcTechFallbackOrder\)/);
  assert.doesNotMatch(source, /for\s*\(\s*const tech of nfcTechFallbackOrder/);
  assert.match(source, /cancelTechnologyRequest\(\{\s*delayMsAndroid:\s*0\s*\}\)/);
});
