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
  if (ownerUserId) {
    await pruneMobileActionLog(ownerUserId);
    await reclaimAcceptedLocalMedia(ownerUserId);
  }
  await deleteOrphanPatrolPhotos(await listKnownLocalFilePaths());
}
