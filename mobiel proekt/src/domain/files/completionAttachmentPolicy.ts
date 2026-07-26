import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from './fileUploadLimits';

export { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES };

type CompletionAttachmentFile = {
  clientFileId: string;
  ownerUserId: string;
  contourId?: string | null;
  localPath: string;
  status: string;
  sha256?: string | null;
  sizeBytes?: number | null;
  contentType?: "image/jpeg" | "video/mp4" | null;
  mediaKind?: "photo" | "video" | null;
  assignmentId?: string | null;
  pointId?: string | null;
};

type PhysicalFileInfo = {
  exists: boolean;
  size?: number;
};

type CompletionAttachmentContext = {
  ownerUserId: string;
  contourId: string;
  assignmentId: string;
  pointId: string;
  requiredPhoto: boolean;
};

export function getCompletionAttachmentFailure(
  file: CompletionAttachmentFile | null | undefined,
  physicalFile: PhysicalFileInfo | null | undefined,
  context: CompletionAttachmentContext
) {
  if (!file) {
    return "local file record is missing";
  }
  if (file.ownerUserId !== context.ownerUserId) {
    return "local file belongs to another user";
  }
  if (file.contourId !== context.contourId) {
    return "local file belongs to another contour";
  }
  if (file.assignmentId !== context.assignmentId || file.pointId !== context.pointId) {
    return "local file is not linked to this assignment point";
  }
  if (file.status === "failed") {
    return "local file has failed status";
  }
  if (!physicalFile?.exists || typeof physicalFile.size !== "number" || physicalFile.size <= 0) {
    return "local file is missing or empty on device";
  }
  if (typeof file.sizeBytes !== "number" || file.sizeBytes <= 0) {
    return "local file size is missing or empty";
  }

  const isVideo = file.mediaKind === "video" || file.contentType === "video/mp4";
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  if (file.sizeBytes > maxBytes || physicalFile.size > maxBytes) {
    return isVideo ? "video exceeds the 30 MB limit" : "photo exceeds the 6 MB limit";
  }
  if (!file.sha256?.trim()) {
    return "local file SHA-256 is missing";
  }
  if (
    (file.mediaKind === "photo" && file.contentType !== "image/jpeg")
    || (file.mediaKind === "video" && file.contentType !== "video/mp4")
    || (!file.mediaKind && file.contentType !== "image/jpeg" && file.contentType !== "video/mp4")
  ) {
    return "local file media type is invalid";
  }
  if (context.requiredPhoto && file.mediaKind !== "photo") {
    return "required evidence must be a photo";
  }

  return null;
}