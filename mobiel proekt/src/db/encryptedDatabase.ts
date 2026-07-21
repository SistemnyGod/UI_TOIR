import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

import {
  buildSqlCipherKeyPragma,
  bytesToDatabaseEncryptionKey,
  databaseEncryptionKeyBytes,
  escapeSqliteString,
  haveMatchingTableCounts,
  isValidDatabaseEncryptionKey
} from "@/db/databaseEncryptionPolicy";

const legacyDatabaseName = "patrol360-mobile.db";
const encryptedDatabaseName = "patrol360-mobile-encrypted.db";
const databaseEncryptionKeyName = "patrol360.databaseEncryptionKey.v1";
const protectedTables = [
  "users",
  "devices",
  "patrol_request_board",
  "patrol_assignments",
  "assignment_route_points",
  "routes",
  "route_points",
  "point_results",
  "files",
  "outbox_commands",
  "sync_cursors",
  "sync_conflicts",
  "mobile_notifications",
  "mobile_diagnostic_state",
  "mobile_employees",
  "emu_sections",
  "work_tasks",
  "shift_remarks",
  "mobile_logout_queue",
  "mobile_action_log",
  "mobile_diagnostic_reports"
] as const;

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

      if (await hasApplicationSchema(encryptedDatabase)
        && await hasSameProtectedTableCountsAsLegacy(encryptedDatabase)) {
        await deleteDatabaseFiles(legacyDatabaseName);
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

async function openEncryptedDatabase(key: string) {
  const database = await SQLite.openDatabaseAsync(encryptedDatabaseName);
  try {
    await database.execAsync(buildSqlCipherKeyPragma(key));
    const integrity = await database.getFirstAsync<{ integrity_check: string }>("PRAGMA integrity_check;");
    if (integrity?.integrity_check !== "ok") {
      throw new Error("Encrypted SQLite integrity check failed.");
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
    const expectedCounts = await readProtectedTableCounts(legacyDatabase);
    await deleteDatabaseFiles(encryptedDatabaseName);
    await legacyDatabase.execAsync(`
      ATTACH DATABASE '${escapeSqliteString(encryptedPath)}' AS encrypted KEY "x'${key}'";
      SELECT sqlcipher_export('encrypted');
      DETACH DATABASE encrypted;
    `);
    await legacyDatabase.closeAsync();

    const encryptedDatabase = await openEncryptedDatabase(key);
    try {
      const actualCounts = await readProtectedTableCounts(encryptedDatabase);
      if (!haveMatchingTableCounts(protectedTables, expectedCounts, actualCounts)) {
        throw new Error("Encrypted database row-count verification failed.");
      }
    } finally {
      await encryptedDatabase.closeAsync();
    }

    await deleteDatabaseFiles(legacyDatabaseName);
  } catch (error) {
    await legacyDatabase.closeAsync().catch(() => undefined);
    await deleteDatabaseFiles(encryptedDatabaseName);
    throw new Error("Не удалось безопасно зашифровать локальную базу. Исходная база сохранена без изменений.", { cause: error });
  }
}

async function readProtectedTableCounts(database: SQLite.SQLiteDatabase) {
  const counts = {} as Record<(typeof protectedTables)[number], number>;
  for (const table of protectedTables) {
    const tableExists = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?;",
      [table]
    );
    if ((tableExists?.count ?? 0) === 0) {
      counts[table] = 0;
      continue;
    }

    const row = await database.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table};`);
    counts[table] = row?.count ?? 0;
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
      readProtectedTableCounts(encryptedDatabase),
      readProtectedTableCounts(legacyDatabase)
    ]);
    return haveMatchingTableCounts(protectedTables, legacyCounts, encryptedCounts);
  } finally {
    await legacyDatabase.closeAsync();
  }
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
