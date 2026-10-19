import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { logMobileError } from "@/services/mobileErrorReporter";
import { attachPhotoToPoint, restoreMissingPointAttachment } from "@/db/repositories/patrolRepository";
import { attachMediaToShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { attachMediaToWorkTask } from "@/db/repositories/workTaskRepository";
import { deletePreparedMedia, assertStorageForMedia, getLocalFileInfo, hasEnoughStorageForPhoto } from "@/services/fileStorageService";
import { MediaPreparationProgressCallback, prepareLocalMedia, prepareLocalPhoto } from "@/sync/fileUploadQueue";
import { MAX_VIDEO_BYTES } from "@/domain/files/fileUploadLimits";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";

const maxPhotoSidePx = 1600;

export type MediaAttachResult = "attached" | "cancelled";

export type MediaAttachSummary = {
  status: MediaAttachResult;
  attachedCount: number;
  photoCount: number;
  videoCount: number;
  errors: string[];
};

export async function attachPointPhotoFromCamera(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const assets = await pickImages("camera");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, assets, onProgress, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachPointPhotoFromGallery(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const assets = await pickImages("library");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, assets, onProgress, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function restoreMissingPointPhotoFromCamera(assignmentId: string, pointId: string, missingClientFileId: string) {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const assets = await pickImages("camera");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await restorePointPhotoAsset(ownerUserId, assignmentId, pointId, missingClientFileId, assets[0], scope);
  requestSyncAfterMutation();
  return "attached" satisfies MediaAttachResult;
}

export async function restoreMissingPointPhotoFromGallery(assignmentId: string, pointId: string, missingClientFileId: string) {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const assets = await pickImages("library");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await restorePointPhotoAsset(ownerUserId, assignmentId, pointId, missingClientFileId, assets[0], scope);
  requestSyncAfterMutation();
  return "attached" satisfies MediaAttachResult;
}
export async function attachPointVideoFromCamera(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const asset = await pickVideo("camera");
  await assertDataOwnerContext(scope);
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset, onProgress);
  await assertDataOwnerContext(scope);
  await attachPhotoToPoint(assignmentId, pointId, file, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachPointVideoFromGallery(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const asset = await pickVideo("library");
  await assertDataOwnerContext(scope);
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset, onProgress);
  await assertDataOwnerContext(scope);
  await attachPhotoToPoint(assignmentId, pointId, file, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachPointMediaFromGallery(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback): Promise<MediaAttachSummary> {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const assets = await pickMixedMediaFromGallery();
  await assertDataOwnerContext(scope);
  return attachMixedMediaAssets(assets, async (asset, index, count) => {
    const progress: MediaPreparationProgressCallback = value => onProgress?.({ ...value, fileIndex: index + 1, fileCount: count, progress: (index + value.progress * 0.9) / count });
    progress({ processedBytes: 0, totalBytes: 0, progress: 0 });
    if (isVideoAsset(asset)) {
      const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset, progress);
      await assertDataOwnerContext(scope);
      await attachPhotoToPoint(assignmentId, pointId, file, scope);
      onProgress?.({ processedBytes: 0, totalBytes: 0, fileIndex: index + 1, fileCount: count, progress: (index + 1) / count });
      return "video";
    }

    await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, [asset], progress, scope);
    onProgress?.({ processedBytes: 0, totalBytes: 0, fileIndex: index + 1, fileCount: count, progress: (index + 1) / count });
    return "photo";
  }, () => assertDataOwnerContext(scope));
}

export async function attachRemarkPhotoFromCamera(remarkId: string) {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const assets = await pickImages("camera");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachRemarkPhotoAssets(ownerUserId, remarkId, assets, undefined, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkPhotoFromGallery(remarkId: string) {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const assets = await pickImages("library");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachRemarkPhotoAssets(ownerUserId, remarkId, assets, undefined, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkVideoFromCamera(remarkId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const asset = await pickVideo("camera");
  await assertDataOwnerContext(scope);
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await prepareRemarkVideo(ownerUserId, remarkId, asset, onProgress);
  await attachMediaToShiftRemark(remarkId, file, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkVideoFromGallery(remarkId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const asset = await pickVideo("library");
  await assertDataOwnerContext(scope);
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await prepareRemarkVideo(ownerUserId, remarkId, asset, onProgress);
  await attachMediaToShiftRemark(remarkId, file, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkMediaFromGallery(remarkId: string, onProgress?: MediaPreparationProgressCallback): Promise<MediaAttachSummary> {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const assets = await pickMixedMediaFromGallery();
  await assertDataOwnerContext(scope);
  const summary = await attachMixedMediaAssets(assets, async (asset) => {
    if (isVideoAsset(asset)) {
      const file = await prepareRemarkVideo(ownerUserId, remarkId, asset, onProgress);
      await attachMediaToShiftRemark(remarkId, file, scope);
      return "video";
    }

    await attachRemarkPhotoAssets(ownerUserId, remarkId, [asset], onProgress, scope);
    return "photo";
  }, () => assertDataOwnerContext(scope));
  return summary;
}

export async function attachWorkPhotoFromCamera(workTaskId: string) {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const assets = await pickImages("camera");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachWorkPhotoAssets(ownerUserId, workTaskId, assets, undefined, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachWorkVideoFromCamera(workTaskId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const asset = await pickVideo("camera");
  await assertDataOwnerContext(scope);
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await prepareWorkVideo(ownerUserId, workTaskId, asset, onProgress);
  await attachMediaToWorkTask(workTaskId, file, scope);
  return "attached" satisfies MediaAttachResult;
}

export async function attachWorkMediaFromGallery(workTaskId: string, onProgress?: MediaPreparationProgressCallback): Promise<MediaAttachSummary> {
  const scope = await captureDataOwnerContext();
  await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const assets = await pickMixedMediaFromGallery();
  await assertDataOwnerContext(scope);
  const summary = await attachMixedMediaAssets(assets, async (asset) => {
    if (isVideoAsset(asset)) {
      const file = await prepareWorkVideo(ownerUserId, workTaskId, asset, onProgress);
      await attachMediaToWorkTask(workTaskId, file, scope);
      return "video";
    }

    await attachWorkPhotoAssets(ownerUserId, workTaskId, [asset], onProgress, scope);
    return "photo";
  }, () => assertDataOwnerContext(scope));
  return summary;
}

async function attachMixedMediaAssets(
  assets: ImagePicker.ImagePickerAsset[] | null,
  attachAsset: (asset: ImagePicker.ImagePickerAsset, index: number, count: number) => Promise<"photo" | "video">,
  assertActive?: () => Promise<void>
): Promise<MediaAttachSummary> {
  if (!assets?.length) {
    return { status: "cancelled", attachedCount: 0, photoCount: 0, videoCount: 0, errors: [] };
  }

  let photoCount = 0;
  let videoCount = 0;
  const errors: string[] = [];

  for (const [index, asset] of assets.entries()) {
    await assertActive?.();
    try {
      const kind = await attachAsset(asset, index, assets.length);
      if (kind === "video") {
        videoCount += 1;
      } else {
        photoCount += 1;
      }
    } catch (error) {
      await assertActive?.();
      errors.push(`Файл ${index + 1}: ${error instanceof Error ? error.message : "не удалось подготовить"}`);
    }
  }

  const attachedCount = photoCount + videoCount;
  return {
    status: attachedCount > 0 ? "attached" : "cancelled",
    attachedCount,
    photoCount,
    videoCount,
    errors
  };
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

  if (source === "camera") {
    await assertStorageForMedia(MAX_VIDEO_BYTES);
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

async function pickMixedMediaFromGallery() {
  if (!(await ensureLibraryPermission())) {
    throw new Error("Нет доступа к галерее.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: 0,
    mediaTypes: ["images", "videos"],
    quality: 0.55
  });

  return result.canceled ? null : result.assets;
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
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: MediaPreparationProgressCallback,
  scope?: DataOwnerContext
) {
  for (const asset of assets) {
    if (scope) await assertDataOwnerContext(scope);
    const optimizedPhoto = await optimizePhoto(asset);
    if (scope) await assertDataOwnerContext(scope);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      assignmentId,
      pointId,
      onProgress
    });
    if (scope) await assertDataOwnerContext(scope);
    await attachPhotoToPoint(assignmentId, pointId, file, scope);
  }
}

async function restorePointPhotoAsset(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  missingClientFileId: string,
  asset: ImagePicker.ImagePickerAsset,
  scope?: DataOwnerContext
) {
  const optimizedPhoto = await optimizePhoto(asset);
  const file = await prepareLocalPhoto({
    ownerUserId,
    localPath: optimizedPhoto.uri,
    assignmentId,
    pointId
  });
  try {
    if (scope) await assertDataOwnerContext(scope);
    await restoreMissingPointAttachment(assignmentId, pointId, missingClientFileId, file, scope);
  } catch (error) {
    await deletePreparedMedia(file.localPath).catch((cleanupError) => {
      void logMobileError("media.repair.cleanup.failed", cleanupError);
    });
    throw error;
  }
}
async function attachRemarkPhotoAssets(ownerUserId: string, remarkId: string, assets: ImagePicker.ImagePickerAsset[], onProgress?: MediaPreparationProgressCallback, scope?: DataOwnerContext) {
  for (const asset of assets) {
    if (scope) await assertDataOwnerContext(scope);
    const optimizedPhoto = await optimizePhoto(asset);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      remarkId,
      onProgress
    });
    await attachMediaToShiftRemark(remarkId, file, scope);
  }
}

async function attachWorkPhotoAssets(ownerUserId: string, workTaskId: string, assets: ImagePicker.ImagePickerAsset[], onProgress?: MediaPreparationProgressCallback, scope?: DataOwnerContext) {
  for (const asset of assets) {
    if (scope) await assertDataOwnerContext(scope);
    const optimizedPhoto = await optimizePhoto(asset);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      workTaskId,
      onProgress
    });
    await attachMediaToWorkTask(workTaskId, file, scope);
  }
}

async function preparePointVideo(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: MediaPreparationProgressCallback
) {
  const sizeBytes = await getValidatedVideoSize(asset);
  return prepareLocalMedia({
    ownerUserId,
    localPath: asset.uri,
    assignmentId,
    pointId,
    contentType: "video/mp4",
    mediaKind: "video",
    sizeBytes,
    onProgress
  });
}

async function prepareRemarkVideo(ownerUserId: string, remarkId: string, asset: ImagePicker.ImagePickerAsset, onProgress?: MediaPreparationProgressCallback) {
  const sizeBytes = await getValidatedVideoSize(asset);
  return prepareLocalMedia({
    ownerUserId,
    localPath: asset.uri,
    remarkId,
    contentType: "video/mp4",
    mediaKind: "video",
    sizeBytes,
    onProgress
  });
}

async function prepareWorkVideo(ownerUserId: string, workTaskId: string, asset: ImagePicker.ImagePickerAsset, onProgress?: MediaPreparationProgressCallback) {
  const sizeBytes = await getValidatedVideoSize(asset);
  return prepareLocalMedia({
    ownerUserId,
    localPath: asset.uri,
    workTaskId,
    contentType: "video/mp4",
    mediaKind: "video",
    sizeBytes,
    onProgress
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
  if (sizeBytes && sizeBytes > MAX_VIDEO_BYTES) {
    throw new Error("Видео слишком большое. Выберите файл до 25 МБ.");
  }

  await assertStorageForMedia(sizeBytes ?? MAX_VIDEO_BYTES);

  return sizeBytes ?? null;
}

function isVideoAsset(asset: ImagePicker.ImagePickerAsset) {
  return asset.type === "video" || asset.mimeType?.toLowerCase().startsWith("video/") === true;
}
