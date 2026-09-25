import { getDatabase } from "@/db/database";
import { currentContourId } from "@/core/environments";

export type PatrolOfflineReadiness = {
  ready: boolean;
  reason: string;
  pointCount: number;
};

/**
 * Verifies the locally persisted manifest instead of trusting a boolean left
 * by a previous bootstrap. It is intentionally conservative: old servers and
 * old snapshots remain usable, but are never presented as proven offline-ready.
 */
export async function getPatrolOfflineReadiness(ownerUserId: string, assignmentId: string | null): Promise<PatrolOfflineReadiness> {
  if (!assignmentId) return { ready: false, reason: "Маршрут не выбран", pointCount: 0 };
  const db = await getDatabase();
  const assignment = await db.getFirstAsync<{
    employeeId: string | null;
    snapshotVersion: number;
    snapshotReady: number;
  }>(`SELECT employee_id AS employeeId, snapshot_version AS snapshotVersion, snapshot_ready AS snapshotReady
      FROM patrol_assignments WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`, [ownerUserId, currentContourId, assignmentId]);
  if (!assignment?.snapshotReady) return { ready: false, reason: "Снимок маршрута ещё не подтверждён", pointCount: 0 };
  if (!assignment.employeeId) return { ready: false, reason: "Не назначен исполнитель", pointCount: 0 };

  const [manifest, points, employee] = await Promise.all([
    db.getFirstAsync<{ routeVersion: number; employeesComplete: number; pointsJson: string }>(`SELECT route_version AS routeVersion, employees_complete AS employeesComplete, point_revisions_json AS pointsJson
      FROM patrol_snapshot_manifests WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`, [ownerUserId, currentContourId, assignmentId]),
    db.getAllAsync<{ pointId: string; revision: number; name: string }>(`SELECT point_id AS pointId, revision, name FROM assignment_route_points WHERE assignment_id = ? ORDER BY point_id`, [assignmentId]),
    db.getFirstAsync<{ employeeId: string }>("SELECT employee_id AS employeeId FROM mobile_employees WHERE owner_user_id = ? AND employee_id = ?", [ownerUserId, assignment.employeeId])
  ]);
  if (!manifest) return { ready: false, reason: "Сервер не подтвердил полный снимок", pointCount: points.length };
  if (!manifest.employeesComplete || !employee) return { ready: false, reason: "Не сохранён справочник исполнителей", pointCount: points.length };
  if (manifest.routeVersion !== assignment.snapshotVersion) return { ready: false, reason: "Версия маршрута не совпадает со снимком", pointCount: points.length };
  let expected: { pointId: string; revision: number }[];
  try { expected = JSON.parse(manifest.pointsJson) as { pointId: string; revision: number }[]; } catch {
    return { ready: false, reason: "Снимок маршрута повреждён", pointCount: points.length };
  }
  if (!expected.length || expected.length !== points.length) return { ready: false, reason: "Состав точек сохранён не полностью", pointCount: points.length };
  const expectedById = new Map(expected.map((point) => [point.pointId, point.revision]));
  const complete = expectedById.size === expected.length
    && points.every((point) => Boolean(point.name.trim()) && expectedById.get(point.pointId) === point.revision);
  return complete
    ? { ready: true, reason: "Снимок маршрута и исполнитель сохранены", pointCount: points.length }
    : { ready: false, reason: "Состав точек не совпадает со снимком", pointCount: points.length };
}
