export const pointResultCommandTypes = new Set<string>([
  "scanPatrolPointNfc",
  "scanPatrolPointQr",
  "markPatrolPointOk",
  "markPatrolPointIssue"
] as const);

export type PointResultSyncUpdate = {
  syncStatus: "synced";
  serverRevision: number | null;
  acceptedOperationId: string;
  lastSyncedAt: string;
};

export function getPointResultSyncUpdate(
  commandType: string,
  responseStatus: string,
  serverRevision: number | null,
  operationId: string,
  syncedAt: string
): PointResultSyncUpdate | null {
  if (!pointResultCommandTypes.has(commandType)) {
    return null;
  }

  if (responseStatus !== "accepted" && responseStatus !== "duplicate") {
    return null;
  }

  return {
    syncStatus: "synced",
    serverRevision,
    acceptedOperationId: operationId,
    lastSyncedAt: syncedAt
  };
}