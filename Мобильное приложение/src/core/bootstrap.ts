import { initializeDatabase } from "@/db/database";
import { listKnownLocalFilePaths } from "@/db/repositories/filesRepository";
import { deleteOrphanPatrolPhotos } from "@/services/fileStorageService";
import { recoverStaleSendingOutboxCommands } from "@/sync/syncEngine";

export async function bootstrapApplication() {
  await initializeDatabase();
  await recoverStaleSendingOutboxCommands();
  await deleteOrphanPatrolPhotos(await listKnownLocalFilePaths());
}
