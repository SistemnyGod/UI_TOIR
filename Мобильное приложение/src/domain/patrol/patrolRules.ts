import type { PatrolPointResultDto } from "./patrolTypes.ts";
import { isPhotoEvidenceRequired } from "./photoEvidencePolicy.ts";

export function canSubmitPointResult(result: PatrolPointResultDto, photoRequired: boolean) {
  if (result.status === "deferred" || result.status === "pending") {
    return false;
  }

  if (result.status === "issue" && !result.comment?.trim()) {
    return false;
  }

  if (isPhotoEvidenceRequired(photoRequired, result.status) && result.photoClientFileIds.length === 0) {
    return false;
  }

  return true;
}
