import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { attachPhotoToPoint, restoreMissingPointAttachment } from "@/db/repositories/patrolRepository";
import { attachMediaToShiftRemark } from "@/db/repositories/shiftRemarkRepository";
import { attachMediaToWorkTask } from "@/db/repositories/workTaskRepository";
import { getLocalFileInfo, hasEnoughStorageForPhoto } from "@/services/fileStorageService";
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
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("camera");
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, assets, onProgress);
  return "attached" satisfies MediaAttachResult;
}

export async function attachPointPhotoFromGallery(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("library");
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, assets, onProgress);
  return "attached" satisfies MediaAttachResult;
}

export async function restoreMissingPointPhotoFromCamera(assignmentId: string, pointId: string, missingClientFileId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("camera");
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await restorePointPhotoAsset(ownerUserId, assignmentId, pointId, missingClientFileId, assets[0]);
  requestSyncAfterMutation();
  return "attached" satisfies MediaAttachResult;
}

export async function restoreMissingPointPhotoFromGallery(assignmentId: string, pointId: string, missingClientFileId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("library");
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await restorePointPhotoAsset(ownerUserId, assignmentId, pointId, missingClientFileId, assets[0]);
  requestSyncAfterMutation();
  return "attached" satisfies MediaAttachResult;
}
export async function attachPointVideoFromCamera(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("camera");
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset, onProgress);
  await attachPhotoToPoint(assignmentId, pointId, file);
  return "attached" satisfies MediaAttachResult;
}

export async function attachPointVideoFromGallery(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("library");
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset, onProgress);
  await attachPhotoToPoint(assignmentId, pointId, file);
  return "attached" satisfies MediaAttachResult;
}

export async function attachPointMediaFromGallery(assignmentId: string, pointId: string, onProgress?: MediaPreparationProgressCallback): Promise<MediaAttachSummary> {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickMixedMediaFromGallery();
  return attachMixedMediaAssets(assets, async (asset) => {
    if (isVideoAsset(asset)) {
      const file = await preparePointVideo(ownerUserId, assignmentId, pointId, asset, onProgress);
      await attachPhotoToPoint(assignmentId, pointId, file);
      return "video";
    }

    await attachPointPhotoAssets(ownerUserId, assignmentId, pointId, [asset], onProgress);
    return "photo";
  });
}

export async function attachRemarkPhotoFromCamera(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("camera");
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachRemarkPhotoAssets(ownerUserId, remarkId, assets);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkPhotoFromGallery(remarkId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("library");
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachRemarkPhotoAssets(ownerUserId, remarkId, assets);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkVideoFromCamera(remarkId: string, onProgress?: MediaPreparationProgressCallback) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("camera");
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await prepareRemarkVideo(ownerUserId, remarkId, asset, onProgress);
  await attachMediaToShiftRemark(remarkId, file);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkVideoFromGallery(remarkId: string, onProgress?: MediaPreparationProgressCallback) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("library");
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await prepareRemarkVideo(ownerUserId, remarkId, asset, onProgress);
  await attachMediaToShiftRemark(remarkId, file);
  return "attached" satisfies MediaAttachResult;
}

export async function attachRemarkMediaFromGallery(remarkId: string, onProgress?: MediaPreparationProgressCallback): Promise<MediaAttachSummary> {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickMixedMediaFromGallery();
  const summary = await attachMixedMediaAssets(assets, async (asset) => {
    if (isVideoAsset(asset)) {
      const file = await prepareRemarkVideo(ownerUserId, remarkId, asset, onProgress);
      await attachMediaToShiftRemark(remarkId, file);
      return "video";
    }

    await attachRemarkPhotoAssets(ownerUserId, remarkId, [asset], onProgress);
    return "photo";
  });

  if (summary.attachedCount > 0) {
  }
  return summary;
}

export async function attachWorkPhotoFromCamera(workTaskId: string) {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickImages("camera");
  if (!assets?.length) return "cancelled" satisfies MediaAttachResult;

  await attachWorkPhotoAssets(ownerUserId, workTaskId, assets);
  return "attached" satisfies MediaAttachResult;
}

export async function attachWorkVideoFromCamera(workTaskId: string, onProgress?: MediaPreparationProgressCallback) {
  const ownerUserId = await prepareOwnerAndStorage();
  const asset = await pickVideo("camera");
  if (!asset) return "cancelled" satisfies MediaAttachResult;

  const file = await prepareWorkVideo(ownerUserId, workTaskId, asset, onProgress);
  await attachMediaToWorkTask(workTaskId, file);
  return "attached" satisfies MediaAttachResult;
}

export async function attachWorkMediaFromGallery(workTaskId: string, onProgress?: MediaPreparationProgressCallback): Promise<MediaAttachSummary> {
  const ownerUserId = await prepareOwnerAndStorage();
  const assets = await pickMixedMediaFromGallery();
  const summary = await attachMixedMediaAssets(assets, async (asset) => {
    if (isVideoAsset(asset)) {
      const file = await prepareWorkVideo(ownerUserId, workTaskId, asset, onProgress);
      await attachMediaToWorkTask(workTaskId, file);
      return "video";
    }

    await attachWorkPhotoAssets(ownerUserId, workTaskId, [asset], onProgress);
    return "photo";
  });

  if (summary.attachedCount > 0) {
  }
  return summary;
}

async function attachMixedMediaAssets(
  assets: ImagePicker.ImagePickerAsset[] | null,
  attachAsset: (asset: ImagePicker.ImagePickerAsset) => Promise<"photo" | "video">
): Promise<MediaAttachSummary> {
  if (!assets?.length) {
    return { status: "cancelled", attachedCount: 0, photoCount: 0, videoCount: 0, errors: [] };
  }

  let photoCount = 0;
  let videoCount = 0;
  const errors: string[] = [];

  for (const [index, asset] of assets.entries()) {
    try {
      const kind = await attachAsset(asset);
      if (kind === "video") {
        videoCount += 1;
      } else {
        photoCount += 1;
      }
    } catch (error) {
      errors.push(`Р¤Р°Р№Р» ${index + 1}: ${error instanceof Error ? error.message : "РЅРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ"}`);
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
    throw new Error("РќР° С‚РµР»РµС„РѕРЅРµ РјР°Р»Рѕ СЃРІРѕР±РѕРґРЅРѕРіРѕ РјРµСЃС‚Р°. РћСЃРІРѕР±РѕРґРёС‚Рµ РїР°РјСЏС‚СЊ Рё РїРѕРІС‚РѕСЂРёС‚Рµ.");
  }

  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("РќСѓР¶РЅРѕ РІРѕР№С‚Рё РІ РјРѕР±РёР»СЊРЅС‹Р№ Р°РєРєР°СѓРЅС‚.");
  }

  return ownerUserId;
}

async function pickImages(source: "camera" | "library") {
  const permissionGranted = source === "camera" ? await ensureCameraPermission() : await ensureLibraryPermission();
  if (!permissionGranted) {
    throw new Error(source === "camera" ? "РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РєР°РјРµСЂРµ." : "РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РіР°Р»РµСЂРµРµ.");
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
    throw new Error(source === "camera" ? "РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РєР°РјРµСЂРµ." : "РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РіР°Р»РµСЂРµРµ.");
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
    throw new Error("РќРµС‚ РґРѕСЃС‚СѓРїР° Рє РіР°Р»РµСЂРµРµ.");
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
  onProgress?: MediaPreparationProgressCallback
) {
  for (const asset of assets) {
    const optimizedPhoto = await optimizePhoto(asset);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      assignmentId,
      pointId,
      onProgress
    });
    await attachPhotoToPoint(assignmentId, pointId, file);
  }
}

async function restorePointPhotoAsset(
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  missingClientFileId: string,
  asset: ImagePicker.ImagePickerAsset
) {
  const optimizedPhoto = await optimizePhoto(asset);
  const file = await prepareLocalPhoto({
    ownerUserId,
    localPath: optimizedPhoto.uri,
    assignmentId,
    pointId
  });
  await restoreMissingPointAttachment(assignmentId, pointId, missingClientFileId, file);
}
async function attachRemarkPhotoAssets(ownerUserId: string, remarkId: string, assets: ImagePicker.ImagePickerAsset[], onProgress?: MediaPreparationProgressCallback) {
  for (const asset of assets) {
    const optimizedPhoto = await optimizePhoto(asset);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      remarkId,
      onProgress
    });
    await attachMediaToShiftRemark(remarkId, file);
  }
}

async function attachWorkPhotoAssets(ownerUserId: string, workTaskId: string, assets: ImagePicker.ImagePickerAsset[], onProgress?: MediaPreparationProgressCallback) {
  for (const asset of assets) {
    const optimizedPhoto = await optimizePhoto(asset);
    const file = await prepareLocalPhoto({
      ownerUserId,
      localPath: optimizedPhoto.uri,
      workTaskId,
      onProgress
    });
    await attachMediaToWorkTask(workTaskId, file);
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
    throw new Error("Р’РёРґРµРѕ СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕРµ. Р’С‹Р±РµСЂРёС‚Рµ С„Р°Р№Р» РґРѕ 25 РњР‘.");
  }

  return sizeBytes ?? null;
}

function isVideoAsset(asset: ImagePicker.ImagePickerAsset) {
  return asset.type === "video" || asset.mimeType?.toLowerCase().startsWith("video/") === true;
}
