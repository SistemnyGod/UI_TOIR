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
  return {
    shouldReplace: input.localPointCount === 0
      || (input.localStatus === "accepted" && input.localSnapshotVersion !== input.routeVersion),
    snapshotVersion: input.routeVersion,
    pointIds: Array.from(new Set(input.incomingPointIds))
  };
}