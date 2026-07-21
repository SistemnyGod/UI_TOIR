import { initializeDatabase } from "@/db/database";
import { listKnownLocalFilePaths } from "@/db/repositories/filesRepository";
import { pruneMobileActionLog } from "@/db/repositories/mobileActionLogRepository";
import { deleteOrphanPatrolPhotos } from "@/services/fileStorageService";
import { reclaimAcceptedLocalMedia } from "@/services/localMediaReclamationService";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { recoverStaleSendingOutboxCommands } from "@/sync/syncEngine";

export async function bootstrapApplication() {
  await initializeDatabase();
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
