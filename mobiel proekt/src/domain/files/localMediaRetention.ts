import type { LocalMobileFile } from "./fileTypes";

export const LOCAL_MEDIA_RETENTION_DAYS = 7;
const localMediaRetentionMs = LOCAL_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function canReclaimLocalMedia(
  file: Pick<LocalMobileFile, "status" | "linkedAt">,
  now = Date.now()
) {
  if (file.status !== "linked" || !file.linkedAt) {
    return false;
  }

  const linkedAt = Date.parse(file.linkedAt);
  return Number.isFinite(linkedAt) && linkedAt <= now - localMediaRetentionMs;
}