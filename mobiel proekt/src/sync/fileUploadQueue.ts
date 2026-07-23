import * as Crypto from "expo-crypto";

import { LocalMobileFile } from "@/domain/files/fileTypes";
import { getLocalFileInfo, persistMobileMedia, persistPatrolPhoto, readFileAsBase64 } from "@/services/fileStorageService";
import { bytesToHex, decodeBase64Bytes, requiresClientFileHash } from "@/sync/fileHash";

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
  const clientFileId = Crypto.randomUUID();
  const localPath = input.mediaKind === "video"
    ? await persistMobileMedia(input.localPath, clientFileId, "mp4")
    : await persistPatrolPhoto(input.localPath, clientFileId);
  const info = await getLocalFileInfo(localPath);
  const sha256 = input.sha256 ?? (requiresClientFileHash(input)
    ? await calculateClientFileHash(localPath)
    : null);

  return {
    clientFileId,
    ownerUserId: input.ownerUserId,
    localPath,
    previewPath: input.previewPath ?? null,
    status: "localOnly",
    sha256,
    sizeBytes: input.sizeBytes ?? (info.exists ? info.size : null),
    contentType: input.contentType,
    mediaKind: input.mediaKind,
    assignmentId: input.assignmentId ?? null,
    pointId: input.pointId ?? null,
    remarkId: input.remarkId ?? null,
    workTaskId: input.workTaskId ?? null,
    createdAtLocal: new Date().toISOString()
  } satisfies LocalMobileFile;
}

async function calculateClientFileHash(localPath: string) {
  const base64 = await readFileAsBase64(localPath);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, decodeBase64Bytes(base64));
  return bytesToHex(digest);
}
