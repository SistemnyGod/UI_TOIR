import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { attachPhotoToPoint } from "@/db/repositories/patrolRepository";
import { attachMediaToShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { getLocalFileInfo, hasEnoughStorageForPhoto } from "@/services/fileStorageService";
import { prepareLocalMedia, prepareLocalPhoto } from "@/sync/fileUploadQueue";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";

const maxPhotoSidePx = 1600;
const maxVideoBytes = 25 * 1024 * 1024;

export type MediaAttachResult = "attached" | "cancelled";

export async function attachPointPhotoFromCamera(assignmentId: string, pointId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("camera");
  if (!assets?.length) {
    return "cancelled" satisfies MediaAttachResult;
  }

  await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, assets);

  return "attached" satisfies MediaAttachResult;
}

export async function attachPointPhotoFromGallery(assignmentId: string, pointId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("library");
  if (!assets?.length) {
    return "cancelled" satisfies MediaAttachResult;
  }

  await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, assets);

  return "attached" satisfies MediaAttachResult;
}

export async function attachPointVideoFromCamera(assignmentId: string, pointId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("camera");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset);
  await attachPhotoToPoint(assignmentId, pointId, file);

  return "attached" satisfies MediaAttachResult;
}

export async function attachPointVideoFromGallery(assignmentId: string, pointId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("library");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset);
  await attachPhotoToPoint(assignmentId, pointId, file);

  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkPhotoFromCamera(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("camera");
  if (!assets?.length) {
    return "cancelled" satisfies MediaAttachResult;
  }

  await attachRemarkPhotoAssets(ownerUserId, remarkId, assets);
  triggerForegroundSyncWithRetry();

  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkPhotoFromGallery(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("library");
  if (!assets?.length) {
    return "cancelled" satisfies MediaAttachResult;
  }

  await attachRemarkPhotoAssets(ownerUserId, remarkId, assets);
  triggerForegroundSyncWithRetry();

  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkVideoFromCamera(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("camera");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const file = await prepareRemarkVideo(ownerUserId, remarkId, asset);
  await attachMediaToShiftRemark(remarkId, file);
  triggerForegroundSyncWithRetry();

  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkVideoFromGallery(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("library");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const file = await prepareRemarkVideo(ownerUserId, remarkId, asset);
  await attachMediaToShiftRemark(remarkId, file);
  triggerForegroundSyncWithRetry();

  return "attached" satisfies MediaAttachResult;
}

async function prepareOwnerAndStorage() {
  if (!(await hasEnoughStorageForPhoto())) {
    throw new Error("На телефоне мало свободного места. Освободите память и повторите.");
  }

  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Нужно войти в мобильный аккаунт.");
  }

  return ownerUserId;
}

async function pickImages(source: "camera" | "library") {
  const permissionGranted = source === "camera" ? await ensureCameraPermission() : await ensureLibraryPermission();
  if (!permissionGranted) {
    throw new Error(source === "camera" ? "Нет доступа к камере." : "Нет доступа к галерее.");
  }

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        mediaTypes: "images",
        quality: 0.55
      })
    : await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 0,
        mediaTypes: "images",
        quality: 0.55
      });

  return result.canceled ? null : result.assets;
}

async function pickVideo(source: "camera" | "library") {
  const permissionGranted = source === "camera" ? await ensureCameraPermission() : await ensureLibraryPermission();
  if (!permissionGranted) {
    throw new Error(source === "camera" ? "Нет доступа к камере." : "Нет доступа к галерее.");
  }

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: "videos",
        quality: 0.5,
        videoMaxDuration: 12
      })
    : await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: "videos",
        quality: 0.5
      });

  return result.canceled ? null : result.assets[0] ?? null;
}

async function ensureCameraPermission() {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await ImagePicker.requestCameraPermissionsAsync();
  return requested.granted;
}

async function ensureLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return requested.granted;
}

async function optimizePhoto(asset: ImagePicker.ImagePickerAsset) {
  return ImageManipulator.manipulateAsync(asset.uri, buildResizeActions(asset.width, asset.height), {
    compress: 0.55,
    format: ImageManipulator.SaveFormat.JPEG
  });
}

async function attachPointPhotoAssets(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  assets: ImagePicker.ImagePickerAsset[]
) {
  for (const asset of assets) {
    const optimizedPhoto = await optimizePhoto(asset);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      assignmentId,
      pointId
    });
    await attachPhotoToPoint(assignmentId, pointId, file);
  }
}

async function attachRemarkPhotoAssets(ownerUserId: string, remarkId: string, assets: ImagePicker.ImagePickerAsset[]) {
  for (const asset of assets) {
    const optimizedPhoto = await optimizePhoto(asset);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      remarkId
    });
    await attachMediaToShiftRemark(remarkId, file);
  }
}

async function preparePointVideo(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  asset: ImagePicker.ImagePickerAsset
) {
  const sizeBytes = await getValidatedVideoSize(asset);
  return prepareLocalMedia({
    ownerUserId,
    localPath: asset.uri,
    assignmentId,
    pointId,
    contentType: "video/mp4",
    mediaKind: "video",
    sizeBytes
  });
}

async function prepareRemarkVideo(ownerUserId: string, remarkId: string, asset: ImagePicker.ImagePickerAsset) {
  const sizeBytes = await getValidatedVideoSize(asset);
  return prepareLocalMedia({
    ownerUserId,
    localPath: asset.uri,
    remarkId,
    contentType: "video/mp4",
    mediaKind: "video",
    sizeBytes
  });
}

function buildResizeActions(width?: number, height?: number): ImageManipulator.Action[] {
  if (!width || !height || Math.max(width, height) <= maxPhotoSidePx) {
    return [];
  }

  return width >= height ? [{ resize: { width: maxPhotoSidePx } }] : [{ resize: { height: maxPhotoSidePx } }];
}

async function getValidatedVideoSize(asset: ImagePicker.ImagePickerAsset) {
  const info = asset.fileSize ? null : await getLocalFileInfo(asset.uri);
  const sizeBytes = asset.fileSize ?? (info?.exists ? info.size : null);
  if (sizeBytes && sizeBytes > maxVideoBytes) {
    throw new Error("Видео слишком большое. Выберите файл до 25 МБ.");
  }

  return sizeBytes ?? null;
}
