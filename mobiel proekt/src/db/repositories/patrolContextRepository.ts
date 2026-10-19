import * as SecureStore from "expo-secure-store";
import type * as SQLite from "expo-sqlite";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { assertDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";

export type PatrolDeviceContext = {
  assignmentId: string | null;
};

type ContextSqlExecutor = Pick<SQLite.SQLiteDatabase, "getFirstAsync" | "runAsync">;

function storageKey(ownerUserId: string) {
  return `patrol360.patrol-context.${currentContourId}.${ownerUserId}`;
}

export async function getPatrolDeviceContext(): Promise<PatrolDeviceContext> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) return { assignmentId: null };
  return readContext(ownerUserId);
}

async function readContext(ownerUserId: string): Promise<PatrolDeviceContext> {
  const db = await getDatabase();
  const stored = await db.getFirstAsync<{ assignmentId: string | null }>(
    "SELECT assignment_id AS assignmentId FROM patrol_device_context WHERE owner_user_id = ? AND contour_id = ?",
    [ownerUserId, currentContourId]
  );
  if (stored) return { assignmentId: stored.assignmentId };

  // One-time import for devices upgraded from the SecureStore-only context.
  const raw = await SecureStore.getItemAsync(storageKey(ownerUserId));
  if (!raw) return { assignmentId: null };
  try {
    const parsed = JSON.parse(raw) as Partial<PatrolDeviceContext>;
    const imported = {
      assignmentId: typeof parsed.assignmentId === "string" ? parsed.assignmentId : null
    };
    await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async tx => {
      await tx.runAsync(`INSERT OR IGNORE INTO patrol_device_context
        (owner_user_id, contour_id, employee_id, assignment_id, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [ownerUserId, currentContourId, null, imported.assignmentId, new Date().toISOString()]);
    }));
    return imported;
  } catch {
    await SecureStore.deleteItemAsync(storageKey(ownerUserId)).catch(() => undefined);
    return { assignmentId: null };
  }
}

let pendingWrite = Promise.resolve();

export async function setPatrolDeviceContext(update: Partial<PatrolDeviceContext>) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) return;
  // Capture the owner before queueing. A login change must not copy another
  // account's selection into this key.
  const write = pendingWrite.then(async () => {
    const db = await getDatabase();
    await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async tx => {
      await setPatrolDeviceContextInTransaction(tx, ownerUserId, update);
    }));
    // Keep the old key as a recoverable compatibility copy for older builds.
    await SecureStore.setItemAsync(storageKey(ownerUserId), JSON.stringify(await readContext(ownerUserId)));
  });
  pendingWrite = write.catch(() => undefined);
  return write;
}

/** Updates the durable context as part of a caller's existing SQLite transaction. */
export async function setPatrolDeviceContextInTransaction(
  tx: ContextSqlExecutor,
  ownerUserId: string,
  update: Partial<PatrolDeviceContext>
) {
  const current = await tx.getFirstAsync<{ assignmentId: string | null }>(
    "SELECT assignment_id AS assignmentId FROM patrol_device_context WHERE owner_user_id = ? AND contour_id = ?",
    [ownerUserId, currentContourId]
  );
  const next = { assignmentId: current?.assignmentId ?? null, ...update };
  await tx.runAsync(`INSERT INTO patrol_device_context
    (owner_user_id, contour_id, employee_id, assignment_id, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, contour_id) DO UPDATE SET employee_id = excluded.employee_id,
      assignment_id = excluded.assignment_id, updated_at = excluded.updated_at`,
    [ownerUserId, currentContourId, null, next.assignmentId, new Date().toISOString()]);
}

export function selectCurrentPatrol(assignmentId: string | null) {
  return setPatrolDeviceContext({ assignmentId });
}

/** Clears only the assignment that is still selected on this device. */
export async function clearCurrentPatrolIfMatches(scope: DataOwnerContext, assignmentId: string, isCurrent: () => boolean = () => true) {
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  const db = await getDatabase();
  let cleared = false;
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async tx => {
    await assertDataOwnerContext(scope);
    if (!isCurrent()) return;
    const current = await tx.getFirstAsync<{ assignmentId: string | null }>(
      "SELECT assignment_id AS assignmentId FROM patrol_device_context WHERE owner_user_id = ? AND contour_id = ?",
      [ownerUserId, currentContourId]
    );
    if (current?.assignmentId !== assignmentId) return;
    await assertDataOwnerContext(scope);
    if (!isCurrent()) return;
    await tx.runAsync(
      "UPDATE patrol_device_context SET assignment_id = NULL, updated_at = ? WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
      [new Date().toISOString(), ownerUserId, currentContourId, assignmentId]
    );
    cleared = true;
    await assertDataOwnerContext(scope);
    if (!isCurrent()) throw new Error('Экран изменился. Выбор заявки сохранён.');
  }));
  return cleared;
}

export async function selectPatrolForContext(scope: DataOwnerContext, assignmentId: string, isCurrent: () => boolean = () => true) {
  await assertDataOwnerContext(scope);
  const db = await getDatabase();
  await withProtectedExclusiveTransactionAsync(db, async tx => {
    await assertDataOwnerContext(scope);
    if (!isCurrent()) throw new Error('Выбор заявки закрыт. Повторите выбор.');
    await setPatrolDeviceContextInTransaction(tx, scope.ownerUserId, { assignmentId });
    await assertDataOwnerContext(scope);
    if (!isCurrent()) throw new Error('Выбор заявки закрыт. Повторите выбор.');
  });
}
