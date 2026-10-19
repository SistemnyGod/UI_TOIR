import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { SQLiteOpenOptions } from "expo-sqlite";

import {
  buildSqlCipherKeyPragma,
  bytesToDatabaseEncryptionKey,
  databaseEncryptionKeyBytes,
  escapeSqliteString,
  haveMatchingTableCounts,
  isValidDatabaseEncryptionKey,
  resolveExistingDatabaseConflict
} from "@/db/databaseEncryptionPolicy";

const legacyDatabaseName = "patrol360-mobile.db";
const encryptedDatabaseName = "patrol360-mobile-encrypted.db";
const databaseEncryptionKeyName = "patrol360.databaseEncryptionKey.v1";

export async function openProtectedDatabase() {
  const encryptedPath = databasePath(encryptedDatabaseName);
  const legacyPath = databasePath(legacyDatabaseName);
  const [encryptedExists, legacyExists] = await Promise.all([
    fileExists(encryptedPath),
    fileExists(legacyPath)
  ]);
  const key = await getOrCreateDatabaseEncryptionKey(encryptedExists);

  if (encryptedExists) {
    const encryptedDatabase = await openEncryptedDatabase(key);
    try {
      if (!legacyExists) {
        return encryptedDatabase;
      }

      const encryptedHasApplicationSchema = await hasApplicationSchema(encryptedDatabase);
      if (encryptedHasApplicationSchema) {
        await cleanUpLegacyDatabaseIfSafe(encryptedDatabase);
        return encryptedDatabase;
      }
    } catch (error) {
      await encryptedDatabase.closeAsync().catch(() => undefined);
      throw error;
    }

    await encryptedDatabase.closeAsync();
    await deleteDatabaseFiles(encryptedDatabaseName);
  }

  if (legacyExists) {
    await migratePlaintextDatabase(key);
  }

  return openEncryptedDatabase(key);
}

async function cleanUpLegacyDatabaseIfSafe(encryptedDatabase: SQLite.SQLiteDatabase) {
  try {
    const protectedTableCountsMatch = await hasSameProtectedTableCountsAsLegacy(encryptedDatabase);
    const resolution = resolveExistingDatabaseConflict({
      encryptedHasApplicationSchema: true,
      protectedTableCountsMatch
    });

    if (resolution === "useEncryptedAndDeleteLegacy") {
      await deleteDatabaseFiles(legacyDatabaseName);
    }
  } catch (error) {
    console.warn("Legacy database cleanup was skipped; encrypted data remains authoritative.", error);
  }
}

export async function openProtectedDatabaseConnection() {
  const storedKey = await SecureStore.getItemAsync(databaseEncryptionKeyName);
  if (!isValidDatabaseEncryptionKey(storedKey)) {
    throw new Error("Ключ локальной базы отсутствует или повреждён.");
  }

  return openEncryptedDatabase(storedKey.toLowerCase(), { useNewConnection: true }, false);
}
async function getOrCreateDatabaseEncryptionKey(encryptedDatabaseExists: boolean) {
  const storedKey = await SecureStore.getItemAsync(databaseEncryptionKeyName);
  if (isValidDatabaseEncryptionKey(storedKey)) {
    return storedKey.toLowerCase();
  }

  if (storedKey) {
    throw new Error("Ключ локальной базы повреждён. Данные не будут открыты или перезаписаны.");
  }

  if (encryptedDatabaseExists) {
    throw new Error("Ключ локальной базы отсутствует. Автоматическое создание нового ключа заблокировано, чтобы не потерять данные.");
  }

  const key = bytesToDatabaseEncryptionKey(await Crypto.getRandomBytesAsync(databaseEncryptionKeyBytes));
  await SecureStore.setItemAsync(databaseEncryptionKeyName, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
  });
  return key;
}

async function openEncryptedDatabase(key: string, options?: SQLiteOpenOptions, verifyIntegrity = true) {
  const database = await SQLite.openDatabaseAsync(encryptedDatabaseName, options);
  try {
    await database.execAsync(buildSqlCipherKeyPragma(key));
    if (verifyIntegrity) {
      const integrity = await database.getFirstAsync<{ integrity_check: string }>("PRAGMA integrity_check;");
      if (integrity?.integrity_check !== "ok") {
        throw new Error("Encrypted SQLite integrity check failed.");
      }
    }
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw new Error("Не удалось открыть защищённую локальную базу. Данные не были перезаписаны.", { cause: error });
  }
}

async function migratePlaintextDatabase(key: string) {
  const legacyDatabase = await SQLite.openDatabaseAsync(legacyDatabaseName, { useNewConnection: true });
  const encryptedPath = databasePath(encryptedDatabaseName);
  try {
    await legacyDatabase.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
    const expectedCounts = await readApplicationTableCounts(legacyDatabase);
    await deleteDatabaseFiles(encryptedDatabaseName);
    await legacyDatabase.execAsync(`
      ATTACH DATABASE '${escapeSqliteString(encryptedPath)}' AS encrypted KEY "x'${key}'";
      SELECT sqlcipher_export('encrypted');
      DETACH DATABASE encrypted;
    `);
    const encryptedDatabase = await openEncryptedDatabase(key);
    try {
      const actualCounts = await readApplicationTableCounts(encryptedDatabase);
      if (!haveMatchingTableCounts(Object.keys(expectedCounts), expectedCounts, actualCounts)) {
        throw new Error("Encrypted database row-count verification failed.");
      }
      if (!await haveMatchingApplicationRows(legacyDatabase, encryptedDatabase, Object.keys(expectedCounts))) {
        throw new Error("Encrypted database content verification failed.");
      }
    } finally {
      await encryptedDatabase.closeAsync();
    }

    await legacyDatabase.closeAsync();
  } catch (error) {
    await legacyDatabase.closeAsync().catch(() => undefined);
    await deleteDatabaseFiles(encryptedDatabaseName);
    throw new Error("Не удалось безопасно зашифровать локальную базу. Исходная база сохранена без изменений.", { cause: error });
  }
  // Verification succeeded. A partial legacy cleanup can already have removed
  // the source .db; it must never roll back the only verified surviving copy.
  await deleteDatabaseFiles(legacyDatabaseName).catch(error => {
    console.warn("Legacy cleanup after migration was skipped; the verified encrypted database is preserved.", error);
  });
}

async function readApplicationTableCounts(database: SQLite.SQLiteDatabase) {
  // Discover every application table so newly added drafts and cursors cannot
  // silently fall outside the migration/legacy-cleanup verification.
  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name;"
  );
  const counts: Record<string, number> = Object.create(null);
  for (const { name } of tables) {
    const identifier = '"' + name.replaceAll('"', '""') + '"';
    const row = await database.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${identifier};`);
    if (!row || !Number.isSafeInteger(row.count) || row.count < 0) {
      throw new Error("Не удалось проверить число строк локальной таблицы.");
    }
    counts[name] = row.count;
  }
  return counts;
}

async function hasApplicationSchema(database: SQLite.SQLiteDatabase) {
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations';"
  );
  return (row?.count ?? 0) > 0;
}

async function hasSameProtectedTableCountsAsLegacy(encryptedDatabase: SQLite.SQLiteDatabase) {
  const legacyDatabase = await SQLite.openDatabaseAsync(legacyDatabaseName, { useNewConnection: true });
  try {
    await legacyDatabase.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
    const [encryptedCounts, legacyCounts] = await Promise.all([
      readApplicationTableCounts(encryptedDatabase),
      readApplicationTableCounts(legacyDatabase)
    ]);
    return haveMatchingTableCounts(Object.keys(legacyCounts), legacyCounts, encryptedCounts)
      && await haveMatchingApplicationRows(legacyDatabase, encryptedDatabase, Object.keys(legacyCounts));
  } finally {
    await legacyDatabase.closeAsync();
  }
}

function quoteIdentifier(value: string) {
  return '"' + value.replaceAll('"', '""') + '"';
}

async function haveMatchingApplicationRows(source: SQLite.SQLiteDatabase, target: SQLite.SQLiteDatabase, tables: string[]) {
  for (const name of tables) {
    const table = quoteIdentifier(name);
    const [sourceColumns, targetColumns] = await Promise.all([
      source.getAllAsync<{ name: string; type: string }>(`PRAGMA table_info(${table});`),
      target.getAllAsync<{ name: string; type: string }>(`PRAGMA table_info(${table});`)
    ]);
    if (!sourceColumns.length || sourceColumns.some(column => !targetColumns.some(other => other.name === column.name && other.type === column.type))) {
      return false;
    }
    const projection = sourceColumns.map(column => quoteIdentifier(column.name)).join(', ');
    const order = sourceColumns.map(column => `${quoteIdentifier(column.name)} COLLATE BINARY`).join(', ');
    const sql = `SELECT ${projection} FROM ${table} ORDER BY ${order};`;
    // Stream one row at a time without repeated sorting/OFFSET scans or
    // materializing a large database in JS. Always finalize both cursors.
    const left = source.getEachAsync<Record<string, unknown>>(sql)[Symbol.asyncIterator]();
    const right = target.getEachAsync<Record<string, unknown>>(sql)[Symbol.asyncIterator]();
    const serialize = (row: Record<string, unknown>) => JSON.stringify(sourceColumns.map(column => {
      const value = row[column.name];
      return value instanceof Uint8Array
        ? ["blob", Array.from(value)]
        : [typeof value, typeof value === "number" || typeof value === "bigint" ? String(value) : value];
    }));
    try {
      while (true) {
        const [a, b] = await Promise.all([left.next(), right.next()]);
        if (a.done || b.done) {
          if (Boolean(a.done) !== Boolean(b.done)) return false;
          break;
        }
        if (serialize(a.value) !== serialize(b.value)) return false;
      }
    } finally {
      await Promise.all([left.return?.(), right.return?.()]);
    }
  }
  return true;
}

function databasePath(databaseName: string) {
  return `${String(SQLite.defaultDatabaseDirectory).replace(/\/+$/, "")}/${databaseName}`;
}

async function fileExists(path: string) {
  return (await FileSystem.getInfoAsync(toFileUri(path))).exists;
}

async function deleteDatabaseFiles(databaseName: string) {
  const path = databasePath(databaseName);
  await Promise.all(["", "-wal", "-shm"].map((suffix) =>
    FileSystem.deleteAsync(toFileUri(`${path}${suffix}`), { idempotent: true })
  ));
}

function toFileUri(path: string) {
  return path.startsWith("file://") ? path : `file://${path}`;
}
