import * as Crypto from "expo-crypto";
import { File, FileMode } from "expo-file-system";

import { LocalMobileFile } from "@/domain/files/fileTypes";
import { getLocalFileInfo, persistMobileMedia, persistPatrolPhoto } from "@/services/fileStorageService";
import { SerializedTaskQueue } from "@/sync/serializedTaskQueue";
import { StreamingSha256 } from "@/sync/streamingSha256";

const hashChunkBytes = 64 * 1024;
const preparationQueue = new SerializedTaskQueue<LocalMobileFile>();

export type MediaPreparationProgress = {
  processedBytes: number;
  totalBytes: number;
  progress: number;
};

export type MediaPreparationProgressCallback = (progress: MediaPreparationProgress) => void;

type RegisterLocalPhotoInput = {
  ownerUserId: string;
  localPath: string;
  previewPath?: string | null;
  assignmentId?: string | null;
  pointId?: string | null;
  remarkId?: string | null;
  workTaskId?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  onProgress?: MediaPreparationProgressCallback;
};

export async function prepareLocalPhoto(input: RegisterLocalPhotoInput) {
  return prepareLocalMedia({
    ...input,
    contentType: "image/jpeg",
    mediaKind: "photo"
  });
}

type RegisterLocalMediaInput = RegisterLocalPhotoInput & {
  contentType: "image/jpeg" | "video/mp4";
  mediaKind: "photo" | "video";
};

export async function prepareLocalMedia(input: RegisterLocalMediaInput) {
  return preparationQueue.run(async () => {
    const clientFileId = Crypto.randomUUID();
    const localPath = input.mediaKind === "video"
      ? await persistMobileMedia(input.localPath, clientFileId, "mp4")
      : await persistPatrolPhoto(input.localPath, clientFileId);
    const info = await getLocalFileInfo(localPath);
    const sizeBytes = input.sizeBytes ?? (info.exists ? info.size : null) ?? 0;
    const sha256 = input.sha256 ?? await calculateClientFileHash(localPath, sizeBytes, input.onProgress);

    return {
      clientFileId,
      ownerUserId: input.ownerUserId,
      localPath,
      previewPath: input.previewPath ?? null,
      status: "localOnly",
      sha256,
      sizeBytes,
      contentType: input.contentType,
      mediaKind: input.mediaKind,
      assignmentId: input.assignmentId ?? null,
      pointId: input.pointId ?? null,
      remarkId: input.remarkId ?? null,
      workTaskId: input.workTaskId ?? null,
      createdAtLocal: new Date().toISOString()
    } satisfies LocalMobileFile;
  });
}

async function calculateClientFileHash(
  localPath: string,
  totalBytes: number,
  onProgress?: MediaPreparationProgressCallback
) {
  const file = new File(localPath);
  const handle = file.open(FileMode.ReadOnly);
  const effectiveTotalBytes = totalBytes > 0 ? totalBytes : handle.size ?? file.size ?? 0;
  const hasher = new StreamingSha256();
  let processedBytes = 0;
  onProgress?.({ processedBytes, totalBytes: effectiveTotalBytes, progress: effectiveTotalBytes > 0 ? 0 : 1 });

  try {
    if (effectiveTotalBytes <= 0) {
      throw new Error("��������� ���� ��� ��� ������ �� ������� ����������.");
    }

    while (processedBytes < effectiveTotalBytes) {
      const bytesToRead = Math.min(hashChunkBytes, effectiveTotalBytes - processedBytes);
      const chunk = handle.readBytes(bytesToRead);
      if (chunk.byteLength === 0) {
        break;
      }

      hasher.update(chunk);
      processedBytes += chunk.byteLength;
      onProgress?.({
        processedBytes,
        totalBytes,
        progress: totalBytes > 0 ? Math.min(1, processedBytes / totalBytes) : 1
      });
      if (processedBytes % (hashChunkBytes * 8) === 0) {
        await yieldToEventLoop();
      }
    }

    if (processedBytes !== effectiveTotalBytes) {
      throw new Error("Не удалось полностью прочитать медиафайл для проверки SHA-256.");
    }

    return hasher.digestHex();
  } finally {
    handle.close();
  }
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
