export type PhotoEvidenceStatus = "pending" | "scanned" | "ok" | "issue" | "deferred" | "skipped" | null;

export function isPhotoEvidenceRequired(_requiresPhoto: boolean, _status: PhotoEvidenceStatus) {
  // Photos are voluntary, including offline assignments with a legacy true flag.
  return false;
}
