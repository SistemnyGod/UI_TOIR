import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repositoryFiles = [
  "filesRepository.ts",
  "outboxRepository.ts",
  "notificationRepository.ts",
  "logoutQueueRepository.ts"
];

test("service SQLite writes use the shared busy retry policy", async () => {
  for (const fileName of repositoryFiles) {
    const source = await readFile(
      join(process.cwd(), "src/db/repositories", fileName),
      "utf8"
    );

    assert.match(source, /withSqliteBusyRetry/);
    assert.doesNotMatch(
      source,
      /await\s+db\.runAsync\s*\(/,
      `${fileName} contains an unguarded service write.`
    );

    if (fileName === "logoutQueueRepository.ts") {
      assert.match(source, /const logoutIntentId = Crypto\.randomUUID\(\);/);
      assert.match(source, /\[logoutIntentId, ownerUserId, currentContourId, createdAtLocal\]/);
    }
  }
});