import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));

vi.mock("@/auth/tokenStorage", () => ({ getStoredOwnerUserId: async () => "owner" }));
vi.mock("@/core/environments", () => ({ currentContourId: "contour" }));
vi.mock("@/db/database", () => ({
  getDatabase: async () => ({
    getFirstAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).get(...values),
    runAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).run(...values)
  }),
  withProtectedExclusiveTransactionAsync: async (_db: unknown, task: (tx: unknown) => Promise<void>) => task({
    runAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).run(...values)
  })
}));

import {
  captureWorkDraftWriteToken,
  deleteWorkDraftForContext,
  invalidateWorkDraftForContext,
  readWorkDraftForContext,
  saveWorkDraftForContext
} from "@/db/repositories/workDraftRepository";

const context = { ownerUserId: "owner", contourId: "contour" };

function setup() {
  state.db = new DatabaseSync(":memory:");
  state.db.exec(`CREATE TABLE work_form_drafts (
    owner_user_id TEXT, contour_id TEXT, employee_id TEXT, form_kind TEXT,
    entity_id TEXT, payload_json TEXT, updated_at TEXT,
    PRIMARY KEY(owner_user_id, contour_id, employee_id, form_kind, entity_id)
  )`);
}

describe("work draft form session", () => {
  it("does not recreate an explicitly deleted draft from an earlier timer", async () => {
    setup();
    const token = captureWorkDraftWriteToken(context, "employee", "task");
    await saveWorkDraftForContext(context, "employee", "task", { text: "before" });
    await deleteWorkDraftForContext(context, "employee", "task");

    await expect(saveWorkDraftForContext(context, "employee", "task", { text: "late" }, "new", token)).resolves.toBe(false);
    await expect(readWorkDraftForContext(context, "employee", "task")).resolves.toBeNull();
    state.db.close();
  });

  it("rejects an autosave captured before a form submit invalidates its session", async () => {
    setup();
    const token = captureWorkDraftWriteToken(context, "employee", "remark");
    invalidateWorkDraftForContext(context, "employee", "remark");

    await expect(saveWorkDraftForContext(context, "employee", "remark", { text: "late" }, "new", token)).resolves.toBe(false);
    await expect(readWorkDraftForContext(context, "employee", "remark")).resolves.toBeNull();
    state.db.close();
  });
});
