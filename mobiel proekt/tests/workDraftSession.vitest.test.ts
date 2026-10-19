import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));

vi.mock("@/auth/tokenStorage", () => ({ getStoredOwnerUserId: async () => "owner" }));
vi.mock("@/core/environments", () => ({ currentContourId: "contour" }));
vi.mock("@/db/database", () => ({
  getDatabase: async () => ({
    getAllAsync: async (sql: string, values: unknown[] = []) => state.db.prepare(sql).all(...values),
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
  listWorkDraftsForContext,
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

it("keeps all legacy drafts accessible without a device employee and isolates the account/object", async () => {
  setup();
  try {
    await saveWorkDraftForContext(context, "alice", "task", { employeeId: "bob", text: "first" });
    await saveWorkDraftForContext(context, "bob", "task", { employeeId: "alice", text: "second" });
    await saveWorkDraftForContext({ ...context, ownerUserId: "other" }, "alice", "task", { text: "private" });
    await saveWorkDraftForContext({ ...context, contourId: "other" }, "alice", "task", { text: "private" });
    await saveWorkDraftForContext(context, "alice", "task", { text: "edit" }, "existing-work");
    const drafts = await listWorkDraftsForContext<{ employeeId: string; text: string }>(context, "task");
    expect(drafts).toHaveLength(2);
    expect(drafts.map(draft => draft.payload.text).sort()).toEqual(["first", "second"]);
    await deleteWorkDraftForContext(context, "alice", "task");
    expect((await listWorkDraftsForContext(context, "task")).map(draft => draft.draftKey)).toEqual(["bob"]);
  } finally { state.db.close(); }
});
it("saves before a form employee is chosen and keeps its key after choosing one", async () => {
  setup();
  try {
    await saveWorkDraftForContext(context, "form:independent", "remark", { employeeId: "", comment: "draft" });
    await saveWorkDraftForContext(context, "form:independent", "remark", { employeeId: "alice", comment: "latest", attachmentAfterSave: "now" });
    const drafts = await listWorkDraftsForContext(context, "remark");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].payload).toEqual({ employeeId: "alice", comment: "latest", attachmentAfterSave: "now" });
  } finally { state.db.close(); }
});
it.each(['workStart', 'workJoin', 'workReplace'] as const)('restores %s fields under an independent object and operation key', async kind => {
  setup();
  try {
    const payload = { employeeId: 'bob', previousEmployeeId: 'alice', reason: 'shift handover' };
    await saveWorkDraftForContext(context, 'form:operation', kind, payload, 'work-1');
    expect((await listWorkDraftsForContext(context, kind, 'work-1'))[0].payload).toEqual(payload);
    expect(await listWorkDraftsForContext(context, kind, 'work-2')).toEqual([]);
    expect(await listWorkDraftsForContext({ ...context, ownerUserId: 'other' }, kind, 'work-1')).toEqual([]);
    await deleteWorkDraftForContext(context, 'form:operation', kind, 'work-1');
    expect(await listWorkDraftsForContext(context, kind, 'work-1')).toEqual([]);
  } finally { state.db.close(); }
});
