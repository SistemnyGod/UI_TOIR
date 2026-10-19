import type { OutboxRetryReason } from "@/db/repositories/outboxTypes";

export type SyncFailureDisposition =
  | { kind: "retry"; reason: OutboxRetryReason; retryAfterSeconds: number | null }
  | { kind: "terminal"; status: number };

/** A failure the sync engine already knows to be temporary, with its reason. */
export class TransientSyncError extends Error {
  constructor(message: string, readonly reason: OutboxRetryReason, readonly retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "TransientSyncError";
  }
}

// 401 is resolved by the session layer (refresh, then waiting_auth). 426 asks
// for an app update; after updating, the same commands are still valid.
const nonTerminalClientStatuses = new Set([401, 426]);

/**
 * Decides from the HTTP status, never from the message text, whether a failed
 * send is worth retrying. A 4xx for the whole request means the server will
 * keep refusing it: retrying would block the report forever, so it becomes a
 * decision for the employee or dispatcher.
 */
export function classifySyncFailure(error: unknown): SyncFailureDisposition {
  if (error instanceof TransientSyncError) {
    return { kind: "retry", reason: error.reason, retryAfterSeconds: error.retryAfterSeconds };
  }

  if (isNetworkError(error)) {
    return { kind: "retry", reason: error.kind === "timeout" ? "timeout" : "network", retryAfterSeconds: null };
  }

  const status = readHttpStatus(error);
  if (status === null) {
    return { kind: "retry", reason: "unknown", retryAfterSeconds: null };
  }

  return classifyHttpStatus(status, readRetryAfterSeconds(error));
}

export function classifyHttpStatus(status: number, retryAfterSeconds: number | null = null): SyncFailureDisposition {
  if (status === 408) {
    return { kind: "retry", reason: "timeout", retryAfterSeconds };
  }
  if (status === 425 || status === 429) {
    return { kind: "retry", reason: "rateLimit", retryAfterSeconds };
  }
  if (status >= 500 && status <= 599) {
    return { kind: "retry", reason: "server", retryAfterSeconds };
  }
  if (status >= 400 && status <= 499 && !nonTerminalClientStatuses.has(status)) {
    return { kind: "terminal", status };
  }
  return { kind: "retry", reason: "unknown", retryAfterSeconds };
}

/** Parses Retry-After as delta seconds or an HTTP date; null when absent or invalid. */
export function parseRetryAfterHeader(value: string | null | undefined, nowMs = Date.now()): number | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  // HTTP-date only ("Mon, 19 Oct 2026 08:01:30 GMT"); bare numbers like "-5"
  // would otherwise parse as a year.
  const dateMs = /[a-z]/i.test(trimmed) ? Date.parse(trimmed) : Number.NaN;
  if (!Number.isFinite(dateMs)) {
    return null;
  }
  return Math.max(0, Math.ceil((dateMs - nowMs) / 1000));
}

function isNetworkError(error: unknown): error is { kind: string } {
  return error instanceof Error
    && error.name === "MobileNetworkError"
    && typeof (error as { kind?: unknown }).kind === "string";
}

function readHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function readRetryAfterSeconds(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const value = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
