export const minimumFreeStorageBytes = 150 * 1024 * 1024;
export const lowStorageWarningBytes = 300 * 1024 * 1024;
export const maximumManagedMediaBytes = 512 * 1024 * 1024;

export type LocalMediaStorageStatus = "ready" | "warning" | "insufficientFreeSpace" | "managedQuotaExceeded";

export type LocalMediaStorageAssessment = {
  status: LocalMediaStorageStatus;
  canPersist: boolean;
  freeBytes: number;
  managedBytes: number;
  requiredBytes: number;
};

export function assessLocalMediaStorage(
  freeBytes: number,
  managedBytes: number,
  requiredBytes = 0
): LocalMediaStorageAssessment {
  const safeFreeBytes = Math.max(0, freeBytes);
  const safeManagedBytes = Math.max(0, managedBytes);
  const safeRequiredBytes = Math.max(0, requiredBytes);

  if (safeManagedBytes + safeRequiredBytes > maximumManagedMediaBytes) {
    return { status: "managedQuotaExceeded", canPersist: false, freeBytes: safeFreeBytes, managedBytes: safeManagedBytes, requiredBytes: safeRequiredBytes };
  }
  if (safeFreeBytes - safeRequiredBytes < minimumFreeStorageBytes) {
    return { status: "insufficientFreeSpace", canPersist: false, freeBytes: safeFreeBytes, managedBytes: safeManagedBytes, requiredBytes: safeRequiredBytes };
  }
  return {
    status: safeFreeBytes - safeRequiredBytes < lowStorageWarningBytes ? "warning" : "ready",
    canPersist: true,
    freeBytes: safeFreeBytes,
    managedBytes: safeManagedBytes,
    requiredBytes: safeRequiredBytes
  };
}