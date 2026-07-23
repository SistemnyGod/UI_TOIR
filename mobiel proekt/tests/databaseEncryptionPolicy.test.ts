import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  buildSqlCipherKeyPragma,
  bytesToDatabaseEncryptionKey,
  databaseEncryptionKeyBytes,
  escapeSqliteString,
  haveMatchingTableCounts,
  isValidDatabaseEncryptionKey
} from "../src/db/databaseEncryptionPolicy.ts";

test("database encryption key is exactly 256 random bits encoded as hex", () => {
  const bytes = Uint8Array.from({ length: databaseEncryptionKeyBytes }, (_, index) => index);
  const key = bytesToDatabaseEncryptionKey(bytes);

  assert.equal(key.length, 64);
  assert.equal(isValidDatabaseEncryptionKey(key), true);
  assert.equal(isValidDatabaseEncryptionKey("short"), false);
  assert.equal(isValidDatabaseEncryptionKey("z".repeat(64)), false);
});

test("SQLCipher key pragma only accepts a validated raw hex key", () => {
  const key = "ab".repeat(databaseEncryptionKeyBytes);

  assert.equal(buildSqlCipherKeyPragma(key), `PRAGMA key = "x'${key}'";`);
  assert.throws(() => buildSqlCipherKeyPragma("not-a-key"));
});

test("SQLite migration paths are escaped before ATTACH", () => {
  assert.equal(escapeSqliteString("/data/user/it's/db"), "/data/user/it''s/db");
});

test("plaintext migration is accepted only when every protected table count matches", () => {
  const tables = ["reports", "outbox"] as const;
  const expected = { reports: 3, outbox: 2 };

  assert.equal(haveMatchingTableCounts(tables, expected, { reports: 3, outbox: 2 }), true);
  assert.equal(haveMatchingTableCounts(tables, expected, { reports: 3, outbox: 1 }), false);
});
test("encrypted repositories do not open an unkeyed expo-sqlite transaction connection", async () => {
  const databaseSource = await readFile(join(process.cwd(), "src/db/database.ts"), "utf8");
  const repositoryDirectory = join(process.cwd(), "src/db/repositories");
  const repositoryEntries = await readdir(repositoryDirectory);
  const repositorySources = await Promise.all(
    repositoryEntries
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => readFile(join(repositoryDirectory, entry), "utf8")),
  );
  const productionSource = [databaseSource, ...repositorySources].join("\n");

  assert.equal(productionSource.includes(".withExclusiveTransactionAsync("), false);
  assert.equal(productionSource.includes("withProtectedExclusiveTransactionAsync"), true);
});
