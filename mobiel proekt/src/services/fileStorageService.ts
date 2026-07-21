import * as FileSystem from "expo-file-system/legacy";

const minimumFreeStorageBytes = 150 * 1024 * 1024;

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

export async function readFileAsBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function hasEnoughStorageForPhoto() {
  const freeBytes = await FileSystem.getFreeDiskStorageAsync();
  return freeBytes >= minimumFreeStorageBytes;
}
