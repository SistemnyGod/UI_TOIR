import * as FileSystem from "expo-file-system/legacy";

import { deleteLinkedLocalFileRecord, listLinkedLocalFiles } from "@/db/repositories/filesRepository";
import { canReclaimLocalMedia } from "@/domain/files/localMediaRetention";

export async function reclaimAcceptedLocalMedia(ownerUserId: string, clientFileIds?: readonly string[]) {
  const files = await listLinkedLocalFiles(ownerUserId, clientFileIds);
  let reclaimed = 0;

  for (const file of files) {
    if (!canReclaimLocalMedia(file.status)) {
      continue;
    }

    try {
      await FileSystem.deleteAsync(file.localPath, { idempotent: true });
      await deleteLinkedLocalFileRecord(ownerUserId, file.clientFileId);
      reclaimed += 1;
    } catch {
      // Keep the linked row so a later bootstrap/sync pass retries reclamation.
    }
  }

  return reclaimed;
}
