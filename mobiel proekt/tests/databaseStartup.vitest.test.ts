import { DatabaseSync } from "node:sqlite";
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
