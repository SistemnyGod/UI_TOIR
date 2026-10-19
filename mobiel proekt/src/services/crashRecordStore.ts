import { sanitizeDiagnosticMessage, truncateDiagnosticValue } from "@/services/diagnosticReportPolicy";

/**
 * Crash records live in a tiny JSON file in the document directory, written
 * synchronously from the crash handler. SQLite, SecureStore and bootstrap may
 * be unavailable (or be the cause) when the app dies, so this file is the only
 * place a crash is guaranteed to survive until the next start.
 */
export type CrashKind = "js.fatal" | "js.error" | "render" | "unhandledRejection";

export type CrashRecord = {
  fingerprint: string;
  kind: CrashKind;
  message: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type CrashRecordStorage = {
  read(): string | null;
  write(text: string): void;
  remove(): void;
};

export const MAX_CRASH_RECORDS = 20;
const MAX_CRASH_MESSAGE_LENGTH = 500;
const MAX_STACK_FRAMES = 3;
const crashFileName = "patrol360-crash-records.json";

let storageOverride: CrashRecordStorage | null = null;
let defaultStorage: CrashRecordStorage | null = null;

/** Tests swap the file for an in-memory store. */
export function setCrashRecordStorageForTests(storage: CrashRecordStorage | null) {
  storageOverride = storage;
}

function getStorage(): CrashRecordStorage {
  if (storageOverride) return storageOverride;
  if (!defaultStorage) defaultStorage = createDocumentFileStorage();
  return defaultStorage;
}

function createDocumentFileStorage(): CrashRecordStorage {
  // Required lazily: the crash handler is installed before any native module
  // is touched, and a missing module must not crash the crash handler.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return createFileCrashRecordStorage(require("expo-file-system") as FileSystemApi);
}

type FileSystemApi = Pick<typeof import("expo-file-system"), "File" | "Paths">;

/** The crash file in the app's document directory, read and written synchronously. */
export function createFileCrashRecordStorage({ File, Paths }: FileSystemApi): CrashRecordStorage {
  const file = () => new File(Paths.document, crashFileName);
  return {
    read: () => {
      const current = file();
      return current.exists ? current.textSync() : null;
    },
    write: (text) => {
      const current = file();
      if (!current.exists) current.create();
      current.write(text);
    },
    remove: () => {
      const current = file();
      if (current.exists) current.delete();
    }
  };
}

/** Strips tokens and credentials, and reduces every URL to its last path segment. */
export function sanitizeCrashText(text: string) {
  const withoutUrls = text.replace(
    /\b(?:https?|file|content|exp|ws|wss):\/\/[^\s)"'<>]+/gi,
    (url) => {
      const path = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
      const lastSegment = path.slice(path.lastIndexOf("/") + 1);
      return lastSegment && !lastSegment.includes("@") && path.split("/").length > 3 ? `[url]/${lastSegment}` : "[url]";
    }
  );
  const withoutPaths = withoutUrls
    // Absolute file paths can carry a user or device name: keep the file name.
    .replace(/(?:\b[A-Za-z]:)?(?:[\\/][^\s()\\/:]+)+[\\/]([^\s()\\/]+)/g, "…/$1")
    .replace(/\b(token|session|key|pin|code)(\s*[:=]\s*)[^,\s"'&})]+/gi, "$1$2[redacted]");
  return sanitizeDiagnosticMessage(withoutPaths.replace(/\s+/g, " ").trim());
}

/** A short, sanitized one-line description: "Name: message @ frame < frame". */
export function describeCrash(error: unknown, componentStack?: string | null) {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error
    ? error.message
    : typeof error === "string" ? error : safeStringify(error);
  const frames = topFrames(error instanceof Error ? error.stack : undefined, componentStack);
  const description = `${name}: ${message || "без сообщения"}${frames.length > 0 ? ` @ ${frames.join(" < ")}` : ""}`;
  return truncateDiagnosticValue(sanitizeCrashText(description), MAX_CRASH_MESSAGE_LENGTH);
}

function topFrames(stack: string | undefined, componentStack?: string | null) {
  const source = componentStack || stack || "";
  return source
    .split("\n")
    .map((line) => line.trim().replace(/^at\s+/, ""))
    .filter((line) => line.length > 0 && !/^[A-Za-z]*Error\b/.test(line))
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => truncateDiagnosticValue(line, 80));
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function readCrashRecords(): CrashRecord[] {
  try {
    const text = getStorage().read();
    if (!text) return [];
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isCrashRecord).slice(0, MAX_CRASH_RECORDS) : [];
  } catch {
    return [];
  }
}

function isCrashRecord(value: unknown): value is CrashRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.fingerprint === "string"
    && typeof record.kind === "string"
    && typeof record.message === "string"
    && typeof record.count === "number"
    && typeof record.firstSeenAt === "string"
    && typeof record.lastSeenAt === "string";
}

/**
 * Synchronously appends a crash. Repeats of the same crash only bump a
 * counter, and the oldest records are dropped beyond MAX_CRASH_RECORDS, so a
 * crash loop cannot grow the file. Never throws.
 */
export function recordCrash(kind: CrashKind, error: unknown, options: { componentStack?: string | null; now?: Date } = {}) {
  try {
    const message = describeCrash(error, options.componentStack);
    const seenAt = (options.now ?? new Date()).toISOString();
    const fingerprint = `${kind}|${message}`;
    const records = readCrashRecords();
    const existing = records.find((record) => record.fingerprint === fingerprint);
    if (existing) {
      existing.count = Math.min(existing.count + 1, 1_000_000);
      existing.lastSeenAt = seenAt > existing.lastSeenAt ? seenAt : existing.lastSeenAt;
    } else {
      records.push({ fingerprint, kind, message, count: 1, firstSeenAt: seenAt, lastSeenAt: seenAt });
    }
    const kept = records
      .sort((left, right) => left.lastSeenAt.localeCompare(right.lastSeenAt))
      .slice(-MAX_CRASH_RECORDS);
    getStorage().write(JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}

export function crashEventType(kind: CrashKind) {
  return `app.crash.${kind}`;
}

/** Crash records seen up to `through`, as daily diagnostic entries. */
export function buildCrashDiagnosticEntries(records: CrashRecord[], through: string) {
  return records
    .filter((record) => record.lastSeenAt <= through)
    .map((record) => ({
      eventType: crashEventType(record.kind),
      message: record.message,
      count: record.count,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt
    }));
}

/**
 * Called once the server accepted a report: removes the records that report
 * carried. A record that crashed again after the report was built has a later
 * lastSeenAt and stays for the next report.
 */
export function clearDeliveredCrashRecords(report: { periodEnd: string; entries: { eventType: string; message: string }[] }) {
  try {
    const delivered = new Set(report.entries.map((entry) => `${entry.eventType}|${entry.message}`));
    const records = readCrashRecords();
    const remaining = records.filter((record) =>
      !(record.lastSeenAt <= report.periodEnd && delivered.has(`${crashEventType(record.kind)}|${record.message}`))
    );
    if (remaining.length === records.length) return;
    if (remaining.length === 0) {
      getStorage().remove();
    } else {
      getStorage().write(JSON.stringify(remaining));
    }
  } catch {
    // A failed cleanup only means the crash is reported once more.
  }
}
