import type { PatrolPointResultDto } from "./patrolTypes.ts";
import { isPhotoEvidenceRequired } from "./photoEvidencePolicy.ts";

export function canSubmitPointResult(result: PatrolPointResultDto, photoRequired: boolean) {
  if (!["ok", "issue", "skipped"].includes(result.status)) {
    return false;
  }

  if (result.status === "issue" && !result.comment?.trim()) {
    return false;
  }

  if (result.status === "issue" && !result.issueTypeId?.trim()) {
    return false;
  }

  if (result.status === "skipped" && !result.comment?.trim()) {
    return false;
  }

  if (isPhotoEvidenceRequired(photoRequired, result.status) && result.photoClientFileIds.length === 0) {
    return false;
  }

  return true;
}
