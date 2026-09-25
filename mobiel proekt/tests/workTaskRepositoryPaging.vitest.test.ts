import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
function executor() {
  return {
    getAllAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).all(...values),
    getFirstAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).get(...values) ?? null,
    runAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).run(...values),
    execAsync: async (sql: string) => state.db.exec(sql)
  };
}
vi.mock("@/auth/tokenStorage", () => ({ getStoredOwnerUserId: async () => "owner" }));
vi.mock("@/core/environments", () => ({ currentContourId: "contour" }));
vi.mock("@/db/database", () => ({ getDatabase: async () => executor(), withProtectedExclusiveTransactionAsync: async (_db: unknown, action: (tx: ReturnType<typeof executor>) => Promise<void>) => action(executor()) }));
vi.mock("@/auth/dataOwnerContext", () => ({ captureDataOwnerContext: async () => ({ ownerUserId: "owner", contourId: "contour" }), assertDataOwnerContext: async () => undefined }));
vi.mock("@/db/sqliteBusyRetry", () => ({ withSqliteBusyRetry: async (action: () => Promise<unknown>) => action() }));
vi.mock("@/db/repositories/outboxSql", () => ({ insertOutboxCommandInTransaction: vi.fn() }));
vi.mock("@/db/repositories/filesRepository", () => ({ insertLocalFileInTransaction: vi.fn() }));
vi.mock("@/sync/mutationSyncRequest", () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "id" }));

import { listLocalWorkItemsPage } from "@/db/repositories/workTaskRepository";

afterEach(() => state.db?.close());

it("filters before LIMIT so a page is not consumed by another employee", async () => {
  state.db = new DatabaseSync(":memory:");
  state.db.exec(`
    CREATE TABLE work_tasks (
      task_id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      planned_at TEXT, revision INTEGER NOT NULL, updated_at_server TEXT, completed_at_local TEXT,
      section_id TEXT, section_name TEXT, employee_id TEXT, employee_name TEXT, created_at_local TEXT,
      sync_status TEXT NOT NULL, item_kind TEXT, work_session_id TEXT, plan_task_id TEXT, description TEXT,
      approval_status TEXT, source TEXT, assigned_employees_json TEXT, actual_participants_json TEXT,
      attachments_json TEXT, capabilities_json TEXT
    );
    CREATE TABLE files(work_task_id TEXT, media_kind TEXT);
    CREATE TABLE outbox_commands(entity_local_id TEXT, owner_user_id TEXT, contour_id TEXT, last_error TEXT, updated_at_local TEXT);
  `);
  const add = (id: string, employeeId: string) => state.db.prepare(`INSERT INTO work_tasks
    (task_id,owner_user_id,title,status,planned_at,revision,created_at_local,sync_status,item_kind,description,source,assigned_employees_json,actual_participants_json,attachments_json,capabilities_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, "owner", id, "inProgress", "2026-01-01T00:00:00Z", 1, id, "synced", "workSession", id, "web", JSON.stringify([{ employeeId, fullName: employeeId }]), "[]", "[]", "{}");
  for (let i = 0; i < 30; i++) add(`other-${i}`, "bob");
  for (let i = 0; i < 25; i++) add(`mine-${i}`, "alice");
  const page = await listLocalWorkItemsPage(25, null, "mine", "alice");
  expect(page.items).toHaveLength(25);
  expect(page.items.every(item => item.assignedEmployees[0]?.employeeId === "alice")).toBe(true);
  expect(page.nextCursor).toBeNull();
});

it("continues rows whose local created time is null", async () => {
  state.db = new DatabaseSync(":memory:");
  state.db.exec(`CREATE TABLE work_tasks (
    task_id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
    planned_at TEXT, revision INTEGER NOT NULL, updated_at_server TEXT, completed_at_local TEXT,
    section_id TEXT, section_name TEXT, employee_id TEXT, employee_name TEXT, created_at_local TEXT,
    sync_status TEXT NOT NULL, item_kind TEXT, work_session_id TEXT, plan_task_id TEXT, description TEXT,
    approval_status TEXT, source TEXT, assigned_employees_json TEXT, actual_participants_json TEXT,
    attachments_json TEXT, capabilities_json TEXT);
    CREATE TABLE files(work_task_id TEXT, media_kind TEXT);
    CREATE TABLE outbox_commands(entity_local_id TEXT, owner_user_id TEXT, contour_id TEXT, last_error TEXT, updated_at_local TEXT);`);
  const stmt = state.db.prepare(`INSERT INTO work_tasks (task_id,owner_user_id,title,status,planned_at,revision,created_at_local,sync_status,item_kind,description,source,assigned_employees_json,actual_participants_json,attachments_json,capabilities_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < 26; i++) stmt.run(`null-${i}`, "owner", `null-${i}`, "inProgress", null, 1, null, "synced", "workSession", "x", "web", "[]", "[]", "[]", "{}");
  const first = await listLocalWorkItemsPage(25);
  const second = await listLocalWorkItemsPage(25, first.nextCursor);
  expect(first.items).toHaveLength(25);
  expect(second.items).toHaveLength(1);
});
