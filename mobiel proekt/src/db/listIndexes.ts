import type * as SQLite from 'expo-sqlite';

/** Expressions and direction must match the list ORDER BY clauses exactly. */
export async function ensureChronologicalListIndexes(db: Pick<SQLite.SQLiteDatabase, 'execAsync'>) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS ix_patrol_request_board_owner_date
      ON patrol_request_board(owner_user_id, julianday(planned_start_at) DESC, request_id ASC);
    CREATE INDEX IF NOT EXISTS ix_work_tasks_active_page
      ON work_tasks(owner_user_id, planned_at ASC, COALESCE(created_at_local, '') DESC, task_id ASC)
      WHERE status NOT IN ('completedLocal','completedServer','cancelled');
    CREATE INDEX IF NOT EXISTS ix_work_tasks_history_page
      ON work_tasks(owner_user_id, planned_at ASC, COALESCE(created_at_local, '') DESC, task_id ASC)
      WHERE status IN ('completedLocal','completedServer','cancelled');
    CREATE INDEX IF NOT EXISTS ix_shift_remarks_owner_page
      ON shift_remarks(owner_user_id, created_at_local DESC, remark_id DESC);
  `);
}
