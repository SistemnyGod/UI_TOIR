import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from "@/auth/dataOwnerContext";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { logMobileError } from "@/services/mobileErrorReporter";
import { attachPhotoToPoint, deletePointAttachment, replacePointAttachment, restoreMissingPointAttachment } from "@/db/repositories/patrolRepository";
import { attachMediaToShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { attachMediaToWorkTask } from "@/db/repositories/workTaskRepository";
import { deletePreparedMedia, deleteOwnedTemporaryMedia, assertStorageForMedia, getLocalFileInfo, hasEnoughStorageForPhoto, isManagedMediaUri } from "@/services/fileStorageService";
import { MediaPreparationProgressCallback, prepareLocalMedia, prepareLocalPhoto } from "@/sync/fileUploadQueue";
import { MAX_VIDEO_BYTES, MAX_VIDEO_CAPTURE_SECONDS, videoTooLargeMessage } from "@/domain/files/fileUploadLimits";
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
export type PhotoSeriesResult = { attachedCount: number; error: string | null };

/** Upper bound for one series, so a misbehaving camera result can never loop forever. */
export const maxPhotoSeriesLength = 20;

/**
 * Take photos one after another: the camera reopens after each saved photo
 * until the employee closes it. Every photo is committed before the next shot,
 * so a later failure keeps the photos already taken.
 */
export async function attachPointPhotoSeriesFromCamera(
  assignmentId: string,
  pointId: string,
  options: { shouldContinue?: () => boolean; onPhotoAttached?: (attachedCount: number) => Promise<void> | void; onProgress?: MediaPreparationProgressCallback } = {}
): Promise<PhotoSeriesResult> {
  let attachedCount = 0;
  while (attachedCount < maxPhotoSeriesLength && (options.shouldContinue?.() ?? true)) {
    let result: MediaAttachResult;
    try {
      result = await attachPointPhotoFromCamera(assignmentId, pointId, options.onProgress);
    } catch (error) {
      if (attachedCount === 0) throw error;
      return { attachedCount, error: error instanceof Error ? error.message : "Не удалось добавить фото." };
    }
    if (result !== "attached") break;
    attachedCount += 1;
    await options.onPhotoAttached?.(attachedCount);
  }
  return { attachedCount, error: null };
}

/** Delete an unsent point attachment: the files row first, then its managed copy. */
export async function deletePointAttachmentFile(assignmentId: string, pointId: string, clientFileId: string) {
  const scope = await captureDataOwnerContext();
  const { removedLocalPath } = await deletePointAttachment(assignmentId, pointId, clientFileId, scope);
  await deleteManagedCopy(removedLocalPath);
}

/** Replace an unsent point attachment with a new camera photo in the same position. */
export async function replacePointPhotoFromCamera(assignmentId: string, pointId: string, clientFileId: string, onProgress?: MediaPreparationProgressCallback) {
  const scope = await captureDataOwnerContext();
  const ownerUserId = await prepareOwnerAndStorage();
  await assertDataOwnerContext(scope);
  const assets = await pickImages("camera");
  await assertDataOwnerContext(scope);
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  const file = await preparePhotoAsset(assets[0], { ownerUserId, assignmentId, pointId, onProgress }, scope);
  let removedLocalPath: string | null;
  try {
    await assertDataOwnerContext(scope);
    ({ removedLocalPath } = await replacePointAttachment(assignmentId, pointId, clientFileId, file, scope));
  } catch (error) {
    await deletePreparedMedia(file.localPath).catch((cleanupError) => {
      void logMobileError("media.replace.cleanup.failed", cleanupError);
    });
    throw error;
  } finally {
    await deleteOwnedTemporaryMedia(...assets.map(asset => asset.uri));
  }
  await deleteManagedCopy(removedLocalPath);
  requestSyncAfterMutation();
  return "attached" satisfies MediaAttachResult;
}

/** The row is already gone; a leftover copy is reclaimed later by orphan cleanup. */
async function deleteManagedCopy(localPath: string | null) {
  if (!isManagedMediaUri(localPath)) return;
  await deletePreparedMedia(localPath).catch((error) => {
    void logMobileError("media.delete.cleanup.failed", error);
  });
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

  try {
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
  } finally {
    await deleteOwnedTemporaryMedia(...assets.map(asset => asset.uri));
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
        videoMaxDuration: MAX_VIDEO_CAPTURE_SECONDS
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

/**
 * Resize a picked photo and copy it into managed storage. The picker/camera
 * file and the resized copy are app-cache temporaries: both are deleted once
 * the managed copy exists (or preparation failed), so they never accumulate.
 */
async function preparePhotoAsset(
  asset: ImagePicker.ImagePickerAsset,
  input: Omit<Parameters<typeof prepareLocalPhoto>[0], "localPath">,
  scope?: DataOwnerContext
) {
  let optimizedUri: string | null = null;
  try {
    const optimizedPhoto = await optimizePhoto(asset);
    optimizedUri = optimizedPhoto.uri;
    if (scope) await assertDataOwnerContext(scope);
    return await prepareLocalPhoto({ ...input, localPath: optimizedPhoto.uri });
  } finally {
    await deleteOwnedTemporaryMedia(asset.uri, optimizedUri);
  }
}

async function attachPhotoAssets(
  assets: ImagePicker.ImagePickerAsset[],
  attachOne: (asset: ImagePicker.ImagePickerAsset) => Promise<void>
) {
  try {
    for (const asset of assets) await attachOne(asset);
  } finally {
    // Assets after a failure were never prepared; their temporaries go too.
    await deleteOwnedTemporaryMedia(...assets.map(asset => asset.uri));
  }
}

async function attachPointPhotoAssets(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: MediaPreparationProgressCallback,
  scope?: DataOwnerContext
) {
  await attachPhotoAssets(assets, async asset => {
    if (scope) await assertDataOwnerContext(scope);
    const file = await preparePhotoAsset(asset, { ownerUserId, assignmentId, pointId, onProgress }, scope);
    if (scope) await assertDataOwnerContext(scope);
    await attachPhotoToPoint(assignmentId, pointId, file, scope);
  });
}

async function restorePointPhotoAsset(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  missingClientFileId: string,
  asset: ImagePicker.ImagePickerAsset,
  scope?: DataOwnerContext
) {
  const file = await preparePhotoAsset(asset, { ownerUserId, assignmentId, pointId });
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
  await attachPhotoAssets(assets, async asset => {
    if (scope) await assertDataOwnerContext(scope);
    const file = await preparePhotoAsset(asset, { ownerUserId, remarkId, onProgress });
    await attachMediaToShiftRemark(remarkId, file, scope);
  });
}

async function attachWorkPhotoAssets(ownerUserId: string, workTaskId: string, assets: ImagePicker.ImagePickerAsset[], onProgress?: MediaPreparationProgressCallback, scope?: DataOwnerContext) {
  await attachPhotoAssets(assets, async asset => {
    if (scope) await assertDataOwnerContext(scope);
    const file = await preparePhotoAsset(asset, { ownerUserId, workTaskId, onProgress });
    await attachMediaToWorkTask(workTaskId, file, scope);
  });
}

async function preparePointVideo(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: MediaPreparationProgressCallback
) {
  try {
    const sizeBytes = await getValidatedVideoSize(asset);
    return await prepareLocalMedia({
      ownerUserId,
      localPath: asset.uri,
      assignmentId,
      pointId,
      contentType: "video/mp4",
      mediaKind: "video",
      sizeBytes,
      onProgress
    });
  } finally {
    await deleteOwnedTemporaryMedia(asset.uri);
  }
}

async function prepareRemarkVideo(ownerUserId: string, remarkId: string, asset: ImagePicker.ImagePickerAsset, onProgress?: MediaPreparationProgressCallback) {
  try {
    const sizeBytes = await getValidatedVideoSize(asset);
    return await prepareLocalMedia({
      ownerUserId,
      localPath: asset.uri,
      remarkId,
      contentType: "video/mp4",
      mediaKind: "video",
      sizeBytes,
      onProgress
    });
  } finally {
    await deleteOwnedTemporaryMedia(asset.uri);
  }
}

async function prepareWorkVideo(ownerUserId: string, workTaskId: string, asset: ImagePicker.ImagePickerAsset, onProgress?: MediaPreparationProgressCallback) {
  try {
    const sizeBytes = await getValidatedVideoSize(asset);
    return await prepareLocalMedia({
      ownerUserId,
      localPath: asset.uri,
      workTaskId,
      contentType: "video/mp4",
      mediaKind: "video",
      sizeBytes,
      onProgress
    });
  } finally {
    await deleteOwnedTemporaryMedia(asset.uri);
  }
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
    throw new Error(videoTooLargeMessage);
  }

  await assertStorageForMedia(sizeBytes ?? MAX_VIDEO_BYTES);

  return sizeBytes ?? null;
}

function isVideoAsset(asset: ImagePicker.ImagePickerAsset) {
  return asset.type === "video" || asset.mimeType?.toLowerCase().startsWith("video/") === true;
}
