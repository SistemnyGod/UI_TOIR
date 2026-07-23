export const databaseEncryptionKeyBytes = 32;

export function isValidDatabaseEncryptionKey(value: string | null): value is string {
  return typeof value === "string"
    && value.length === databaseEncryptionKeyBytes * 2
    && /^[a-f0-9]+$/i.test(value);
}

export function bytesToDatabaseEncryptionKey(bytes: Uint8Array) {
  if (bytes.length !== databaseEncryptionKeyBytes) {
    throw new Error(`Database encryption key must contain ${databaseEncryptionKeyBytes} bytes.`);
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildSqlCipherKeyPragma(hexKey: string) {
  if (!isValidDatabaseEncryptionKey(hexKey)) {
    throw new Error("Database encryption key is invalid.");
  }

  return `PRAGMA key = "x'${hexKey}'";`;
}

export function escapeSqliteString(value: string) {
  return value.replaceAll("'", "''");
}

export function haveMatchingTableCounts<TableName extends string>(
  tables: readonly TableName[],
  expected: Readonly<Record<TableName, number>>,
  actual: Readonly<Record<TableName, number>>
) {
  return tables.every((table) => expected[table] === actual[table]);
}

export type ExistingDatabaseResolution =
  | "migrateLegacy"
  | "useEncryptedAndDeleteLegacy"
  | "useEncryptedAndKeepLegacy";

export function resolveExistingDatabaseConflict({
  encryptedHasApplicationSchema,
  protectedTableCountsMatch
}: {
  encryptedHasApplicationSchema: boolean;
  protectedTableCountsMatch: boolean;
}): ExistingDatabaseResolution {
  if (!encryptedHasApplicationSchema) {
    return "migrateLegacy";
  }

  return protectedTableCountsMatch
    ? "useEncryptedAndDeleteLegacy"
    : "useEncryptedAndKeepLegacy";
}
