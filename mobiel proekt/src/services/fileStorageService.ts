import * as FileSystem from "expo-file-system/legacy";
import { createMediaUsageTracker } from "./managedMediaUsage";
import { mapWithConcurrency } from "@/sync/boundedAsync";

import {
  assessLocalMediaStorage,
  minimumFreeStorageBytes,
  type LocalMediaStorageAssessment
} from "@/domain/files/localMediaStoragePolicy";

export { minimumFreeStorageBytes };

const mediaUsage = createMediaUsageTracker(scanManagedMedia);

export function getPatrolPhotoDirectory() {
  return `${FileSystem.documentDirectory ?? ""}patrol-photos`;
}

export async function ensurePatrolPhotoDirectory() {
  const directoryUri = getPatrolPhotoDirectory();
  const info = await FileSystem.getInfoAsync(directoryUri);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  }

  return directoryUri;
}

export async function deletePatrolPhotoDirectory() {
  const directoryUri = getPatrolPhotoDirectory();
  try { await FileSystem.deleteAsync(directoryUri, { idempotent: true }); }
  finally { mediaUsage.changed(directoryUri); }
}

export async function deleteOrphanPatrolPhotos(knownLocalPaths: readonly string[] | null) {
  if (!knownLocalPaths) {
    return;
  }

  const directoryUri = getPatrolPhotoDirectory();
  const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
  if (!directoryInfo.exists) {
    return;
  }

  const known = new Set(knownLocalPaths);
  const fileNames = await FileSystem.readDirectoryAsync(directoryUri);
  await mapWithConcurrency(fileNames, 4, async (fileName) => {
    const uri = `${directoryUri}/${fileName}`;
    if (!known.has(uri)) {
      await deletePreparedMedia(uri);
    }
  });
}

export async function persistPatrolPhoto(tempUri: string, clientFileId: string) {
  return persistMobileMedia(tempUri, clientFileId, "jpg");
}

export async function persistMobileMedia(tempUri: string, clientFileId: string, extension: "jpg" | "mp4") {
  const directoryUri = await ensurePatrolPhotoDirectory();
  const targetUri = `${directoryUri}/${clientFileId}.${extension}`;
  try {
    mediaUsage.changing();
    await FileSystem.copyAsync({ from: tempUri, to: targetUri });
  } catch (error) {
    await deletePreparedMedia(targetUri).catch(() => undefined);
    mediaUsage.changed(directoryUri);
    throw error;
  }

  try {
    const info = await FileSystem.getInfoAsync(targetUri);
    mediaUsage.changed(directoryUri, targetUri, info.exists && "size" in info ? info.size : undefined);
  } catch { mediaUsage.changed(directoryUri); }
  return targetUri;
}

export async function getLocalFileInfo(uri: string) {
  return FileSystem.getInfoAsync(uri, { md5: false });
}

export async function deletePreparedMedia(uri: string) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    mediaUsage.changed(getPatrolPhotoDirectory(), uri, 0);
  } catch (error) {
    mediaUsage.changed(getPatrolPhotoDirectory());
    throw error;
  }
}

export async function getLocalMediaStorageAssessment(requiredBytes = 0): Promise<LocalMediaStorageAssessment | null> {
  try {
    const [freeBytes, managedBytes] = await Promise.all([
      FileSystem.getFreeDiskStorageAsync(),
      mediaUsage.get(getPatrolPhotoDirectory())
    ]);
    return assessLocalMediaStorage(freeBytes, managedBytes, requiredBytes);
  } catch {
    return null;
  }
}

export async function assertStorageForMedia(requiredBytes = 0) {
  const assessment = await getLocalMediaStorageAssessment(requiredBytes);
  if (!assessment || assessment.canPersist) {
    return assessment;
  }

  if (assessment.status === "managedQuotaExceeded") {
    throw new Error("Локальное хранилище вложений заполнено. Дождитесь отправки подтверждённых отчётов или освободите память телефона.");
  }

  throw new Error("На телефоне недостаточно свободного места для сохранения вложения. Освободите память и повторите действие.");
}

export async function getLocalMediaStorageWarning() {
  const assessment = await getLocalMediaStorageAssessment();
  if (!assessment || assessment.status === "ready") {
    return null;
  }

  if (assessment.status === "warning") {
    return "На телефоне мало свободного места. Новые фото и видео могут не сохраниться.";
  }

  return "Недостаточно места для новых вложений. Существующие неотправленные файлы сохранены.";
}

export async function hasEnoughStorageForPhoto() {
  const assessment = await getLocalMediaStorageAssessment();
  return assessment?.freeBytes === undefined || assessment.canPersist;
}

async function scanManagedMedia(directoryUri: string) {
  const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
  if (!directoryInfo.exists) {
    return new Map<string, number>();
  }

  const fileNames = await FileSystem.readDirectoryAsync(directoryUri);
  const infos = await mapWithConcurrency(fileNames, 4, (fileName) => FileSystem.getInfoAsync(`${directoryUri}/${fileName}`));
  return new Map(infos.map((info, index) => [`${directoryUri}/${fileNames[index]}`, info.exists && typeof info.size === "number" ? info.size : 0]));
}
