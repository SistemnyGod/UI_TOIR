import * as FileSystem from "expo-file-system/legacy";

import {
  assessLocalMediaStorage,
  minimumFreeStorageBytes,
  type LocalMediaStorageAssessment
} from "@/domain/files/localMediaStoragePolicy";

export { minimumFreeStorageBytes };

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
  await FileSystem.deleteAsync(directoryUri, { idempotent: true });
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
  await Promise.all(
    fileNames.map(async (fileName) => {
      const uri = `${directoryUri}/${fileName}`;
      if (!known.has(uri)) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    })
  );
}

export async function persistPatrolPhoto(tempUri: string, clientFileId: string) {
  return persistMobileMedia(tempUri, clientFileId, "jpg");
}

export async function persistMobileMedia(tempUri: string, clientFileId: string, extension: "jpg" | "mp4") {
  const directoryUri = await ensurePatrolPhotoDirectory();
  const targetUri = `${directoryUri}/${clientFileId}.${extension}`;
  await FileSystem.copyAsync({ from: tempUri, to: targetUri });

  return targetUri;
}

export async function getLocalFileInfo(uri: string) {
  return FileSystem.getInfoAsync(uri, { md5: false });
}

export async function getLocalMediaStorageAssessment(requiredBytes = 0): Promise<LocalMediaStorageAssessment | null> {
  try {
    const [freeBytes, managedBytes] = await Promise.all([
      FileSystem.getFreeDiskStorageAsync(),
      getManagedMediaBytes()
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

async function getManagedMediaBytes() {
  const directoryUri = getPatrolPhotoDirectory();
  const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
  if (!directoryInfo.exists) {
    return 0;
  }

  const fileNames = await FileSystem.readDirectoryAsync(directoryUri);
  const infos = await Promise.all(fileNames.map((fileName) => FileSystem.getInfoAsync(`${directoryUri}/${fileName}`)));
  return infos.reduce((total, info) => total + (info.exists && typeof info.size === "number" ? info.size : 0), 0);
}