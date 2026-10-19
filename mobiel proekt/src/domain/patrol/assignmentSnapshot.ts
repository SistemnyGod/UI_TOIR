import type { BootstrapDto, PatrolAssignmentDto, PatrolSnapshotManifestDto } from "./patrolTypes";

/** Catalogs from old servers are usable only when they match the assignment. */
export function resolveAssignmentSnapshot(bootstrap: BootstrapDto, assignment: PatrolAssignmentDto) {
  const explicit = assignment.routeSnapshot;
  const route = explicit?.route ?? bootstrap.routes.find(item => item.routeId === assignment.routeId && item.version === assignment.routeVersionNo);
  if (!route) return null;
  const points = explicit?.points ?? bootstrap.points.filter(item => item.routeId === route.routeId && item.revision === route.version);
  if (explicit && (route.routeId !== assignment.routeId || route.version !== assignment.routeVersionNo
    || points.some(point => point.routeId !== route.routeId || point.revision !== route.version)
    || new Set(points.map(point => point.pointId)).size !== points.length)) {
    throw new Error("Сервер передал несогласованный снимок назначения. Обновите данные обхода.");
  }
  const manifest: PatrolSnapshotManifestDto | undefined = explicit
    ? { routeId: route.routeId, routeVersion: route.version, isComplete: true, points: points.map(point => ({pointId: point.pointId, revision: point.revision})) }
    : bootstrap.patrolSnapshotManifest
      ? bootstrap.patrolSnapshotManifests?.find(item => item.routeId === route.routeId && item.routeVersion === route.version)
      : undefined;
  return { route, points, manifest };
}
