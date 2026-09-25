import { getOutboxResult } from '@/api/mobileApi';
import { captureDataOwnerContext, assertDataOwnerContext } from '@/auth/dataOwnerContext';
import { getDatabase, withProtectedExclusiveTransactionAsync } from '@/db/database';
import { applyOutboxResponses } from '@/db/repositories/outboxRepository';
import { continuePatrolAfterSwitchConflict } from '@/db/repositories/patrolSwitchRepository';
import { requestSyncAfterMutation } from '@/sync/mutationSyncRequest';

/** Reconcile attempted commands before the repository changes any ordering. */
export async function continuePatrolWithReconciliation(ownerUserId: string, operationId: string) {
  const context = await captureDataOwnerContext();
  if (context.ownerUserId !== ownerUserId) throw new Error('Аккаунт изменился. Откройте очередь заново.');
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT client_operation_id AS id FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ?
      AND command_type IN ('startPatrolAssignment', 'resumePatrolAssignment')
      AND json_extract(payload_json, '$.continuedAfterSwitchOperationId') = ? LIMIT 1`,
    [ownerUserId, context.contourId, operationId]);
  if (existing) return existing.id;
  const operation = await db.getFirstAsync<{ targetId: string; status: string }>(
    `SELECT json_extract(payload_json, '$.assignmentId') AS targetId, status
      FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
    [ownerUserId, context.contourId, operationId]);
  if (!operation || !['conflict', 'rejected'].includes(operation.status)) {
    throw new Error('Ожидаем определённый результат переключения.');
  }
  const attempted = await db.getAllAsync<{ id: string; status: string }>(
    `SELECT client_operation_id AS id, status FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ?
      AND aggregate_key = ? AND (status = 'sending' OR attempt_count > 0)
      AND status NOT IN ('accepted', 'duplicate', 'rejected', 'conflict')`,
    [ownerUserId, context.contourId, 'patrolAssignment:' + operation.targetId]);
  for (const command of attempted) {
    // getOutboxResult deliberately returns null only for a real 404. Network,
    // auth and protocol failures must keep the barrier intact and be surfaced
    // to the caller instead of being treated as an unknown receipt.
    let receipt;
    try {
      receipt = await getOutboxResult(command.id);
    } catch (error) {
      requestSyncAfterMutation();
      throw new Error(`Результат операции ${command.id} неизвестен: ${error instanceof Error ? error.message : "проверка квитанции не выполнена"}`);
    }
    await assertDataOwnerContext(context);
    if (!receipt || !['accepted', 'duplicate', 'rejected', 'conflict'].includes(receipt.status)) {
      // Cancellation used to archive an already-sent target command. A 404 is
      // not a receipt, so restore exactly that immutable command for normal
      // reconciliation instead of treating superseded as a known result.
      if (command.status === 'superseded') {
        await withProtectedExclusiveTransactionAsync(db, async (tx) => {
          const update = await tx.runAsync(
            `UPDATE outbox_commands
                SET status = 'retryLater', next_attempt_at = NULL,
                    retry_reason = 'unknown', last_error = ?, updated_at_local = ?
              WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?
                AND status = 'superseded' AND attempt_count > 0`,
            ['Проверяем исход операции перед продолжением другого обхода.', new Date().toISOString(), ownerUserId, context.contourId, command.id]
          );
          if (update.changes !== 1) throw new Error('Исходная операция изменилась. Откройте очередь заново.');
        });
      }
      requestSyncAfterMutation();
      throw new Error('Результат отправки ещё неизвестен. Проверяем исходные операции; данные сохранены.');
    }
    await applyOutboxResponses(ownerUserId, [receipt]);
  }
  await assertDataOwnerContext(context);
  return continuePatrolAfterSwitchConflict(ownerUserId, operationId);
}
