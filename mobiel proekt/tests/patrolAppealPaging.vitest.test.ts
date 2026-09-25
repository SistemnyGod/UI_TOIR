import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ owner: "alice", db: null as any, pages: [] as any[], requests: [] as (string | null)[] }));
vi.mock("@/auth/tokenStorage", () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock("@/core/environments", () => ({ currentContourId: "test" }));
vi.mock("@/api/mobileApi", () => ({
  getPatrolAppealsPage: vi.fn(async (_size: number, cursor: string | null) => {
    state.requests.push(cursor);
    return state.pages.find(page => page.cursor === cursor)?.response ?? { items: [], nextCursor: null };
  })
}));
vi.mock("@/db/database", () => ({
  getDatabase: async () => state.db,
  withProtectedExclusiveTransactionAsync: async (_db: unknown, action: (tx: any) => Promise<void>) => action(state.db)
}));
vi.mock("@/db/repositories/outboxSql", () => ({ insertOutboxCommandInTransaction: vi.fn() }));
vi.mock("@/sync/mutationSyncRequest", () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "appeal-id" }));

import { loadPatrolAppeals } from "@/db/repositories/patrolAppealRepository";

let sqlite: DatabaseSync;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE mobile_capabilities (
      owner_user_id TEXT NOT NULL, contour_id TEXT NOT NULL,
      patrol_appeals INTEGER NOT NULL DEFAULT 1,
      patrol_appeals_paging INTEGER NOT NULL DEFAULT 1,
      patrol_appeals_assignment_paging INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner_user_id, contour_id)
    );
    CREATE TABLE patrol_appeals (
      id TEXT NOT NULL, owner_user_id TEXT NOT NULL, contour_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL, reply TEXT, created_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, owner_user_id, contour_id)
    );
    CREATE TABLE patrol_appeal_cursors (
      owner_user_id TEXT NOT NULL, contour_id TEXT NOT NULL, scope_key TEXT NOT NULL,
      next_cursor TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_user_id, contour_id, scope_key)
    );
    CREATE TABLE patrol_appeal_refresh_state (
      owner_user_id TEXT NOT NULL, contour_id TEXT NOT NULL, scope_key TEXT NOT NULL,
      initialized INTEGER NOT NULL DEFAULT 0, refresh_mode TEXT NOT NULL DEFAULT 'initial',
      boundary_json TEXT, confirmed_cursor TEXT, in_progress_cursor TEXT,
      visible_limit INTEGER NOT NULL DEFAULT 25, updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_user_id, contour_id, scope_key)
    );
    CREATE TABLE outbox_commands (
      entity_local_id TEXT, owner_user_id TEXT, contour_id TEXT,
      status TEXT, created_at_local TEXT
    );
    INSERT INTO mobile_capabilities VALUES ('alice', 'test', 1, 1, 0);
  `);
  state.db = {
    getAllAsync: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).get(...params),
    runAsync: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).run(...params),
  };
  state.requests = [];
  state.pages = [];
});

afterEach(() => sqlite.close());

function appeal(id: string, assignmentId: string, day: number) {
  return {
    id, assignmentId, routeName: "Route", employeeName: "Alice", deviceId: "phone",
    kind: "message", message: id, status: "open", reply: null,
    createdAt: new Date(Date.UTC(2026, 0, day)).toISOString(), resolvedAt: null,
    version: 1, assignmentVersion: 1,
  };
}

it("continues legacy unfiltered pages until the selected route has a full page", async () => {
  state.pages = [
    { cursor: null, response: { items: [appeal("b-01", "route-b", 1), ...Array.from({ length: 24 }, (_, i) => appeal(`a-${i}`, "route-a", i + 2))], nextCursor: "p2" } },
    { cursor: "p2", response: { items: [...Array.from({ length: 23 }, (_, i) => appeal(`b-${i + 2}`, "route-b", i + 30)), appeal("a-25", "route-a", 60)], nextCursor: "p3" } },
    { cursor: "p3", response: { items: [appeal("b-25", "route-b", 61), appeal("b-26", "route-b", 62)], nextCursor: null } },
  ];

  const result = await loadPatrolAppeals("route-b");
  expect(state.requests).toEqual([null, "p2", "p3"]);
  expect(result.items).toHaveLength(26);
  expect(result.items.every(item => item.assignmentId === "route-b")).toBe(true);
});

it("resumes an interrupted head refresh from its saved cursor", async () => {
  sqlite.prepare(`INSERT INTO patrol_appeal_refresh_state
    (owner_user_id, contour_id, scope_key, initialized, refresh_mode, boundary_json, in_progress_cursor, updated_at)
    VALUES ('alice', 'test', 'all', 1, 'refresh', ?, 'p2', ?)`).run(JSON.stringify([["old", 1]]), new Date().toISOString());
  state.pages = [{ cursor: "p2", response: { items: [appeal("old", "route-b", 1)], nextCursor: null } }];

  await loadPatrolAppeals("route-b");
  expect(state.requests).toEqual(["p2"]);
  expect(sqlite.prepare("SELECT refresh_mode, in_progress_cursor FROM patrol_appeal_refresh_state WHERE scope_key = 'all'").get()).toMatchObject({ refresh_mode: "initial", in_progress_cursor: null });
});
