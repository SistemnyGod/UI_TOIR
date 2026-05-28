import { PatrolPointResultDto } from "@/domain/patrol/patrolTypes";

export function canSubmitPointResult(result: PatrolPointResultDto, photoRequired: boolean) {
  if (result.status === "deferred" || result.status === "pending") {
    return false;
  }

  if (result.status === "issue" && !result.comment?.trim()) {
    return false;
  }

  if (photoRequired && result.photoClientFileIds.length === 0) {
    return false;
  }

  return true;
}
