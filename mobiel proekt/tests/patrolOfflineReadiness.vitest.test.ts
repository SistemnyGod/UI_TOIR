import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
vi.mock("@/core/environments", () => ({ currentContourId: "contour" }));
vi.mock("@/db/database", () => ({
  getDatabase: async () => ({
    getFirstAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).get(...values),
    getAllAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).all(...values)
  })
}));
import { getPatrolOfflineReadiness } from "@/db/repositories/patrolOfflineReadinessRepository";

function setup() {
  state.db = new DatabaseSync(":memory:");
  state.db.exec(`
    CREATE TABLE patrol_assignments (owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, employee_id TEXT, snapshot_version INTEGER, snapshot_ready INTEGER);
    CREATE TABLE patrol_snapshot_manifests (owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, route_version INTEGER, employees_complete INTEGER, point_revisions_json TEXT);
    CREATE TABLE assignment_route_points (assignment_id TEXT, point_id TEXT, revision INTEGER, name TEXT);
    CREATE TABLE mobile_employees (owner_user_id TEXT, employee_id TEXT);
    INSERT INTO patrol_assignments VALUES ('owner','contour','assignment','employee',7,1);
    INSERT INTO mobile_employees VALUES ('owner','employee');
  `);
}

describe("patrol offline readiness", () => {
  it("requires the exact persisted point/revision set", async () => {
    setup();
    state.db.exec(`INSERT INTO patrol_snapshot_manifests VALUES ('owner','contour','assignment',7,1,'[{"pointId":"point-a","revision":3}]');
      INSERT INTO assignment_route_points VALUES ('assignment','point-a',3,'A');`);
    await expect(getPatrolOfflineReadiness("owner", "assignment")).resolves.toMatchObject({ ready: true });

    state.db.exec("UPDATE assignment_route_points SET revision = 4 WHERE point_id = 'point-a'");
    await expect(getPatrolOfflineReadiness("owner", "assignment")).resolves.toMatchObject({ ready: false, reason: "Состав точек не совпадает со снимком" });
    state.db.close();
  });

  it("does not trust the old snapshot flag without a manifest", async () => {
    setup();
    await expect(getPatrolOfflineReadiness("owner", "assignment")).resolves.toMatchObject({ ready: false, reason: "Сервер не подтвердил полный снимок" });
    state.db.close();
  });
});
