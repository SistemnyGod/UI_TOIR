import type * as SQLite from 'expo-sqlite';

/**
 * Indexes for the reads that run on every screen focus and sync pass. Partial
 * index predicates must match the query terms literally, or SQLite ignores them:
 * - notifications feed, badge and read sync: owner + newest first, unread, pending read;
 * - reports feed: owner + contour among assignments with a local report;
 * - outbox dispatch: only pending/retryLater rows in queue order, so the walk
 *   no longer visits the accepted history that grows with every patrol;
 * - outbox barrier: earlier unacknowledged commands of the same aggregate.
 */
export async function ensureHotQueryIndexes(db: Pick<SQLite.SQLiteDatabase, 'execAsync'>) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS ix_mobile_notifications_owner_created
      ON mobile_notifications(owner_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ix_mobile_notifications_owner_unread
      ON mobile_notifications(owner_user_id) WHERE read_at IS NULL;
    CREATE INDEX IF NOT EXISTS ix_mobile_notifications_owner_read_pending
      ON mobile_notifications(owner_user_id) WHERE read_sync_pending = 1;
    CREATE INDEX IF NOT EXISTS ix_patrol_assignments_owner_contour_report
      ON patrol_assignments(owner_user_id, contour_id) WHERE local_report_present = 1;
    CREATE INDEX IF NOT EXISTS ix_outbox_commands_dispatchable
      ON outbox_commands(owner_user_id, contour_id, sequence_no, created_at_local, client_operation_id)
      WHERE status IN ('pending', 'retryLater');
    CREATE INDEX IF NOT EXISTS ix_outbox_commands_unacknowledged_aggregate
      ON outbox_commands(owner_user_id, contour_id, aggregate_key, sequence_no)
      WHERE status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal');
  `);
}
