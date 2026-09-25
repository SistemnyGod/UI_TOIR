import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-sqlite", () => ({}));
vi.mock("@/db/encryptedDatabase", () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock("@/sync/outboxOrderingPolicy", () => ({ getCommandAggregateKey: vi.fn() }));

import { ensureWorkItemRefreshStateSchema } from "@/db/database";

function executor(raw: DatabaseSync) {
  return {
    execAsync: async (sql: string) => raw.exec(sql),
    getAllAsync: async <T>(sql: string) => raw.prepare(sql).all() as T[],
    getFirstAsync: async <T>() => null as T | null,
    runAsync: async () => undefined
  };
}

describe("work refresh schema recovery", () => {
  it("creates the table after an earlier migration marker was already stored", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT); INSERT INTO schema_migrations VALUES ('20260922_work_paging_and_drafts','old');");
    await ensureWorkItemRefreshStateSchema(executor(raw));
    const columns = raw.prepare("PRAGMA table_info(work_item_refresh_state)").all() as { name: string }[];
    expect(columns.map(column => column.name)).toEqual(expect.arrayContaining(["confirmed_cursor", "in_progress_cursor", "visible_limit", "initialized"]));
    raw.close();
  });

  it("adds missing columns to a partial table without deleting its state", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("CREATE TABLE work_item_refresh_state(owner_user_id TEXT, contour_id TEXT, scope_key TEXT, boundary_json TEXT, updated_at TEXT, PRIMARY KEY(owner_user_id, contour_id, scope_key)); INSERT INTO work_item_refresh_state VALUES ('owner','contour','work:history:all','[]','now');");
    await ensureWorkItemRefreshStateSchema(executor(raw));
    expect(raw.prepare("SELECT boundary_json AS boundaryJson FROM work_item_refresh_state").get()).toMatchObject({ boundaryJson: "[]" });
    expect((raw.prepare("PRAGMA table_info(work_item_refresh_state)").all() as { name: string }[]).map((column) => column.name)).toContain("visible_limit");
    raw.close();
  });
});
