import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase() {
  databasePromise ??= SQLite.openDatabaseAsync("patrol360-mobile.db");

  return databasePromise;
}

export async function initializeDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      server_user_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      roles_json TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      updated_at_server TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      push_token TEXT,
      trusted INTEGER NOT NULL DEFAULT 0,
      blocked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS patrol_request_board (
      request_id TEXT PRIMARY KEY,
      display_number TEXT,
      owner_user_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      route_name TEXT NOT NULL,
      planned_start_at TEXT NOT NULL,
      assigned_full_name TEXT,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patrol_assignments (
      assignment_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at_local TEXT,
      completed_at_local TEXT,
      revision INTEGER NOT NULL,
      route_version_no INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assignment_route_points (
      assignment_id TEXT NOT NULL,
      point_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      nfc_uid_hash TEXT,
      qr_code_hash TEXT,
      required INTEGER NOT NULL DEFAULT 1,
      requires_photo INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (assignment_id, point_id)
    );

    CREATE TABLE IF NOT EXISTS routes (
      route_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      allow_free_order INTEGER NOT NULL DEFAULT 1,
      nfc_enabled INTEGER NOT NULL DEFAULT 0,
      qr_fallback_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS route_points (
      point_id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      nfc_uid_hash TEXT,
      qr_code_hash TEXT,
      required INTEGER NOT NULL DEFAULT 1,
      requires_photo INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_results (
      local_result_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      point_id TEXT NOT NULL,
      status TEXT NOT NULL,
      comment TEXT,
      issue_type_id TEXT,
      severity TEXT,
      deferred_reason TEXT,
      completed_at_local TEXT,
      sync_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      client_file_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      local_path TEXT NOT NULL,
      preview_path TEXT,
      server_file_id TEXT,
      status TEXT NOT NULL,
      sha256 TEXT,
      size_bytes INTEGER,
      content_type TEXT,
      media_kind TEXT,
      assignment_id TEXT,
      point_id TEXT,
      remark_id TEXT,
      created_at_local TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox_commands (
      client_operation_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_local_id TEXT,
      entity_server_id TEXT,
      payload_json TEXT NOT NULL,
      created_at_local TEXT NOT NULL,
      updated_at_local TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_cursors (
      scope TEXT PRIMARY KEY,
      cursor_value TEXT,
      last_sync_at TEXT,
      protocol_version TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      conflict_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      client_operation_id TEXT,
      entity_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload_snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mobile_notifications (
      notification_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS mobile_action_log (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at_local TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mobile_diagnostic_reports (
      report_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at_local TEXT NOT NULL,
      sent_at_local TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS mobile_diagnostic_state (
      owner_user_id TEXT PRIMARY KEY,
      last_period_end TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_tasks (
      task_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      planned_at TEXT,
      revision INTEGER NOT NULL,
      completed_at_local TEXT,
      section_id TEXT,
      section_name TEXT,
      employee_id TEXT,
      employee_name TEXT,
      created_at_local TEXT,
      sync_status TEXT NOT NULL DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS mobile_employees (
      employee_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      position TEXT,
      department TEXT
    );

    CREATE TABLE IF NOT EXISTS emu_sections (
      section_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS shift_remarks (
      remark_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      comment TEXT NOT NULL,
      media_client_file_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      created_at_local TEXT NOT NULL,
      server_remark_id TEXT,
      section_id TEXT,
      section_name TEXT,
      employee_id TEXT,
      employee_name TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  await runLocalMigration(db, "20260526_safe_mobile_columns", async () => {
    await ensureMobileColumns(db);
  });

  await runLocalMigration(db, "20260526_assignment_snapshot_outbox_recovery", async () => {
    await ensureAssignmentSnapshotAndOutboxRecovery(db);
  });

  await runLocalMigration(db, "20260528_shift_remarks", async () => {
    await ensureShiftRemarks(db);
  });

  await runLocalMigration(db, "20260528_mobile_file_scopes", async () => {
    await ensureMobileFileScopes(db);
  });

  await runLocalMigration(db, "20260529_mobile_work_board", async () => {
    await ensureMobileWorkBoard(db);
  });

  await runLocalMigration(db, "20260602_mobile_action_log", async () => {
    await ensureMobileActionLog(db);
  });

  await runLocalMigration(db, "20260623_outbox_last_error", async () => {
    await ensureOutboxLastError(db);
  });

  await runLocalMigration(db, "20260623_mobile_hot_path_indexes", async () => {
    await ensureMobileHotPathIndexes(db);
  });

  await runLocalMigration(db, "20260630_route_point_requires_photo", async () => {
    await ensureRoutePointRequiresPhoto(db);
  });

  await runLocalMigration(db, "20260715_daily_mobile_diagnostics", async () => {
    await ensureDailyMobileDiagnostics(db);
  });

  await runLocalMigration(db, "20260715_unique_active_completion", async () => {
    await ensureUniqueActiveCompletion(db);
  });

  await runLocalMigration(db, "20260715_unique_point_results", async () => {
    await ensureUniquePointResults(db);
  });

  await runLocalMigration(db, "20260715_mobile_action_log_retention", async () => {
    await ensureMobileActionLogRetention(db);
  });
}

async function runLocalMigration(db: SQLite.SQLiteDatabase, id: string, action: () => Promise<void>) {
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM schema_migrations WHERE id = ?",
    [id]
  );
  if (existing) {
    return;
  }

  await action();
  await db.runAsync(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
    [id, new Date().toISOString()]
  );
}

async function ensureMobileColumns(db: SQLite.SQLiteDatabase) {
  await ensureColumns(db, "devices", [
    { name: "push_token", sql: "ALTER TABLE devices ADD COLUMN push_token TEXT" },
    { name: "trusted", sql: "ALTER TABLE devices ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0" },
    { name: "blocked_at", sql: "ALTER TABLE devices ADD COLUMN blocked_at TEXT" }
  ]);

  await ensureColumns(db, "patrol_request_board", [
    { name: "display_number", sql: "ALTER TABLE patrol_request_board ADD COLUMN display_number TEXT" }
  ]);

  await ensureColumns(db, "patrol_assignments", [
    { name: "completed_at_local", sql: "ALTER TABLE patrol_assignments ADD COLUMN completed_at_local TEXT" },
    { name: "revision", sql: "ALTER TABLE patrol_assignments ADD COLUMN revision INTEGER NOT NULL DEFAULT 0" },
    { name: "route_version_no", sql: "ALTER TABLE patrol_assignments ADD COLUMN route_version_no INTEGER NOT NULL DEFAULT 0" }
  ]);

  await ensureColumns(db, "route_points", [
    { name: "nfc_uid_hash", sql: "ALTER TABLE route_points ADD COLUMN nfc_uid_hash TEXT" },
    { name: "qr_code_hash", sql: "ALTER TABLE route_points ADD COLUMN qr_code_hash TEXT" },
    { name: "required", sql: "ALTER TABLE route_points ADD COLUMN required INTEGER NOT NULL DEFAULT 1" },
    { name: "requires_photo", sql: "ALTER TABLE route_points ADD COLUMN requires_photo INTEGER NOT NULL DEFAULT 0" },
    { name: "revision", sql: "ALTER TABLE route_points ADD COLUMN revision INTEGER NOT NULL DEFAULT 0" }
  ]);

  await ensureColumns(db, "point_results", [
    { name: "confirmation_type", sql: "ALTER TABLE point_results ADD COLUMN confirmation_type TEXT" },
    { name: "nfc_uid_hash", sql: "ALTER TABLE point_results ADD COLUMN nfc_uid_hash TEXT" },
    { name: "scanned_at_local", sql: "ALTER TABLE point_results ADD COLUMN scanned_at_local TEXT" },
    { name: "photo_client_file_ids_json", sql: "ALTER TABLE point_results ADD COLUMN photo_client_file_ids_json TEXT NOT NULL DEFAULT '[]'" }
  ]);

  await ensureColumns(db, "files", [
    { name: "preview_path", sql: "ALTER TABLE files ADD COLUMN preview_path TEXT" },
    { name: "server_file_id", sql: "ALTER TABLE files ADD COLUMN server_file_id TEXT" },
    { name: "sha256", sql: "ALTER TABLE files ADD COLUMN sha256 TEXT" },
    { name: "size_bytes", sql: "ALTER TABLE files ADD COLUMN size_bytes INTEGER" },
    { name: "content_type", sql: "ALTER TABLE files ADD COLUMN content_type TEXT" },
    { name: "media_kind", sql: "ALTER TABLE files ADD COLUMN media_kind TEXT" },
    { name: "assignment_id", sql: "ALTER TABLE files ADD COLUMN assignment_id TEXT" },
    { name: "point_id", sql: "ALTER TABLE files ADD COLUMN point_id TEXT" },
    { name: "remark_id", sql: "ALTER TABLE files ADD COLUMN remark_id TEXT" }
  ]);

  await ensureColumns(db, "outbox_commands", [
    { name: "entity_local_id", sql: "ALTER TABLE outbox_commands ADD COLUMN entity_local_id TEXT" },
    { name: "entity_server_id", sql: "ALTER TABLE outbox_commands ADD COLUMN entity_server_id TEXT" },
    { name: "updated_at_local", sql: "ALTER TABLE outbox_commands ADD COLUMN updated_at_local TEXT" },
    { name: "attempt_count", sql: "ALTER TABLE outbox_commands ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0" },
    { name: "last_error", sql: "ALTER TABLE outbox_commands ADD COLUMN last_error TEXT" },
    { name: "status", sql: "ALTER TABLE outbox_commands ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'" }
  ]);

  await ensureColumns(db, "work_tasks", [
    { name: "planned_at", sql: "ALTER TABLE work_tasks ADD COLUMN planned_at TEXT" },
    { name: "revision", sql: "ALTER TABLE work_tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 0" },
    { name: "completed_at_local", sql: "ALTER TABLE work_tasks ADD COLUMN completed_at_local TEXT" }
  ]);

  await ensureColumns(db, "mobile_notifications", [
    { name: "entity_type", sql: "ALTER TABLE mobile_notifications ADD COLUMN entity_type TEXT" },
    { name: "entity_id", sql: "ALTER TABLE mobile_notifications ADD COLUMN entity_id TEXT" },
    { name: "read_at", sql: "ALTER TABLE mobile_notifications ADD COLUMN read_at TEXT" }
  ]);
}

async function ensureOutboxLastError(db: SQLite.SQLiteDatabase) {
  await ensureColumns(db, "outbox_commands", [
    { name: "last_error", sql: "ALTER TABLE outbox_commands ADD COLUMN last_error TEXT" }
  ]);
}

async function ensureMobileHotPathIndexes(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS ix_patrol_request_board_owner_status_start
      ON patrol_request_board (owner_user_id, status, planned_start_at);

    CREATE INDEX IF NOT EXISTS ix_patrol_assignments_owner_status_request
      ON patrol_assignments (owner_user_id, status, request_id);

    CREATE INDEX IF NOT EXISTS ix_assignment_route_points_assignment_order
      ON assignment_route_points (assignment_id, order_index);

    CREATE INDEX IF NOT EXISTS ix_point_results_assignment_point
      ON point_results (assignment_id, point_id);

    CREATE INDEX IF NOT EXISTS ix_outbox_commands_status_created
      ON outbox_commands (status, created_at_local);

    CREATE INDEX IF NOT EXISTS ix_outbox_commands_status_updated
      ON outbox_commands (status, updated_at_local);

    CREATE INDEX IF NOT EXISTS ix_files_status_assignment_point
      ON files (status, assignment_id, point_id);
  `);
}

async function ensureRoutePointRequiresPhoto(db: SQLite.SQLiteDatabase) {
  await ensureColumns(db, "route_points", [
    { name: "requires_photo", sql: "ALTER TABLE route_points ADD COLUMN requires_photo INTEGER NOT NULL DEFAULT 0" }
  ]);

  await ensureColumns(db, "assignment_route_points", [
    { name: "requires_photo", sql: "ALTER TABLE assignment_route_points ADD COLUMN requires_photo INTEGER NOT NULL DEFAULT 0" }
  ]);
}

async function ensureDailyMobileDiagnostics(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS mobile_diagnostic_reports (
      report_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at_local TEXT NOT NULL,
      sent_at_local TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS mobile_diagnostic_state (
      owner_user_id TEXT PRIMARY KEY,
      last_period_end TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_mobile_diagnostic_reports_owner_status
      ON mobile_diagnostic_reports (owner_user_id, status, created_at_local);
  `);
}

async function ensureUniqueActiveCompletion(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    UPDATE outbox_commands
    SET status = 'superseded',
        last_error = 'Операция заменена более новой версией отчета при восстановлении очереди.',
        updated_at_local = COALESCE(updated_at_local, created_at_local)
    WHERE rowid IN (
      SELECT rowid
      FROM (
        SELECT
          rowid,
          ROW_NUMBER() OVER (
            PARTITION BY owner_user_id, entity_local_id
            ORDER BY
              CASE status
                WHEN 'accepted' THEN 0
                WHEN 'duplicate' THEN 1
                ELSE 2
              END,
              created_at_local DESC
          ) AS duplicate_no
        FROM outbox_commands
        WHERE command_type = 'completePatrolAssignment'
          AND entity_local_id IS NOT NULL
          AND status IN ('pending', 'sending', 'retryLater', 'accepted', 'duplicate')
      ) duplicates
      WHERE duplicate_no > 1
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_active_completion_owner_assignment
      ON outbox_commands (owner_user_id, entity_local_id)
      WHERE command_type = 'completePatrolAssignment'
        AND entity_local_id IS NOT NULL
        AND status IN ('pending', 'sending', 'retryLater', 'accepted', 'duplicate');
  `);
}

async function ensureUniquePointResults(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    -- Keep the most recently completed result for a point, but preserve a photo
    -- that was attached to an older duplicate record before removing duplicates.
    UPDATE point_results AS canonical
    SET photo_client_file_ids_json = (
      SELECT duplicate.photo_client_file_ids_json
      FROM point_results duplicate
      WHERE duplicate.owner_user_id = canonical.owner_user_id
        AND duplicate.assignment_id = canonical.assignment_id
        AND duplicate.point_id = canonical.point_id
        AND COALESCE(duplicate.photo_client_file_ids_json, '[]') <> '[]'
      ORDER BY COALESCE(duplicate.completed_at_local, duplicate.scanned_at_local, '') DESC, duplicate.rowid DESC
      LIMIT 1
    )
    WHERE rowid IN (
      SELECT rowid
      FROM (
        SELECT
          rowid,
          ROW_NUMBER() OVER (
            PARTITION BY owner_user_id, assignment_id, point_id
            ORDER BY
              CASE WHEN completed_at_local IS NULL THEN 1 ELSE 0 END,
              COALESCE(completed_at_local, scanned_at_local, '') DESC,
              rowid DESC
          ) AS duplicate_no
        FROM point_results
      ) ranked
      WHERE duplicate_no = 1
    )
      AND COALESCE(photo_client_file_ids_json, '[]') = '[]'
      AND EXISTS (
        SELECT 1
        FROM point_results duplicate
        WHERE duplicate.owner_user_id = canonical.owner_user_id
          AND duplicate.assignment_id = canonical.assignment_id
          AND duplicate.point_id = canonical.point_id
          AND COALESCE(duplicate.photo_client_file_ids_json, '[]') <> '[]'
      );

    DELETE FROM point_results
    WHERE rowid IN (
      SELECT rowid
      FROM (
        SELECT
          rowid,
          ROW_NUMBER() OVER (
            PARTITION BY owner_user_id, assignment_id, point_id
            ORDER BY
              CASE WHEN completed_at_local IS NULL THEN 1 ELSE 0 END,
              COALESCE(completed_at_local, scanned_at_local, '') DESC,
              rowid DESC
          ) AS duplicate_no
        FROM point_results
      ) ranked
      WHERE duplicate_no > 1
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_point_results_owner_assignment_point
      ON point_results (owner_user_id, assignment_id, point_id);
  `);
}

async function ensureAssignmentSnapshotAndOutboxRecovery(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS assignment_route_points (
      assignment_id TEXT NOT NULL,
      point_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      nfc_uid_hash TEXT,
      qr_code_hash TEXT,
      required INTEGER NOT NULL DEFAULT 1,
      requires_photo INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (assignment_id, point_id)
    );
  `);

  await ensureColumns(db, "assignment_route_points", [
    { name: "nfc_uid_hash", sql: "ALTER TABLE assignment_route_points ADD COLUMN nfc_uid_hash TEXT" },
    { name: "qr_code_hash", sql: "ALTER TABLE assignment_route_points ADD COLUMN qr_code_hash TEXT" },
    { name: "required", sql: "ALTER TABLE assignment_route_points ADD COLUMN required INTEGER NOT NULL DEFAULT 1" },
    { name: "requires_photo", sql: "ALTER TABLE assignment_route_points ADD COLUMN requires_photo INTEGER NOT NULL DEFAULT 0" },
    { name: "revision", sql: "ALTER TABLE assignment_route_points ADD COLUMN revision INTEGER NOT NULL DEFAULT 0" }
  ]);

  await ensureColumns(db, "outbox_commands", [
    { name: "updated_at_local", sql: "ALTER TABLE outbox_commands ADD COLUMN updated_at_local TEXT" }
  ]);

  await db.execAsync(`
    INSERT OR IGNORE INTO assignment_route_points (
      assignment_id,
      point_id,
      route_id,
      name,
      order_index,
      nfc_uid_hash,
      qr_code_hash,
      required,
      requires_photo,
      revision
    )
    SELECT
      assignment.assignment_id,
      point.point_id,
      point.route_id,
      point.name,
      point.order_index,
      point.nfc_uid_hash,
      point.qr_code_hash,
      point.required,
      point.requires_photo,
      point.revision
    FROM patrol_assignments assignment
    INNER JOIN route_points point ON point.route_id = assignment.route_id
    WHERE assignment.status IN ('inProgress', 'completedLocal');
  `);
}

async function ensureShiftRemarks(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS shift_remarks (
      remark_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      comment TEXT NOT NULL,
      media_client_file_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      created_at_local TEXT NOT NULL,
      server_remark_id TEXT
    );
  `);

  await ensureColumns(db, "shift_remarks", [
    { name: "media_client_file_ids_json", sql: "ALTER TABLE shift_remarks ADD COLUMN media_client_file_ids_json TEXT NOT NULL DEFAULT '[]'" },
    { name: "status", sql: "ALTER TABLE shift_remarks ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'" },
    { name: "server_remark_id", sql: "ALTER TABLE shift_remarks ADD COLUMN server_remark_id TEXT" }
  ]);
}

async function ensureMobileFileScopes(db: SQLite.SQLiteDatabase) {
  await ensureColumns(db, "files", [
    { name: "content_type", sql: "ALTER TABLE files ADD COLUMN content_type TEXT" },
    { name: "media_kind", sql: "ALTER TABLE files ADD COLUMN media_kind TEXT" },
    { name: "remark_id", sql: "ALTER TABLE files ADD COLUMN remark_id TEXT" }
  ]);
}

async function ensureMobileWorkBoard(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS mobile_employees (
      employee_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      position TEXT,
      department TEXT
    );

    CREATE TABLE IF NOT EXISTS emu_sections (
      section_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await ensureColumns(db, "work_tasks", [
    { name: "section_id", sql: "ALTER TABLE work_tasks ADD COLUMN section_id TEXT" },
    { name: "section_name", sql: "ALTER TABLE work_tasks ADD COLUMN section_name TEXT" },
    { name: "employee_id", sql: "ALTER TABLE work_tasks ADD COLUMN employee_id TEXT" },
    { name: "employee_name", sql: "ALTER TABLE work_tasks ADD COLUMN employee_name TEXT" },
    { name: "created_at_local", sql: "ALTER TABLE work_tasks ADD COLUMN created_at_local TEXT" },
    { name: "sync_status", sql: "ALTER TABLE work_tasks ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced'" }
  ]);

  await ensureColumns(db, "shift_remarks", [
    { name: "section_id", sql: "ALTER TABLE shift_remarks ADD COLUMN section_id TEXT" },
    { name: "section_name", sql: "ALTER TABLE shift_remarks ADD COLUMN section_name TEXT" },
    { name: "employee_id", sql: "ALTER TABLE shift_remarks ADD COLUMN employee_id TEXT" },
    { name: "employee_name", sql: "ALTER TABLE shift_remarks ADD COLUMN employee_name TEXT" },
    { name: "sync_status", sql: "ALTER TABLE shift_remarks ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'" }
  ]);
}

async function ensureMobileActionLog(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS mobile_action_log (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at_local TEXT NOT NULL
    );
  `);

  await ensureColumns(db, "mobile_action_log", [
    { name: "owner_user_id", sql: "ALTER TABLE mobile_action_log ADD COLUMN owner_user_id TEXT" },
    { name: "entity_type", sql: "ALTER TABLE mobile_action_log ADD COLUMN entity_type TEXT" },
    { name: "entity_id", sql: "ALTER TABLE mobile_action_log ADD COLUMN entity_id TEXT" },
    { name: "payload_json", sql: "ALTER TABLE mobile_action_log ADD COLUMN payload_json TEXT" }
  ]);
}

async function ensureMobileActionLogRetention(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS ix_mobile_action_log_owner_created
      ON mobile_action_log (owner_user_id, created_at_local DESC);
  `);
}

async function ensureColumns(db: SQLite.SQLiteDatabase, tableName: string, additions: { name: string; sql: string }[]) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  const existing = new Set(columns.map((column) => column.name));

  for (const addition of additions) {
    if (!existing.has(addition.name)) {
      await db.execAsync(addition.sql);
    }
  }
}
