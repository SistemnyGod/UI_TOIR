import * as SecureStore from "expo-secure-store";

export type BackgroundSyncSkipReason = "offline" | "serverUnavailable" | "unauthenticated" | "busy" | "failed";

export type BackgroundSyncSnapshot = {
  lastBackgroundSyncAt: string;
  lastSuccessfulSyncAt: string | null;
  lastSkippedReason: BackgroundSyncSkipReason | null;
};

const lastBackgroundSyncAtKey = "patrol360.backgroundSync.lastAttemptAt";
const lastSuccessfulSyncAtKey = "patrol360.backgroundSync.lastSuccessfulAt";
const lastSkippedReasonKey = "patrol360.backgroundSync.lastSkippedReason";

export async function recordBackgroundSyncResult(
  skipped: BackgroundSyncSkipReason | null,
  at = new Date().toISOString()
) {
  await Promise.all([
    SecureStore.setItemAsync(lastBackgroundSyncAtKey, at),
    SecureStore.setItemAsync(lastSkippedReasonKey, skipped ?? "")
  ]);

  if (skipped === null) {
    await SecureStore.setItemAsync(lastSuccessfulSyncAtKey, at);
  }
}

export async function readBackgroundSyncState(): Promise<BackgroundSyncSnapshot> {
  const [lastBackgroundSyncAt, lastSuccessfulSyncAt, lastSkippedReason] = await Promise.all([
    SecureStore.getItemAsync(lastBackgroundSyncAtKey),
    SecureStore.getItemAsync(lastSuccessfulSyncAtKey),
    SecureStore.getItemAsync(lastSkippedReasonKey)
  ]);

  return {
    lastBackgroundSyncAt: lastBackgroundSyncAt ?? "",
    lastSuccessfulSyncAt,
    lastSkippedReason: isBackgroundSyncSkipReason(lastSkippedReason) ? lastSkippedReason : null
  };
}

function isBackgroundSyncSkipReason(value: string | null): value is BackgroundSyncSkipReason {
  return value === "offline"
    || value === "serverUnavailable"
    || value === "unauthenticated"
    || value === "busy"
    || value === "failed";
}