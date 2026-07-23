import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("NFC scan handler acquires a synchronous lock and always releases it", async () => {
  const source = await readFile(
    join(process.cwd(), "src/features/patrol/ScanNfcScreen.tsx"),
    "utf8"
  );
  const handler = source.match(
    /const handleScan = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[assignmentId, router\]\);/
  );

  assert.ok(handler, "NFC scan handler was not found.");
  assert.match(
    handler[0],
    /if \(scanInProgressRef\.current\) \{\s*return;\s*\}\s*scanInProgressRef\.current = true;\s*setStatus\("reading"\)/
  );
  assert.match(
    handler[0],
    /finally \{\s*scanInProgressRef\.current = false;\s*\}/
  );
});
