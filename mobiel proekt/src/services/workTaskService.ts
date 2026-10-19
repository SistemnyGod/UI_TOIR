import { assertDataOwnerContext, captureDataOwnerContext } from "@/auth/dataOwnerContext";
import { normalizeWorkItems, getWorkItemsV2, getWorkTasks } from "@/api/emuApi";
import { getWorkItemsPage } from "@/api/mobileApi";
import { currentContourId } from "@/core/environments";
import { getDatabase } from "@/db/database";
import { listLocalWorkItemBoundaries, listLocalWorkItems, listLocalWorkItemsPage, listLocalWorkTasks, saveWorkItems, saveWorkTasks } from "@/db/repositories/workTaskRepository";
import { logMobileError } from "@/services/mobileErrorReporter";

export async function syncWorkTasks() {
  const context = await captureDataOwnerContext();
  const tasks = await getWorkTasks();
  await saveWorkTasks(tasks, context);
  return tasks;
}

export async function syncWorkItems(employeeId?: string | null, scope: "active" | "history" = "active") {
  const context = await captureDataOwnerContext();
  const db = await getDatabase();
  const capability = await db.getFirstAsync<{ paging: number }>("SELECT work_items_paging AS paging FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [context.ownerUserId, currentContourId]);
  if (capability?.paging) {
    await refreshWorkItemsHead(scope, employeeId ?? null);
    return (await listLocalWorkItemsPage(25)).items;
  }
  const items = await getWorkItemsV2();
  await saveWorkItems(items, context);
  return items;
}

const pageRequests = new Map<string, Promise<string | null>>();
const headRefreshRequests = new Map<string, Promise<void>>();

/**
 * Reads every new head page through the first previously confirmed item. A
 * one-page refresh used to leave a gap whenever more than 25 records appeared
 * while the screen was closed.
 */
export async function refreshWorkItemsHead(scope: "active" | "history", employeeId?: string | null) {
  const context = await captureDataOwnerContext();
  const db = await getDatabase();
  const capability = await db.getFirstAsync<{ paging: number }>("SELECT work_items_paging AS paging FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [context.ownerUserId, currentContourId]);
  if (!capability?.paging) {
    if (scope === "active") await syncWorkItemsPage(scope, employeeId);
    return;
  }
  const key = `${context.ownerUserId}:${currentContourId}:${context.generation}:${scope}:${employeeId ?? "all"}`;
  const existing = headRefreshRequests.get(key);
  if (existing) return existing;
  const request = (async () => {
    const scopeKey = `work:${scope}:${employeeId ?? "all"}`;
    const localItems = await listLocalWorkItemBoundaries(scope === "history" ? "history" : "mine", employeeId ?? null);
    const knownItems = localItems.filter(item => {
      const completed = item.status === "completedLocal" || item.status === "completedServer" || item.status === "cancelled";
      if ((scope === "history") !== completed) return false;
      if (!employeeId) return true;
      const assigned = (() => { try { return JSON.parse(item.assignedEmployeesJson ?? "[]") as { employeeId?: string }[]; } catch { return []; } })();
      const actual = (() => { try { return JSON.parse(item.actualParticipantsJson ?? "[]") as { employeeId?: string }[]; } catch { return []; } })();
      return item.employeeId === employeeId || assigned.some(participant => participant.employeeId === employeeId) || actual.some(participant => participant.employeeId === employeeId);
    });
    const known = new Map(knownItems.map(item => [item.itemId, item.revision]));
    const storedCursor = await db.getFirstAsync<{ nextCursor: string | null }>("SELECT next_cursor AS nextCursor FROM work_item_cursors WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?", [context.ownerUserId, currentContourId, scopeKey]);
    const state = await db.getFirstAsync<{ boundaryJson: string | null; inProgressCursor: string | null; refreshMode: string | null; initialized: number }>(
      "SELECT boundary_json AS boundaryJson, in_progress_cursor AS inProgressCursor, refresh_mode AS refreshMode, initialized FROM work_item_refresh_state WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?",
      [context.ownerUserId, currentContourId, scopeKey]
    );
    let boundary = new Map<string, number>();
    let recoveryPass = state?.refreshMode === "recovery";
    let canResumeCursor = Boolean(state?.initialized && state?.inProgressCursor);
    let corruptBoundaryDetected = false;
    if (state?.boundaryJson) {
      try {
        const parsed: unknown = JSON.parse(state.boundaryJson);
        if (!isRefreshBoundary(parsed)) throw new Error('invalid refresh boundary');
        boundary = new Map(parsed);
      } catch {
        // Do not replace a corrupted confirmed boundary with a partial local
        // page. Continue to the end once, preserving the already cached rows.
        boundary = new Map();
        recoveryPass = true;
        // A corrupt boundary is not evidence that its cursor belongs to a
        // completed recovery. Restart this recovery from the head.
        canResumeCursor = false;
        corruptBoundaryDetected = true;
      }
    } else {
      boundary = new Map(known);
      await db.runAsync(`INSERT INTO work_item_refresh_state
        (owner_user_id, contour_id, scope_key, boundary_json, in_progress_cursor, initialized, updated_at)
        VALUES (?, ?, ?, ?, NULL, 1, ?)
        ON CONFLICT(owner_user_id, contour_id, scope_key) DO UPDATE SET boundary_json = excluded.boundary_json,
          in_progress_cursor = NULL, initialized = 1, updated_at = excluded.updated_at`,
        [context.ownerUserId, currentContourId, scopeKey, JSON.stringify([...boundary.entries()]), new Date().toISOString()]);
    }
    if (corruptBoundaryDetected) {
      // Replace the unusable marker before fetching the first recovery page.
      // Otherwise every restart sees the same malformed JSON and discards the
      // cursor written by the previous successful page.
      await db.runAsync(`UPDATE work_item_refresh_state
        SET boundary_json = '[]', refresh_mode = 'recovery', in_progress_cursor = NULL,
            initialized = 1, updated_at = ?
        WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?`,
        [new Date().toISOString(), context.ownerUserId, currentContourId, scopeKey]);
    }
    // A cancelled pass owns its cursor. Replaying the first page is safe but
    // costly and can keep a large refresh alive unnecessarily after restart.
    // A recovery pass is persisted too. If the process stopped after a page,
    // resume that page instead of replaying the head after every restart.
    let cursor: string | null = canResumeCursor ? state?.inProgressCursor ?? null : null;
    while (true) {
      const page = await getWorkItemsPage(scope, employeeId, cursor, 25);
      await assertDataOwnerContext(context);
      const intersectsConfirmedHistory = page.items.some(item => boundary.get(item.itemId) === item.revision);
      const refreshFinished = !page.nextCursor || intersectsConfirmedHistory || (boundary.size === 0 && !recoveryPass);
      await saveWorkItems(normalizeWorkItems(page.items), context, async (tx) => {
        const now = new Date().toISOString();
        if (!refreshFinished) {
          await tx.runAsync(`UPDATE work_item_refresh_state SET in_progress_cursor = ?, refresh_mode = ?, updated_at = ?
            WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?`,
            [page.nextCursor, recoveryPass ? "recovery" : "refresh", now, context.ownerUserId, currentContourId, scopeKey]);
          return;
        }
        // A first successful head refresh establishes the cursor for loading
        // older rows. Keep an existing continuation untouched.
        if (!storedCursor || recoveryPass) {
          await tx.runAsync(`INSERT INTO work_item_cursors (owner_user_id, contour_id, scope_key, next_cursor, updated_at)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, contour_id, scope_key)
            DO UPDATE SET next_cursor = excluded.next_cursor, updated_at = excluded.updated_at`,
            [context.ownerUserId, currentContourId, scopeKey, page.nextCursor, now]);
        }
        await tx.runAsync("DELETE FROM work_item_refresh_state WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?", [context.ownerUserId, currentContourId, scopeKey]);
      });
      if (refreshFinished) {
        return;
      }
      cursor = page.nextCursor;
    }
  })();
  headRefreshRequests.set(key, request);
  try { await request; } finally { headRefreshRequests.delete(key); }
}

function isRefreshBoundary(value: unknown): value is [string, number][] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(entry => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'number' || !Number.isFinite(entry[1]) || ids.has(entry[0])) return false;
    ids.add(entry[0]);
    return true;
  });
}

/** Refreshes one page without deleting local work that was not in this response. */
export async function syncWorkItemsPage(scope: "active" | "history", employeeId?: string | null, cursor: string | null = null) {
  const context = await captureDataOwnerContext();
  const capabilityDb = await getDatabase();
  const capability = await capabilityDb.getFirstAsync<{ paging: number }>("SELECT work_items_paging AS paging FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [context.ownerUserId, currentContourId]);
  if (!capability?.paging) {
    if (scope === "history") return null;
    const items = await getWorkItemsV2();
    await saveWorkItems(items, context);
    return null;
  }
  const key = `${context.ownerUserId}:${currentContourId}:${context.generation}:${scope}:${employeeId ?? "all"}:${cursor ?? "head"}`;
  const existing = pageRequests.get(key);
  if (existing) return existing;
  const request = (async () => {
    const db = capabilityDb;
    const scopeKey = `work:${scope}:${employeeId ?? "all"}`;
    const saved = await db.getFirstAsync<{ nextCursor: string | null }>("SELECT next_cursor AS nextCursor FROM work_item_cursors WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?", [context.ownerUserId, currentContourId, scopeKey]);
    const page = await getWorkItemsPage(scope, employeeId, cursor, 25);
    await assertDataOwnerContext(context);
    // A head refresh discovers newer items; it must not rewind an already
    // reached continuation cursor. Explicit older-page loads own that cursor.
    await saveWorkItems(normalizeWorkItems(page.items), context, async (tx) => {
      if (cursor !== null || !saved) {
        await tx.runAsync(`INSERT INTO work_item_cursors (owner_user_id, contour_id, scope_key, next_cursor, updated_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, contour_id, scope_key)
          DO UPDATE SET next_cursor = excluded.next_cursor, updated_at = excluded.updated_at`,
          [context.ownerUserId, currentContourId, scopeKey, page.nextCursor, new Date().toISOString()]);
      }
    });
    return page.nextCursor;
  })();
  pageRequests.set(key, request);
  try { return await request; }
  finally { pageRequests.delete(key); }
}

export async function loadMoreWorkItems(scope: "active" | "history", employeeId?: string | null) {
  const context = await captureDataOwnerContext();
  const db = await getDatabase();
  const scopeKey = `work:${scope}:${employeeId ?? "all"}`;
  const capability = await db.getFirstAsync<{ paging: number }>("SELECT work_items_paging AS paging FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [context.ownerUserId, currentContourId]);
  if (!capability?.paging) return null;
  let row = await db.getFirstAsync<{ nextCursor: string | null }>("SELECT next_cursor AS nextCursor FROM work_item_cursors WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?", [context.ownerUserId, currentContourId, scopeKey]);
  // A missing cursor means this filter has never been initialized, not that
  // the server has no more history. Initialize its head before reporting the
  // end of the list.
  if (!row) {
    await refreshWorkItemsHead(scope, employeeId);
    row = await db.getFirstAsync<{ nextCursor: string | null }>("SELECT next_cursor AS nextCursor FROM work_item_cursors WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?", [context.ownerUserId, currentContourId, scopeKey]);
  }
  return row?.nextCursor ? syncWorkItemsPage(scope, employeeId, row.nextCursor) : null;
}

export async function loadWorkItemsOfflineFirst(onRefreshed?: () => void | Promise<void>, onRefreshFailed?: (error: unknown) => void | Promise<void>, employeeId?: string | null, scope: "active" | "history" = "active") {
  // The work screen starts with one local page and grows on demand. Keep the
  // full-read fallback for older callers and test doubles that predate paging.
  const localItems = typeof listLocalWorkItemsPage === "function"
    ? (await listLocalWorkItemsPage(25)).items
    : await listLocalWorkItems();
  void syncWorkItems(employeeId, scope)
    .then(() => onRefreshed?.())
    .catch((error) => {
      void logMobileError("emu.work-items.refresh.failed", error);
      void Promise.resolve(onRefreshFailed?.(error)).catch((callbackError) => {
        void logMobileError("emu.work-items.refresh-feedback.failed", callbackError);
      });
    });
  return localItems;
}

export async function loadWorkTasksOfflineFirst(onRefreshed?: () => void | Promise<void>, onRefreshFailed?: (error: unknown) => void | Promise<void>) {
  const localTasks = await listLocalWorkTasks();
  void syncWorkTasks()
    .then(() => onRefreshed?.())
    .catch((error) => {
      void logMobileError("emu.work-tasks.refresh.failed", error);
      void Promise.resolve(onRefreshFailed?.(error)).catch((callbackError) => {
        void logMobileError("emu.work-tasks.refresh-feedback.failed", callbackError);
      });
    });
  return localTasks;
}
