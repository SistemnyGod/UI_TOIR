import * as Crypto from "expo-crypto";

import { LocalMobileFile } from "@/domain/files/fileTypes";
import { getLocalFileInfo, persistMobileMedia, persistPatrolPhoto, readFileAsBase64 } from "@/services/fileStorageService";

type RegisterLocalPhotoInput = {
  ownerUserId: string;
  localPath: string;
  previewPath?: string | null;
  assignmentId?: string | null;
  pointId?: string | null;
  remarkId?: string | null;
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
  const base64 = await readFileAsBase64(localPath);
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);

  return {
    clientFileId,
    ownerUserId: input.ownerUserId,
    localPath,
    previewPath: input.previewPath ?? null,
    status: "localOnly",
    sha256: input.sha256 ?? sha256,
    sizeBytes: input.sizeBytes ?? (info.exists ? info.size : null),
    contentType: input.contentType,
    mediaKind: input.mediaKind,
    assignmentId: input.assignmentId ?? null,
    pointId: input.pointId ?? null,
    remarkId: input.remarkId ?? null,
    createdAtLocal: new Date().toISOString()
  } satisfies LocalMobileFile;
}
