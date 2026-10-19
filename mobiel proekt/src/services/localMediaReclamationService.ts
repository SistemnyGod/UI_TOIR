import { deletePreparedMedia } from "./fileStorageService";

import { hasUnfinishedFileCommand, listLinkedLocalFiles, markFileDeletedAfterRetention } from "@/db/repositories/filesRepository";
import { canReclaimLocalMedia } from "@/domain/files/localMediaRetention";

export async function reclaimAcceptedLocalMedia(ownerUserId: string, clientFileIds?: readonly string[]) {
  const files = await listLinkedLocalFiles(ownerUserId, clientFileIds);
  let reclaimed = 0;

  for (const file of files) {
    if (!canReclaimLocalMedia(file) || await hasUnfinishedFileCommand(ownerUserId, file.clientFileId)) {
      continue;
    }

    try {
      await deletePreparedMedia(file.localPath);
      await markFileDeletedAfterRetention(ownerUserId, file.clientFileId);
      reclaimed += 1;
    } catch {
      // Keep the linked row so a later bootstrap/sync pass retries reclamation.
    }
  }

  return reclaimed;
}
