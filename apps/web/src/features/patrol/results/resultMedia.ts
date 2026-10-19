import type { PatrolResultAttachment } from "../../../types";

export function isImageAttachment(attachment: PatrolResultAttachment) {
  return attachment.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.fileName ?? "");
}

export function isVideoAttachment(attachment: PatrolResultAttachment) {
  return attachment.contentType?.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(attachment.fileName ?? "");
}

export function attachmentKind(attachment: PatrolResultAttachment) {
  return isVideoAttachment(attachment) ? "Видео" : isImageAttachment(attachment) ? "Фото" : "Файл";
}

export function attachmentSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "Размер неизвестен";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} КБ`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`;
}
