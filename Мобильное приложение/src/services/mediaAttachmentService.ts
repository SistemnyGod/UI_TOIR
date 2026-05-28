import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { attachPhotoToPoint } from "@/db/repositories/patrolRepository";
import { attachMediaToShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { hasEnoughStorageForPhoto } from "@/services/fileStorageService";
import { prepareLocalMedia, prepareLocalPhoto } from "@/sync/fileUploadQueue";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";

const maxPhotoSidePx = 1600;
const maxVideoBytes = 25 * 1024 * 1024;

export type MediaAttachResult = "attached" | "cancelled";

export async function attachPointPhotoFromCamera(assignmentId: string, pointId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickImage("camera");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const optimizedPhoto = await optimizePhoto(asset);
  const file = await prepareLocalPhoto({
    ownerUserId,
    localPath: optimizedPhoto.uri,
    assignmentId,
    pointId
  });
  await attachPhotoToPoint(assignmentId, pointId, file);

  return "attached" satisfies MediaAttachResult;
}

export async function attachPointPhotoFromGallery(assignmentId: string, pointId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickImage("library");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const optimizedPhoto = await optimizePhoto(asset);
  const file = await prepareLocalPhoto({
    ownerUserId,
    localPath: optimizedPhoto.uri,
    assignmentId,
    pointId
  });
  await attachPhotoToPoint(assignmentId, pointId, file);

  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkPhotoFromCamera(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickImage("camera");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const optimizedPhoto = await optimizePhoto(asset);
  const file = await prepareLocalPhoto({
    ownerUserId,
    localPath: optimizedPhoto.uri,
    remarkId
  });
  await attachMediaToShiftRemark(remarkId, file);
  triggerForegroundSyncWithRetry();

  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkPhotoFromGallery(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickImage("library");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  const optimizedPhoto = await optimizePhoto(asset);
  const file = await prepareLocalPhoto({
    ownerUserId,
    localPath: optimizedPhoto.uri,
    remarkId
  });
  await attachMediaToShiftRemark(remarkId, file);
  triggerForegroundSyncWithRetry();

  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkVideoFromCamera(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("camera");
  if (!asset) {
    return "cancelled" satisfies MediaAttachResult;
  }

  await assertVideoSize(asset);
  const file = await prepareLocalMedia({
    ownerUserId,
    localPath: asset.uri,
    remarkId,
    contentType: "video/mp4",
    mediaKind: "video",
    sizeBytes: asset.fileSize ?? null
  });
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

  await assertVideoSize(asset);
  const file = await prepareLocalMedia({
    ownerUserId,
    localPath: asset.uri,
    remarkId,
    contentType: "video/mp4",
    mediaKind: "video",
    sizeBytes: asset.fileSize ?? null
  });
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

async function pickImage(source: "camera" | "library") {
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
        allowsMultipleSelection: false,
        mediaTypes: "images",
        quality: 0.55
      });

  return result.canceled ? null : result.assets[0] ?? null;
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

function buildResizeActions(width?: number, height?: number): ImageManipulator.Action[] {
  if (!width || !height || Math.max(width, height) <= maxPhotoSidePx) {
    return [];
  }

  return width >= height ? [{ resize: { width: maxPhotoSidePx } }] : [{ resize: { height: maxPhotoSidePx } }];
}

async function assertVideoSize(asset: ImagePicker.ImagePickerAsset) {
  if (asset.fileSize && asset.fileSize > maxVideoBytes) {
    throw new Error("Видео слишком большое. Выберите файл до 25 МБ.");
  }
}
