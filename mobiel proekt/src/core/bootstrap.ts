import { initializeDatabase } from "@/db/database";
import { listKnownLocalFilePaths } from "@/db/repositories/filesRepository";
import { pruneMobileActionLog } from "@/db/repositories/mobileActionLogRepository";
import { deleteOrphanPatrolPhotos } from "@/services/fileStorageService";
import { reclaimAcceptedLocalMedia } from "@/services/localMediaReclamationService";
import { clearTokens, getStoredOwnerUserId, getStoredSessionSnapshot } from "@/auth/tokenStorage";
import { completePendingAuthTransition, getPendingAuthTransition } from "@/db/repositories/bootstrapRepository";
import { recoverSendingOutboxCommandsAfterProcessRestart, recoverStaleSendingOutboxCommands } from "@/sync/syncEngine";

export async function bootstrapApplication() {
  await initializeDatabase();
  const transition = await getPendingAuthTransition();
  if (transition) {
    const storedSession = await getStoredSessionSnapshot();
    const sessionMatchesTransition = storedSession.ownerUserId === transition.targetOwnerUserId
      && storedSession.offlineSession?.userId === transition.targetOwnerUserId
      && storedSession.offlineSession.contourId === transition.contourId
      && Boolean(storedSession.accessToken || storedSession.refreshToken);
    if (sessionMatchesTransition) {
      await completePendingAuthTransition(transition.targetOwnerUserId);
    } else {
      await clearTokens();
    }
  }
  await recoverSendingOutboxCommandsAfterProcessRestart();
  await recoverStaleSendingOutboxCommands();
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    // SecureStore can be temporarily unavailable while the encrypted DB and
    // photo directory are still intact. Never treat an unknown owner as an
    // empty database: pruning would physically delete unsent attachments.
    return;
  }

  // Stays before the first screen: once the camera can run, a photo copied to
  // disk but not yet recorded in SQLite would look like an orphan.
  await deleteOrphanPatrolPhotos(await listKnownLocalFilePaths());
}

/**
 * Housekeeping that the first screen does not depend on. The sync engine
 * already reclaims accepted media while the app is in use, so running it
 * after the first render is equally safe.
 */
export async function runDeferredStartupMaintenance() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return;
  }

  await pruneMobileActionLog(ownerUserId);
  await reclaimAcceptedLocalMedia(ownerUserId);
}
