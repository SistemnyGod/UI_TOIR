import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-sqlite", () => ({}));
vi.mock("@/db/encryptedDatabase", () => ({
  openProtectedDatabase: vi.fn(),
  openProtectedDatabaseConnection: vi.fn()
}));

let raw: DatabaseSync;
afterEach(() => raw?.close());

async function start() {
  vi.resetModules();
  const adapter = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    getAllAsync: async (sql: string, params: never[] = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: never[] = []) => raw.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, params: never[] = []) => raw.prepare(sql).run(...params),
    closeAsync: async () => {}
  };
  const storage = await import("@/db/encryptedDatabase");
  vi.mocked(storage.openProtectedDatabase).mockResolvedValue(adapter as never);
  vi.mocked(storage.openProtectedDatabaseConnection).mockResolvedValue(adapter as never);
  await (await import("@/db/database")).initializeDatabase();
}

describe("actual startup migrations", () => {
  it("adds matching list indexes to an upgraded database without changing rows or order", async () => {
    raw = new DatabaseSync(":memory:");
    await start();
    raw.exec(`DROP INDEX ix_patrol_request_board_owner_date;
      DROP INDEX ix_work_tasks_active_page; DROP INDEX ix_work_tasks_history_page;
      DROP INDEX ix_shift_remarks_owner_page;
      DELETE FROM schema_migrations WHERE id='20260930_chronological_list_indexes';`);
    const request = raw.prepare(`INSERT INTO patrol_request_board(request_id,owner_user_id,route_id,route_name,planned_start_at,status,revision)
      VALUES (?,?,'route','Маршрут',?,'new',1)`);
    const work = raw.prepare(`INSERT INTO work_tasks(task_id,owner_user_id,title,status,planned_at,revision,created_at_local)
      VALUES (?,?,'Работа',?,NULL,1,?)`);
    raw.exec('BEGIN');
    for (let i = 0; i < 30_000; i++) {
      const id = String(i).padStart(8, '0'), owner = i % 3 ? 'owner' : 'other';
      const date = new Date(Date.UTC(2026, 8, 30) - i * 1000).toISOString();
      request.run(id, owner, date); work.run(id, owner, i % 2 ? 'inProgress' : 'completedServer', date);
    }
    raw.exec('COMMIT');
    const requestSql = `SELECT request_id, route_name, planned_start_at FROM patrol_request_board WHERE owner_user_id = ?
      ORDER BY julianday(planned_start_at) DESC, request_id ASC`;
    const queries = [requestSql, `SELECT task_id FROM work_tasks WHERE owner_user_id = ? AND status NOT IN ('completedLocal','completedServer','cancelled')
      ORDER BY planned_at ASC, COALESCE(created_at_local, '') DESC, task_id ASC LIMIT 26`,
      `SELECT task_id FROM work_tasks WHERE owner_user_id = ? AND status IN ('completedLocal','completedServer','cancelled')
      ORDER BY planned_at ASC, COALESCE(created_at_local, '') DESC, task_id ASC LIMIT 26`,
      `SELECT remark_id FROM shift_remarks WHERE owner_user_id = ? ORDER BY created_at_local DESC, remark_id DESC LIMIT 26`];
    const plans = () => queries.map(sql => raw.prepare('EXPLAIN QUERY PLAN ' + sql).all('owner'));
    const measure = () => { const sql = raw.prepare(requestSql); const times: number[] = [];
      sql.all('owner'); for (let i = 0; i < 7; i++) { const start = performance.now(); sql.all('owner'); times.push(performance.now() - start); }
      return times.sort((a,b) => a-b)[3]; };
    const before = { plans: plans(), requestMedianMs: measure() };
    const previousOrder = raw.prepare(requestSql).all('owner');
    await start();
    expect(raw.prepare(requestSql).all('owner')).toEqual(previousOrder);
    const after = { plans: plans(), requestMedianMs: measure() };
    for (const plan of after.plans) expect(plan.map(row => row.detail).join(' ')).not.toContain('TEMP B-TREE');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM work_tasks').get()).toMatchObject({ n: 30_000 });
    writeFileSync('output/selected-optimizations-audit/database-benchmark.json', JSON.stringify({ rowsPerTable: 30_000, before, after }, null, 2));
    await start();
    expect(raw.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id='20260930_chronological_list_indexes'").get()).toMatchObject({ n: 1 });
  });
  it("initializes a clean database and can restart", async () => {
    raw = new DatabaseSync(":memory:");
    await start();
    expect(raw.prepare("SELECT contour_id FROM patrol_assignments").all()).toEqual([]);
    await start();
  });

  it("upgrades a legacy assignment without discarding its results", async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec(`CREATE TABLE patrol_assignments (
      assignment_id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
      request_id TEXT NOT NULL, route_id TEXT NOT NULL, status TEXT NOT NULL,
      started_at_local TEXT, completed_at_local TEXT, revision INTEGER NOT NULL
    ); INSERT INTO patrol_assignments VALUES ('legacy','owner','request','route','inProgress','start',NULL,3);`);
    await start();
    expect(raw.prepare("SELECT assignment_id, status, contour_id FROM patrol_assignments").get())
      .toMatchObject({ assignment_id: "legacy", status: "inProgress", contour_id: null });
    await start();
    expect(raw.prepare("SELECT COUNT(*) AS count FROM patrol_assignments").get()).toMatchObject({ count: 1 });
  });

  it("repairs a partial schema even with an existing contour migration marker", async () => {
    raw = new DatabaseSync(":memory:");
    raw.exec(`CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES ('20260721_contour_isolation', 'original');`);
    await start();
    expect(raw.prepare("SELECT contour_id, local_report_present FROM patrol_assignments").all()).toEqual([]);
    expect(raw.prepare("SELECT applied_at FROM schema_migrations WHERE id='20260721_contour_isolation'").get())
      .toMatchObject({ applied_at: "original" });
  });
});
