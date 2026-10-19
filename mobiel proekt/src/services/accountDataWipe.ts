import { clearLocalUserData } from "@/db/repositories/bootstrapRepository";
import { deleteStoredPatrolDeviceContext } from "@/db/repositories/patrolContextRepository";
import { clearCrashRecords } from "@/services/crashRecordStore";
import { deleteAccountCacheFiles, deletePatrolPhotoDirectory } from "@/services/fileStorageService";
import { clearAccountNotifications } from "@/services/reportDeliveryNotifications";
import { clearBackgroundSyncState } from "@/sync/backgroundSyncState";

/**
 * Shift phones are shared, so nothing of the account that signed out may stay
 * on the device. Kept on purpose: device id, server address, theme, clock
 * offset, diagnostics opt-in, the battery prompt flag, a downloaded update APK,
 * the pending server revoke (mobile_logout_queue) and, only when the employee
 * ticked «Запомнить логин и пароль», the saved login pair.
 */

/** Files, notifications and SecureStore entries outside SQLite. Never throws. */
export async function wipeAccountDeviceTraces(ownerUserId: string | null) {
  const steps: [string, () => Promise<unknown> | unknown][] = [
    ["photos", deletePatrolPhotoDirectory],
    ["cache", deleteAccountCacheFiles],
    ["notifications", clearAccountNotifications],
    ["backgroundSyncState", clearBackgroundSyncState],
    ["crashRecords", clearCrashRecords],
    ["patrolContext", () => ownerUserId ? deleteStoredPatrolDeviceContext(ownerUserId) : undefined]
  ];
  const results = await Promise.allSettled(steps.map(async ([, step]) => step()));
  return steps.filter((_, index) => results[index].status === "rejected").map(([name]) => name);
}

/**
 * Sign-out wipe. SQLite rows of every account table are removed in one
 * transaction and a failure there is reported to the caller (the next sign-in
 * then replaces the leftovers before showing anything). The rest is best effort.
 */
export async function wipeSignedOutAccountData(ownerUserId: string | null) {
  const databaseError = await clearLocalUserData().then(() => null, (error: unknown) => error ?? new Error("SQLite"));
  const failedSteps = await wipeAccountDeviceTraces(ownerUserId);
  if (databaseError) throw databaseError;
  return failedSteps;
}
