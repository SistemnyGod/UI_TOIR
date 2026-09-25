import * as Crypto from "expo-crypto";
import { getPatrolAppealsPage } from "@/api/mobileApi";
import { assertDataOwnerContext, captureDataOwnerContext } from "@/auth/dataOwnerContext";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";
import { PatrolAppeal } from "@/domain/patrol/patrolTypes";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";

type AppealRefreshResult = {
  nextCursor: string | null;
  reachedBoundary: boolean;
  ended: boolean;
};

const refreshInFlight = new Map<string, Promise<AppealRefreshResult>>();

function cursorScope(assignmentId?: string) {
  return assignmentId ? `assignment:${assignmentId}` : "all";
}

export async function loadPatrolAppeals(assignmentId: string) {
  const db = await getDatabase();
  const owner = await getStoredOwnerUserId();
  const capability = await db.getFirstAsync<{ enabled: number; paging: number; assignmentPaging: number }>("SELECT patrol_appeals AS enabled, patrol_appeals_paging AS paging, patrol_appeals_assignment_paging AS assignmentPaging FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [owner ?? "", currentContourId]);
  if (owner && capability?.paging) {
    // New servers can read the old route directly. Older servers retain the
    // compatible all-appeals request and the local query filters its result.
    const serverAssignmentId = capability.assignmentPaging ? assignmentId : undefined;
    let cursor: string | null = null;
    let firstPage = true;
    // An assignment filter is optional on the server.  When it is absent we
    // keep reading common pages until this route has a complete local page or
    // the server reaches the end. Finding one matching row is not enough: the
    // remaining rows may be on later pages.
    while (firstPage || cursor) {
      const result = await refreshPatrolAppealPageInternal(cursor, serverAssignmentId);
      cursor = result.nextCursor;
      firstPage = false;
      // A cached count is not a refresh boundary: a burst can contain more
      // than one page of new rows. Continue until the fixed ID/version
      // boundary is reached or the server explicitly ends the history.
      if (result.reachedBoundary || result.ended) break;
    }
  }
  return readPatrolAppeals(assignmentId, db, Boolean(capability?.enabled));
}

/** Reads only SQLite. Sync events use this path so an event cannot create a
 * second HTTP request while the screen is already visible. */
export async function readPatrolAppeals(assignmentId: string, existingDb?: Awaited<ReturnType<typeof getDatabase>>, enabledOverride?: boolean) {
  const db = existingDb ?? await getDatabase();
  const owner = await getStoredOwnerUserId();
  const capability = enabledOverride === undefined
    ? await db.getFirstAsync<{ enabled: number }>("SELECT patrol_appeals AS enabled FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [owner ?? "", currentContourId])
    : null;
  const items = await db.getAllAsync<PatrolAppeal & { delivery: string | null }>(`SELECT a.id, a.assignment_id AS assignmentId, a.kind, a.message, a.status, a.reply, a.created_at AS createdAt, a.version,
    (SELECT o.status FROM outbox_commands o WHERE o.entity_local_id = a.id AND o.owner_user_id = a.owner_user_id AND o.contour_id = a.contour_id ORDER BY o.created_at_local DESC LIMIT 1) AS delivery
    FROM patrol_appeals a WHERE a.owner_user_id = ? AND a.contour_id = ? AND a.assignment_id = ? ORDER BY a.created_at ASC`, [owner ?? "", currentContourId, assignmentId]);
  return { enabled: enabledOverride ?? Boolean(capability?.enabled), items };
}

/** Reads one stable local page. This path never performs HTTP and is used by
 * the visible list before it asks the repository for an older server page. */
export async function readPatrolAppealsPage(
  assignmentId: string,
  kind: "message" | "cancel",
  cursor: string | null = null,
  limit = 25,
  existingDb?: Awaited<ReturnType<typeof getDatabase>>
) {
  const db = existingDb ?? await getDatabase();
  const owner = await getStoredOwnerUserId();
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const after = parseLocalAppealCursor(cursor);
  const afterSql = after ? " AND (a.created_at > ? OR (a.created_at = ? AND a.id > ?))" : "";
  const items = await db.getAllAsync<PatrolAppeal & { delivery: string | null }>(`SELECT a.id, a.assignment_id AS assignmentId, a.kind, a.message, a.status, a.reply, a.created_at AS createdAt, a.version,
    (SELECT o.status FROM outbox_commands o WHERE o.entity_local_id = a.id AND o.owner_user_id = a.owner_user_id AND o.contour_id = a.contour_id ORDER BY o.created_at_local DESC LIMIT 1) AS delivery
    FROM patrol_appeals a WHERE a.owner_user_id = ? AND a.contour_id = ? AND a.assignment_id = ? AND a.kind = ?${afterSql}
    ORDER BY a.created_at ASC, a.id ASC LIMIT ?`,
    after ? [owner ?? "", currentContourId, assignmentId, kind, after.createdAt, after.createdAt, after.id, safeLimit + 1]
      : [owner ?? "", currentContourId, assignmentId, kind, safeLimit + 1]);
  const visibleItems = items.slice(0, safeLimit);
  const capability = await db.getFirstAsync<{ enabled: number }>("SELECT patrol_appeals AS enabled FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [owner ?? "", currentContourId]);
  const last = visibleItems.at(-1);
  return { enabled: Boolean(capability?.enabled), items: visibleItems, nextCursor: items.length > safeLimit && last ? makeLocalAppealCursor(last.createdAt, last.id) : null };
}

function makeLocalAppealCursor(createdAt: string, id: string) {
  return `${createdAt}\u001f${id}`;
}

function parseLocalAppealCursor(cursor: string | null) {
  if (!cursor) return null;
  const separator = cursor.indexOf("\u001f");
  if (separator <= 0 || separator === cursor.length - 1) throw new Error("Некорректный курсор обращений.");
  return { createdAt: cursor.slice(0, separator), id: cursor.slice(separator + 1) };
}

export async function refreshPatrolAppealsPage(cursor: string | null = null, assignmentId?: string) {
  const result = await refreshPatrolAppealPageInternal(cursor, assignmentId);
  return result.nextCursor;
}

async function refreshPatrolAppealPageInternal(cursor: string | null, assignmentId?: string): Promise<AppealRefreshResult> {
  const context = await captureDataOwnerContext();
  const owner = context.ownerUserId;
  if (!owner) return { nextCursor: null, reachedBoundary: false, ended: true };
  const db = await getDatabase();
  const capability = await db.getFirstAsync<{ paging: number; assignmentPaging: number }>("SELECT patrol_appeals_paging AS paging, patrol_appeals_assignment_paging AS assignmentPaging FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [owner, currentContourId]);
  if (!capability?.paging) return { nextCursor: null, reachedBoundary: false, ended: true };
  const effectiveAssignmentId = capability.assignmentPaging ? assignmentId : undefined;
  const key = `${owner}:${currentContourId}:${context.generation}:${cursorScope(effectiveAssignmentId)}:${cursor ?? "head"}`;
  const existing = refreshInFlight.get(key);
  if (existing) return existing;
  const request = (async () => {
    const scope = cursorScope(effectiveAssignmentId);
    const state = await db.getFirstAsync<{ initialized: number; refreshMode: string; boundaryJson: string | null; inProgressCursor: string | null }>(
      "SELECT initialized, refresh_mode AS refreshMode, boundary_json AS boundaryJson, in_progress_cursor AS inProgressCursor FROM patrol_appeal_refresh_state WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?",
      [owner, currentContourId, scope]
    );
    let boundary: Map<string, number> = new Map();
    let requestCursor = cursor;
    const isHead = cursor === null;
    let headPass = isHead || state?.refreshMode === "refresh";
    if (headPass) {
      if (state?.refreshMode === "refresh" && state.inProgressCursor) {
        requestCursor = state.inProgressCursor;
        try {
          const parsed: unknown = JSON.parse(state.boundaryJson ?? "[]");
          boundary = toAppealBoundary(parsed);
        } catch {
          // A damaged boundary cannot be used as a stop marker. Restart the
          // recovery pass from the head and keep already cached rows.
          requestCursor = null;
          boundary = new Map();
        }
      } else {
        try {
          boundary = toAppealBoundary(JSON.parse(state?.boundaryJson ?? "null"));
        } catch {
          // A malformed confirmed boundary starts a recovery pass. It must
          // not be replaced by a partial page from the failed pass.
          boundary = new Map();
          headPass = true;
        }
        if (!state?.boundaryJson || boundary.size === 0 && state?.boundaryJson === null) {
          const previous = await db.getAllAsync<{ id: string; version: number }>(
            effectiveAssignmentId
              ? "SELECT id, version FROM patrol_appeals WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? ORDER BY created_at DESC, id ASC"
              : "SELECT id, version FROM patrol_appeals WHERE owner_user_id = ? AND contour_id = ? ORDER BY created_at DESC, id ASC",
            effectiveAssignmentId ? [owner, currentContourId, effectiveAssignmentId] : [owner, currentContourId]
          );
          boundary = new Map(previous.map(item => [item.id, Number(item.version)]));
        }
        const savedCursor = await db.getFirstAsync<{ nextCursor: string | null }>(
          "SELECT next_cursor AS nextCursor FROM patrol_appeal_cursors WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?",
          [owner, currentContourId, scope]
        );
        await db.runAsync(`INSERT INTO patrol_appeal_refresh_state
          (owner_user_id, contour_id, scope_key, initialized, refresh_mode, boundary_json, confirmed_cursor, in_progress_cursor, visible_limit, updated_at)
          VALUES (?, ?, ?, 1, 'refresh', ?, ?, NULL, 25, ?)
          ON CONFLICT(owner_user_id, contour_id, scope_key) DO UPDATE SET
            initialized = 1, refresh_mode = 'refresh', boundary_json = excluded.boundary_json,
            confirmed_cursor = excluded.confirmed_cursor, in_progress_cursor = NULL, visible_limit = 25, updated_at = excluded.updated_at`,
          [owner, currentContourId, scope, JSON.stringify([...boundary.entries()]), savedCursor?.nextCursor ?? null, new Date().toISOString()]);
      }
    }
    const page = await getPatrolAppealsPage(25, requestCursor, effectiveAssignmentId);
    await assertDataOwnerContext(context);
    const reachedBoundary = page.items.some(item => boundary.get(item.id) === item.version);
    const ended = !page.nextCursor;
    await withProtectedExclusiveTransactionAsync(db, async (tx) => {
      for (const item of page.items) {
        await tx.runAsync(`INSERT INTO patrol_appeals
          (id, owner_user_id, contour_id, assignment_id, kind, message, status, reply, created_at, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, owner_user_id, contour_id) DO UPDATE SET
            assignment_id = excluded.assignment_id,
            kind = excluded.kind,
            message = excluded.message,
            status = excluded.status,
            reply = excluded.reply,
            created_at = excluded.created_at,
            version = excluded.version
          WHERE excluded.version >= patrol_appeals.version`,
          [item.id, owner, currentContourId, item.assignmentId, item.kind, item.message, item.status, item.reply, item.createdAt, item.version]);
      }
      const refreshFinished = !headPass || ended || reachedBoundary;
      if (!isHead || refreshFinished) {
        await tx.runAsync(`INSERT INTO patrol_appeal_cursors (owner_user_id, contour_id, scope_key, next_cursor, updated_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, contour_id, scope_key) DO UPDATE SET next_cursor = excluded.next_cursor, updated_at = excluded.updated_at`,
          [owner, currentContourId, scope, page.nextCursor, new Date().toISOString()]);
      }
      if (headPass) {
        if (refreshFinished) {
          const saved = await tx.getAllAsync<{ id: string; version: number }>(
            effectiveAssignmentId
              ? "SELECT id, version FROM patrol_appeals WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? ORDER BY created_at DESC, id ASC"
              : "SELECT id, version FROM patrol_appeals WHERE owner_user_id = ? AND contour_id = ? ORDER BY created_at DESC, id ASC",
            effectiveAssignmentId ? [owner, currentContourId, effectiveAssignmentId] : [owner, currentContourId]
          );
          await tx.runAsync(`UPDATE patrol_appeal_refresh_state SET refresh_mode = 'initial', boundary_json = ?, confirmed_cursor = ?, in_progress_cursor = NULL, initialized = 1, updated_at = ?
            WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?`,
            [JSON.stringify(saved.map(item => [item.id, Number(item.version)])), page.nextCursor, new Date().toISOString(), owner, currentContourId, scope]);
        } else {
          await tx.runAsync(`UPDATE patrol_appeal_refresh_state SET refresh_mode = 'refresh', in_progress_cursor = ?, initialized = 1, updated_at = ?
            WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?`,
            [page.nextCursor, new Date().toISOString(), owner, currentContourId, scope]);
        }
      }
    });
    return { nextCursor: page.nextCursor, reachedBoundary, ended };
  })();
  refreshInFlight.set(key, request);
  try { return await request; }
  finally { refreshInFlight.delete(key); }
}

function toAppealBoundary(value: unknown): Map<string, number> {
  if (!Array.isArray(value)) throw new Error("Некорректная граница истории обращений.");
  const result = new Map<string, number>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "number" || !Number.isFinite(entry[1]) || result.has(entry[0])) {
      throw new Error("Некорректная граница истории обращений.");
    }
    result.set(entry[0], entry[1]);
  }
  return result;
}

/** Fetches the next older page without repeating the head request. */
export async function loadMorePatrolAppeals(assignmentId?: string) {
  const owner = await getStoredOwnerUserId();
  if (!owner) return null;
  const db = await getDatabase();
  const capability = await db.getFirstAsync<{ paging: number; assignmentPaging: number }>("SELECT patrol_appeals_paging AS paging, patrol_appeals_assignment_paging AS assignmentPaging FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [owner, currentContourId]);
  if (!capability?.paging) return null;
  const scopedAssignment = capability.assignmentPaging ? assignmentId : undefined;
  const saved = await db.getFirstAsync<{ nextCursor: string | null }>("SELECT next_cursor AS nextCursor FROM patrol_appeal_cursors WHERE owner_user_id = ? AND contour_id = ? AND scope_key = ?", [owner, currentContourId, cursorScope(scopedAssignment)]);
  return saved?.nextCursor ? refreshPatrolAppealsPage(saved.nextCursor, scopedAssignment) : null;
}

export async function createPatrolAppeal(assignmentId: string, kind: "message" | "cancel", message: string) {
  const owner = await getStoredOwnerUserId();
  const text = message.trim();
  if (!owner || !text || text.length > 2000) throw new Error("Введите сообщение или причину: от 1 до 2000 символов.");
  const db = await getDatabase();
  await withProtectedExclusiveTransactionAsync(db, async (tx) => {
    const capability = await tx.getFirstAsync<{ enabled: number }>("SELECT patrol_appeals AS enabled FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?", [owner, currentContourId]);
    if (!capability?.enabled) throw new Error("Сервер пока не поддерживает обращения. Обновите данные приложения.");
    const assignment = await tx.getFirstAsync<{ status: string }>("SELECT status FROM patrol_assignments WHERE assignment_id = ? AND owner_user_id = ? AND contour_id = ?", [assignmentId, owner, currentContourId]);
    if (!assignment) throw new Error("Обход недоступен.");
    // A cancellation is a single workflow. Ordinary messages form a chronological
    // conversation and may be sent again while a previous message is still open.
    const existing = kind === "cancel"
      ? await tx.getFirstAsync<{ id: string }>("SELECT id FROM patrol_appeals WHERE assignment_id = ? AND owner_user_id = ? AND contour_id = ? AND kind = ? AND status IN ('pending', 'open')", [assignmentId, owner, currentContourId, kind])
      : null;
    if (existing) return;
    const prior = await tx.getAllAsync<{ id: string }>(`SELECT client_operation_id AS id FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND command_type = 'acceptPatrolRequest' AND entity_local_id = ? AND status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal')`, [owner, currentContourId, assignmentId]);
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();
    await tx.runAsync("INSERT INTO patrol_appeals (id, owner_user_id, contour_id, assignment_id, kind, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)", [id, owner, currentContourId, assignmentId, kind, text, now]);
    await insertOutboxCommandInTransaction(tx, { clientOperationId: Crypto.randomUUID(), ownerUserId: owner,
      aggregateKey: `patrolAppeal:${id}`, commandType: "createPatrolAppeal", entityType: "patrolAppeal", entityLocalId: id,
      payload: { assignmentId, kind, message: text, dependencies: prior.map(item => item.id) }, createdAtLocal: now, attemptCount: 0, status: "pending" });
  });
  requestSyncAfterMutation();
}
