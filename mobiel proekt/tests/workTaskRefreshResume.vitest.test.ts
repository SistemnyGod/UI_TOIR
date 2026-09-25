import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, items: new Map<string, any>(), calls: [] as (string | null)[], failPageTwo: true }));
const database = () => ({
  getFirstAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).get(...values),
  runAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).run(...values)
});

vi.mock("@/auth/dataOwnerContext", () => ({
  captureDataOwnerContext: async () => ({ ownerUserId: "owner", contourId: "contour" }),
  assertDataOwnerContext: async () => undefined
}));
vi.mock("@/core/environments", () => ({ currentContourId: "contour" }));
vi.mock("@/db/database", () => ({ getDatabase: async () => database() }));
vi.mock("@/db/repositories/patrolContextRepository", () => ({ getPatrolDeviceContext: async () => ({ employeeId: null }) }));
vi.mock("@/services/mobileErrorReporter", () => ({ logMobileError: vi.fn() }));
vi.mock("@/api/emuApi", () => ({ normalizeWorkItems: (items: unknown[]) => items, getWorkItemsV2: vi.fn(), getWorkTasks: vi.fn() }));
vi.mock("@/api/mobileApi", () => ({
  getWorkItemsPage: async (_scope: string, _employee: string | null, cursor: string | null) => {
    state.calls.push(cursor);
    if (cursor === "page-2" && state.failPageTwo) throw new Error("offline");
    const old = Array.from({ length: 75 }, (_, index) => item(`old-${index}`));
    const fresh = Array.from({ length: 40 }, (_, index) => item(`new-${index}`));
    return cursor === null
      ? { items: fresh.slice(0, 25), nextCursor: "page-2" }
      : cursor === "page-2"
        ? { items: [...fresh.slice(25), ...old.slice(0, 10)], nextCursor: "page-3" }
        : { items: old.slice(10, 25), nextCursor: null };
  }
}));
vi.mock("@/db/repositories/workTaskRepository", () => ({
  listLocalWorkItems: async () => [...state.items.values()],
  listLocalWorkItemBoundaries: async () => [...state.items.values()].map(item => ({ itemId: item.itemId, revision: item.revision, status: item.status, employeeId: null, assignedEmployeesJson: '[]', actualParticipantsJson: '[]' })),
  saveWorkItems: async (items: any[], _context: unknown, after?: (tx: ReturnType<typeof database>) => Promise<void>) => {
    items.forEach(item => state.items.set(item.itemId, item));
    await after?.(database());
  },
  listLocalWorkTasks: vi.fn(),
  saveWorkTasks: vi.fn()
}));

import { refreshWorkItemsHead } from "@/services/workTaskService";

function item(itemId: string) {
  return { itemId, revision: 1, status: "completedServer", assignedEmployees: [], actualParticipants: [] };
}

describe("work history head refresh", () => {
  it("resumes the saved second page after an interrupted refresh", async () => {
    state.db = new DatabaseSync(":memory:");
    state.db.exec(`
      CREATE TABLE mobile_capabilities(owner_user_id TEXT, contour_id TEXT, work_items_paging INTEGER);
      CREATE TABLE work_item_cursors(owner_user_id TEXT, contour_id TEXT, scope_key TEXT, next_cursor TEXT, updated_at TEXT, PRIMARY KEY(owner_user_id, contour_id, scope_key));
      CREATE TABLE work_item_refresh_state(owner_user_id TEXT, contour_id TEXT, scope_key TEXT, boundary_json TEXT, refresh_mode TEXT DEFAULT 'initial', in_progress_cursor TEXT, initialized INTEGER, updated_at TEXT, PRIMARY KEY(owner_user_id, contour_id, scope_key));
      INSERT INTO mobile_capabilities VALUES ('owner','contour',1);
      INSERT INTO work_item_cursors VALUES ('owner','contour','work:history:all','old-history','now');
    `);
    state.items = new Map(Array.from({ length: 75 }, (_, index) => [`old-${index}`, item(`old-${index}`)]));
    state.calls = [];
    state.failPageTwo = true;

    await expect(refreshWorkItemsHead("history")).rejects.toThrow("offline");
    expect(state.db.prepare("SELECT in_progress_cursor AS cursor FROM work_item_refresh_state").get()).toMatchObject({ cursor: "page-2" });

    state.failPageTwo = false;
    await refreshWorkItemsHead("history");
    expect(state.calls).toEqual([null, "page-2", "page-2"]);
    expect(state.items).toHaveLength(115);
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM work_item_refresh_state").get()).toMatchObject({ count: 0 });
    state.db.close();
  });

  it("recovers a corrupted boundary through the end instead of stopping after page one", async () => {
    state.db = new DatabaseSync(":memory:");
    state.db.exec(`
      CREATE TABLE mobile_capabilities(owner_user_id TEXT, contour_id TEXT, work_items_paging INTEGER);
      CREATE TABLE work_item_cursors(owner_user_id TEXT, contour_id TEXT, scope_key TEXT, next_cursor TEXT, updated_at TEXT, PRIMARY KEY(owner_user_id, contour_id, scope_key));
      CREATE TABLE work_item_refresh_state(owner_user_id TEXT, contour_id TEXT, scope_key TEXT, boundary_json TEXT, refresh_mode TEXT DEFAULT 'initial', in_progress_cursor TEXT, initialized INTEGER, updated_at TEXT, PRIMARY KEY(owner_user_id, contour_id, scope_key));
      INSERT INTO mobile_capabilities VALUES ('owner','contour',1);
      INSERT INTO work_item_cursors VALUES ('owner','contour','work:history:all','old-history','now');
      INSERT INTO work_item_refresh_state VALUES ('owner','contour','work:history:all','broken-json','recovery','page-2',1,'now');
    `);
    const old = Array.from({ length: 75 }, (_, index) => [`old-${index}`, item(`old-${index}`)] as const);
    state.items = new Map([...old, ...Array.from({ length: 25 }, (_, index) => [`new-${index}`, item(`new-${index}`)] as const)]);
    state.calls = [];
    state.failPageTwo = false;
    await refreshWorkItemsHead("history");
    expect(state.calls).toEqual([null, "page-2", "page-3"]);
    expect(state.items).toHaveLength(115);
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM work_item_refresh_state").get()).toMatchObject({ count: 0 });
    state.db.close();
  });
});
