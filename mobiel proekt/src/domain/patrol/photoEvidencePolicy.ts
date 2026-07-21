export type PhotoEvidenceStatus = "pending" | "scanned" | "ok" | "issue" | "deferred" | "skipped" | null;

export function isPhotoEvidenceRequired(requiresPhoto: boolean, status: PhotoEvidenceStatus) {
  return requiresPhoto && (status === "issue" || status === "skipped");
}
