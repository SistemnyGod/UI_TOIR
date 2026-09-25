import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";

export type WorkDraftKind = "task" | "remark" | "taskCompletion";
export type WorkDraftContext = { ownerUserId: string; contourId: string };
export type WorkDraftWriteToken = { key: string; generation: number };

const pendingWrites = new Map<string, Promise<void>>();
// Every destructive action advances the generation. A timer that was already
// scheduled before a successful submit or explicit discard must not recreate
// the draft afterwards.
const generations = new Map<string, number>();

function key(owner: string, contourId: string, employeeId: string, kind: WorkDraftKind, entityId: string) {
  return `${owner}:${contourId}:${employeeId}:${kind}:${entityId}`;
}

/** Captures the form session at scheduling time, before a debounce timer runs. */
export function captureWorkDraftWriteToken(context: WorkDraftContext, employeeId: string, kind: WorkDraftKind, entityId = "new"): WorkDraftWriteToken {
  const draftKey = key(context.ownerUserId, context.contourId, employeeId, kind, entityId);
  return { key: draftKey, generation: generations.get(draftKey) ?? 0 };
}

export async function getWorkDraftContext(): Promise<WorkDraftContext | null> {
  const ownerUserId = await getStoredOwnerUserId();
  return ownerUserId ? { ownerUserId, contourId: currentContourId } : null;
}

export async function readWorkDraftForContext<T>(context: WorkDraftContext, employeeId: string, kind: WorkDraftKind, entityId = "new"): Promise<T | null> {
  if (!context.ownerUserId || !employeeId) return null;
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>(`SELECT payload_json AS payload FROM work_form_drafts
    WHERE owner_user_id = ? AND contour_id = ? AND employee_id = ? AND form_kind = ? AND entity_id = ?`, [context.ownerUserId, context.contourId, employeeId, kind, entityId]);
  if (!row) return null;
  try { return JSON.parse(row.payload) as T; } catch { return null; }
}

export async function readWorkDraft<T>(employeeId: string, kind: WorkDraftKind, entityId = "new"): Promise<T | null> {
  const context = await getWorkDraftContext();
  return context ? readWorkDraftForContext(context, employeeId, kind, entityId) : null;
}

/** Writes for one form are serialized, so a slow SQLite write cannot overwrite newer text. */
export async function saveWorkDraft(employeeId: string, kind: WorkDraftKind, payload: unknown, entityId = "new") {
  const context = await getWorkDraftContext();
  if (context) await saveWorkDraftForContext(context, employeeId, kind, payload, entityId);
}

export async function saveWorkDraftForContext(context: WorkDraftContext, employeeId: string, kind: WorkDraftKind, payload: unknown, entityId = "new", token?: WorkDraftWriteToken): Promise<boolean> {
  if (!context.ownerUserId || !employeeId) return false;
  const draftKey = key(context.ownerUserId, context.contourId, employeeId, kind, entityId);
  const generation = token?.key === draftKey ? token.generation : (generations.get(draftKey) ?? 0);
  const previous = pendingWrites.get(draftKey) ?? Promise.resolve();
  const write = previous.then(async () => {
    if ((generations.get(draftKey) ?? 0) !== generation) return false;
    const db = await getDatabase();
    await db.runAsync(`INSERT INTO work_form_drafts (owner_user_id, contour_id, employee_id, form_kind, entity_id, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, contour_id, employee_id, form_kind, entity_id)
      DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      [context.ownerUserId, context.contourId, employeeId, kind, entityId, JSON.stringify(payload), new Date().toISOString()]);
    return true;
  });
  // Keep the same promise in the registry that is used for sequencing.  The
  // old code stored `write.catch(...)` but compared it with `write`, so the
  // entry was never removed and a later delete could wait on a stale chain.
  const trackedWrite: Promise<void> = write.then(() => undefined, () => undefined);
  pendingWrites.set(draftKey, trackedWrite);
  try { return await write; } finally {
    if (pendingWrites.get(draftKey) === trackedWrite) pendingWrites.delete(draftKey);
  }
}

/** Stops callbacks captured by the current form session before a submit starts. */
export function invalidateWorkDraftForContext(context: WorkDraftContext, employeeId: string, kind: WorkDraftKind, entityId = "new") {
  const draftKey = key(context.ownerUserId, context.contourId, employeeId, kind, entityId);
  generations.set(draftKey, (generations.get(draftKey) ?? 0) + 1);
}

/** Waits for an already queued write without creating another revision. */
export async function flushWorkDraft(employeeId: string, kind: WorkDraftKind, payload: unknown, entityId = "new") {
  await saveWorkDraft(employeeId, kind, payload, entityId);
}

export async function flushWorkDraftForContext(context: WorkDraftContext, employeeId: string, kind: WorkDraftKind, payload: unknown, entityId = "new") {
  await saveWorkDraftForContext(context, employeeId, kind, payload, entityId);
}

export async function waitForWorkDraft(employeeId: string, kind: WorkDraftKind, entityId = "new") {
  const owner = await getStoredOwnerUserId();
  if (!owner || !employeeId) return;
  await (pendingWrites.get(key(owner, currentContourId, employeeId, kind, entityId)) ?? Promise.resolve());
}

export async function waitForWorkDraftForContext(context: WorkDraftContext, employeeId: string, kind: WorkDraftKind, entityId = "new") {
  if (!context.ownerUserId || !employeeId) return;
  await (pendingWrites.get(key(context.ownerUserId, context.contourId, employeeId, kind, entityId)) ?? Promise.resolve());
}

export async function deleteWorkDraftInTransaction(tx: Pick<Awaited<ReturnType<typeof getDatabase>>, "runAsync">, owner: string, employeeId: string, kind: WorkDraftKind, entityId = "new", contourId = currentContourId) {
  const draftKey = key(owner, contourId, employeeId, kind, entityId);
  generations.set(draftKey, (generations.get(draftKey) ?? 0) + 1);
  await tx.runAsync("DELETE FROM work_form_drafts WHERE owner_user_id = ? AND contour_id = ? AND employee_id = ? AND form_kind = ? AND entity_id = ?", [owner, contourId, employeeId, kind, entityId]);
}

export async function deleteWorkDraft(employeeId: string, kind: WorkDraftKind, entityId = "new") {
  const context = await getWorkDraftContext();
  if (context) await deleteWorkDraftForContext(context, employeeId, kind, entityId);
}

export async function deleteWorkDraftForContext(context: WorkDraftContext, employeeId: string, kind: WorkDraftKind, entityId = "new") {
  const owner = context.ownerUserId;
  if (!owner || !employeeId) return;
  const draftKey = key(owner, context.contourId, employeeId, kind, entityId);
  generations.set(draftKey, (generations.get(draftKey) ?? 0) + 1);
  await (pendingWrites.get(draftKey) ?? Promise.resolve());
  const db = await getDatabase();
  await withProtectedExclusiveTransactionAsync(db, tx => deleteWorkDraftInTransaction(tx, owner, employeeId, kind, entityId, context.contourId));
}
