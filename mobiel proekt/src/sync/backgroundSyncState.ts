import * as SecureStore from "expo-secure-store";

export type BackgroundSyncSkipReason = "offline" | "serverUnavailable" | "unauthenticated" | "wrongContour" | "busy" | "failed";
export type BackgroundSyncOutcome = "complete" | "partial" | "skipped" | "failed";

export type BackgroundSyncSnapshot = {
  lastBackgroundSyncAt: string;
  lastSuccessfulSyncAt: string | null;
  lastServerContactAt: string | null;
  lastCompleteQueueSyncAt: string | null;
  lastReportDeliveredAt: string | null;
  lastSkippedReason: BackgroundSyncSkipReason | null;
};

type BackgroundSyncResultInput = {
  skipped: BackgroundSyncSkipReason | null;
  outcome: BackgroundSyncOutcome;
  sent?: number;
};

const lastBackgroundSyncAtKey = "patrol360.backgroundSync.lastAttemptAt";
const lastSuccessfulSyncAtKey = "patrol360.backgroundSync.lastSuccessfulAt";
const lastServerContactAtKey = "patrol360.backgroundSync.lastServerContactAt";
const lastCompleteQueueSyncAtKey = "patrol360.backgroundSync.lastCompleteQueueSyncAt";
const lastReportDeliveredAtKey = "patrol360.backgroundSync.lastReportDeliveredAt";
const lastSkippedReasonKey = "patrol360.backgroundSync.lastSkippedReason";

export async function recordBackgroundSyncResult(
  input: BackgroundSyncSkipReason | null | BackgroundSyncResultInput,
  at = new Date().toISOString()
) {
  const result: BackgroundSyncResultInput = typeof input === "object" && input !== null
    ? input
    : { skipped: input, outcome: input === null ? "complete" : input === "failed" ? "failed" : "skipped" };
  const writes: Promise<void>[] = [
    SecureStore.setItemAsync(lastBackgroundSyncAtKey, at),
    SecureStore.setItemAsync(lastSkippedReasonKey, result.skipped ?? "")
  ];

  if (result.skipped === null) {
    writes.push(SecureStore.setItemAsync(lastServerContactAtKey, at));
  }
  if (result.outcome === "complete") {
    writes.push(
      SecureStore.setItemAsync(lastSuccessfulSyncAtKey, at),
      SecureStore.setItemAsync(lastCompleteQueueSyncAtKey, at)
    );
  }
  if ((result.sent ?? 0) > 0) {
    writes.push(SecureStore.setItemAsync(lastReportDeliveredAtKey, at));
  }

  await Promise.all(writes);
}

export async function readBackgroundSyncState(): Promise<BackgroundSyncSnapshot> {
  const [lastBackgroundSyncAt, lastSuccessfulSyncAt, lastServerContactAt, lastCompleteQueueSyncAt, lastReportDeliveredAt, lastSkippedReason] = await Promise.all([
    SecureStore.getItemAsync(lastBackgroundSyncAtKey),
    SecureStore.getItemAsync(lastSuccessfulSyncAtKey),
    SecureStore.getItemAsync(lastServerContactAtKey),
    SecureStore.getItemAsync(lastCompleteQueueSyncAtKey),
    SecureStore.getItemAsync(lastReportDeliveredAtKey),
    SecureStore.getItemAsync(lastSkippedReasonKey)
  ]);

  return {
    lastBackgroundSyncAt: lastBackgroundSyncAt ?? "",
    lastSuccessfulSyncAt,
    lastServerContactAt,
    lastCompleteQueueSyncAt,
    lastReportDeliveredAt,
    lastSkippedReason: isBackgroundSyncSkipReason(lastSkippedReason) ? lastSkippedReason : null
  };
}

function isBackgroundSyncSkipReason(value: string | null): value is BackgroundSyncSkipReason {
  return value === "offline"
    || value === "serverUnavailable"
    || value === "unauthenticated"
    || value === "wrongContour"
    || value === "busy"
    || value === "failed";
}