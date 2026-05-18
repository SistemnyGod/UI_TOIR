import { activePatrols as defaultActivePatrols } from "../data";
import { createActivePatrolFromRequest, isActivePatrolList } from "../domain/activeAssignments";
import type { ActivePatrol, DataSourceMode, RouteDirectoryItem, ServiceRequest } from "../types";

export const activePatrolsStorageKey = "patrol360.activePatrols.v1";
export const activePatrolsFallback = defaultActivePatrols;
export { isActivePatrolList };

export function resolveActivePatrols({
  dataSourceMode,
  localActivePatrols,
  snapshotActivePatrols,
}: {
  dataSourceMode: DataSourceMode;
  localActivePatrols: ActivePatrol[];
  snapshotActivePatrols: ActivePatrol[];
}) {
  return dataSourceMode === "api" ? snapshotActivePatrols : localActivePatrols;
}

export function addActivePatrolFromRequest({
  activePatrols,
  request,
  route,
}: {
  activePatrols: ActivePatrol[];
  request: ServiceRequest;
  route?: RouteDirectoryItem;
}) {
  return [
    createActivePatrolFromRequest({
      request,
      route,
      existingCount: activePatrols.length,
    }),
    ...activePatrols,
  ];
}
