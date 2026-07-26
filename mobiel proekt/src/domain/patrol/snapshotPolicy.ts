export interface SnapshotRefreshInput {
  localStatus: string;
  localSnapshotVersion: number | null;
  localPointCount: number;
  routeVersion: number;
  incomingPointIds: readonly string[];
}

export interface SnapshotRefreshPlan {
  shouldReplace: boolean;
  snapshotVersion: number;
  pointIds: string[];
}

export function getSnapshotRefreshPlan(input: SnapshotRefreshInput): SnapshotRefreshPlan {
  const shouldReplace = input.localStatus === "accepted"
    && (input.localPointCount === 0 || input.localSnapshotVersion !== input.routeVersion);

  return {
    shouldReplace,
    snapshotVersion: shouldReplace ? input.routeVersion : (input.localSnapshotVersion ?? input.routeVersion),
    pointIds: Array.from(new Set(input.incomingPointIds))
  };
}