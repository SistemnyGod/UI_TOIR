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

  await pruneMobileActionLog(ownerUserId);
  await reclaimAcceptedLocalMedia(ownerUserId);
  await deleteOrphanPatrolPhotos(await listKnownLocalFilePaths());
}
