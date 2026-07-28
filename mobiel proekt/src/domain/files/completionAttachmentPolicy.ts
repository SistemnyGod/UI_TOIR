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
    return "Запись вложения не найдена на телефоне";
  }
  if (file.ownerUserId !== context.ownerUserId) {
    return "Вложение принадлежит другому пользователю";
  }
  if (file.contourId !== context.contourId) {
    return "Вложение относится к другому серверному контуру";
  }
  if (file.assignmentId !== context.assignmentId || file.pointId !== context.pointId) {
    return "Вложение не связано с этой точкой обхода";
  }
  if (file.status === "failed") {
    return "Вложение повреждено или ранее не прошло проверку";
  }
  if (!physicalFile?.exists || typeof physicalFile.size !== "number" || physicalFile.size <= 0) {
    return "Файл вложения отсутствует или пуст на телефоне";
  }
  if (typeof file.sizeBytes !== "number" || file.sizeBytes <= 0) {
    return "Не удалось определить размер вложения";
  }

  const isVideo = file.mediaKind === "video" || file.contentType === "video/mp4";
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  if (file.sizeBytes > maxBytes || physicalFile.size > maxBytes) {
    return isVideo ? "Видео превышает допустимый размер 30 МБ" : "Фото превышает допустимый размер 6 МБ";
  }
  if (!file.sha256?.trim()) {
    return "У вложения отсутствует контрольная сумма";
  }
  if (
    (file.mediaKind === "photo" && file.contentType !== "image/jpeg")
    || (file.mediaKind === "video" && file.contentType !== "video/mp4")
    || (!file.mediaKind && file.contentType !== "image/jpeg" && file.contentType !== "video/mp4")
  ) {
    return "Формат вложения не поддерживается";
  }
  if (context.requiredPhoto && file.mediaKind !== "photo") {
    return "Для этой точки требуется именно фотография";
  }

  return null;
}