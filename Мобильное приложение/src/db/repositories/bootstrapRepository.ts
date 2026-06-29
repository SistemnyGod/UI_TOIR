import * as SQLite from "expo-sqlite";

import { getDatabase } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { BootstrapDto } from "@/domain/patrol/patrolTypes";
import { deletePatrolPhotoDirectory } from "@/services/fileStorageService";

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

export async function clearLocalUserData() {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await clearLocalUserTablesInTransaction(tx);
    })
  );

  await deletePatrolPhotoDirectory();
}

export async function hasLocalUserData() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(`
    SELECT
      (
        (SELECT COUNT(*) FROM users) +
        (SELECT COUNT(*) FROM patrol_assignments) +
        (SELECT COUNT(*) FROM point_results) +
        (SELECT COUNT(*) FROM files) +
        (SELECT COUNT(*) FROM outbox_commands) +
        (SELECT COUNT(*) FROM work_tasks) +
        (SELECT COUNT(*) FROM mobile_notifications) +
        (SELECT COUNT(*) FROM shift_remarks) +
        (SELECT COUNT(*) FROM mobile_action_log)
      ) AS count
  `);

  return (row?.count ?? 0) > 0;
}

export async function countBlockingLocalUserData() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(`
    SELECT
      (
        (SELECT COUNT(*) FROM patrol_assignments
          WHERE status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')) +
        (SELECT COUNT(*) FROM point_results
          WHERE sync_status <> 'synced'
            AND EXISTS (
              SELECT 1
              FROM patrol_assignments assignment
              WHERE assignment.assignment_id = point_results.assignment_id
                AND assignment.status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision')
            )) +
        (SELECT COUNT(*) FROM files
          WHERE status NOT IN ('uploaded', 'linked')) +
        (SELECT COUNT(*) FROM outbox_commands
          WHERE status IN ('pending', 'sending', 'retryLater')) +
        (SELECT COUNT(*) FROM sync_conflicts
          WHERE status NOT IN ('resolved', 'dismissed')) +
        (SELECT COUNT(*) FROM work_tasks
          WHERE status IN ('inProgress', 'paused', 'completedLocal', 'syncError')
             OR sync_status <> 'synced') +
        (SELECT COUNT(*) FROM shift_remarks
          WHERE sync_status <> 'synced')
      ) AS count
  `);

  return row?.count ?? 0;
}

export async function getLocalUserProfile(ownerUserId: string) {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    server_user_id: string;
    full_name: string;
  }>(
    `
      SELECT server_user_id, full_name
      FROM users
      WHERE server_user_id = ?
      LIMIT 1
    `,
    [ownerUserId]
  );

  return row
    ? {
        serverUserId: row.server_user_id,
        fullName: row.full_name
      }
    : null;
}

export async function saveBootstrap(bootstrap: BootstrapDto) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await saveBootstrapInTransaction(tx, bootstrap);
    })
  );
}

export async function replaceLocalUserDataWithBootstrap(bootstrap: BootstrapDto) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await clearLocalUserTablesInTransaction(tx);
      await saveBootstrapInTransaction(tx, bootstrap);
    })
  );

  await deletePatrolPhotoDirectory();
}

async function clearLocalUserTablesInTransaction(executor: SqlExecutor) {
  await executor.runAsync("DELETE FROM sync_conflicts");
  await executor.runAsync("DELETE FROM outbox_commands");
  await executor.runAsync("DELETE FROM files");
  await executor.runAsync("DELETE FROM point_results");
  await executor.runAsync("DELETE FROM assignment_route_points");
  await executor.runAsync("DELETE FROM patrol_assignments");
  await executor.runAsync("DELETE FROM patrol_request_board");
  await executor.runAsync("DELETE FROM route_points");
  await executor.runAsync("DELETE FROM routes");
  await executor.runAsync("DELETE FROM devices");
  await executor.runAsync("DELETE FROM users");
  await executor.runAsync("DELETE FROM sync_cursors");
  await executor.runAsync("DELETE FROM mobile_employees");
  await executor.runAsync("DELETE FROM emu_sections");
  await executor.runAsync("DELETE FROM work_tasks");
  await executor.runAsync("DELETE FROM mobile_notifications");
  await executor.runAsync("DELETE FROM shift_remarks");
  await executor.runAsync("DELETE FROM mobile_action_log");
}

async function saveBootstrapInTransaction(tx: SqlExecutor, bootstrap: BootstrapDto) {
  const ownerUserId = bootstrap.user.serverUserId;
  const serverRouteIds = bootstrap.routes.map((route) => route.routeId);
  const serverPointIdsByRoute = new Map<string, string[]>();
  for (const point of bootstrap.points) {
    const existing = serverPointIdsByRoute.get(point.routeId) ?? [];
    existing.push(point.pointId);
    serverPointIdsByRoute.set(point.routeId, existing);
  }
    await tx.runAsync(
      `
        INSERT INTO users (
          server_user_id,
          full_name,
          roles_json,
          permissions_json,
          updated_at_server
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(server_user_id) DO UPDATE SET
          full_name = excluded.full_name,
          roles_json = excluded.roles_json,
          permissions_json = excluded.permissions_json,
          updated_at_server = excluded.updated_at_server
      `,
      [
        ownerUserId,
        bootstrap.user.fullName,
        JSON.stringify(bootstrap.user.roles),
        JSON.stringify(bootstrap.user.permissions),
        bootstrap.user.updatedAtServer
      ]
    );

    await tx.runAsync(
      `
        INSERT INTO devices (
          device_id,
          owner_user_id,
          trusted,
          blocked_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          trusted = excluded.trusted,
          blocked_at = excluded.blocked_at
      `,
      [
        bootstrap.device.deviceId,
        ownerUserId,
        bootstrap.device.trusted ? 1 : 0,
        bootstrap.device.blockedAt
      ]
    );

    await tx.runAsync("DELETE FROM mobile_employees WHERE owner_user_id = ?", [ownerUserId]);
    for (const employee of bootstrap.boundEmployees ?? []) {
      await tx.runAsync(
        `
          INSERT INTO mobile_employees (
            employee_id,
            owner_user_id,
            full_name,
            position,
            department
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(employee_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            full_name = excluded.full_name,
            position = excluded.position,
            department = excluded.department
        `,
        [employee.employeeId, ownerUserId, employee.fullName, employee.position, employee.department]
      );
    }

    await tx.runAsync("DELETE FROM emu_sections");
    for (const section of bootstrap.emuSections ?? []) {
      await tx.runAsync(
        `
          INSERT INTO emu_sections (
            section_id,
            name,
            sort_order
          )
          VALUES (?, ?, ?)
          ON CONFLICT(section_id) DO UPDATE SET
            name = excluded.name,
            sort_order = excluded.sort_order
        `,
        [section.sectionId, section.name, section.sortOrder]
      );
    }

    const serverRequestIds = bootstrap.requestBoard.map((item) => item.requestId);
    if (serverRequestIds.length > 0) {
      const placeholders = serverRequestIds.map(() => "?").join(", ");
      await tx.runAsync(
        `
          DELETE FROM patrol_request_board
          WHERE owner_user_id = ?
            AND request_id NOT IN (${placeholders})
            AND NOT EXISTS (
              SELECT 1
              FROM patrol_assignments assignment
              WHERE assignment.request_id = patrol_request_board.request_id
                AND assignment.status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision', 'cancelledServer')
            )
        `,
        [ownerUserId, ...serverRequestIds]
      );
    } else {
      await tx.runAsync(
        `
          DELETE FROM patrol_request_board
          WHERE owner_user_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM patrol_assignments assignment
              WHERE assignment.request_id = patrol_request_board.request_id
                AND assignment.status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision', 'cancelledServer')
            )
        `,
        [ownerUserId]
      );
    }

    for (const item of bootstrap.requestBoard) {
      await tx.runAsync(
        `
          INSERT INTO patrol_request_board (
            request_id,
            display_number,
            owner_user_id,
            route_id,
            route_name,
            planned_start_at,
            assigned_full_name,
            status,
            revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(request_id) DO UPDATE SET
            display_number = excluded.display_number,
            owner_user_id = excluded.owner_user_id,
            route_id = excluded.route_id,
            route_name = excluded.route_name,
            planned_start_at = excluded.planned_start_at,
            assigned_full_name = excluded.assigned_full_name,
            status = CASE
              WHEN EXISTS (
                SELECT 1
                FROM patrol_assignments assignment
                WHERE assignment.owner_user_id = patrol_request_board.owner_user_id
                  AND assignment.request_id = patrol_request_board.request_id
                  AND assignment.status IN ('completed', 'completedServer', 'cancelled')
              ) THEN 'completed'
              WHEN excluded.status IN ('cancelled', 'cancelledServer')
                AND patrol_request_board.status NOT IN ('completedLocal', 'syncing') THEN 'cancelledServer'
              WHEN patrol_request_board.status IN ('completed', 'cancelled', 'cancelledServer') THEN patrol_request_board.status
              WHEN patrol_request_board.status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN patrol_request_board.status
              ELSE excluded.status
            END,
            revision = excluded.revision
        `,
        [
          item.requestId,
          item.displayNumber,
          ownerUserId,
          item.routeId,
          item.routeName,
          item.plannedStartAt,
          item.assignedFullName,
          item.status,
          item.revision
        ]
      );
    }

    await tx.runAsync(
      `
        UPDATE patrol_request_board
        SET status = 'completed'
        WHERE owner_user_id = ?
          AND EXISTS (
            SELECT 1
            FROM patrol_assignments assignment
            WHERE assignment.owner_user_id = patrol_request_board.owner_user_id
              AND assignment.request_id = patrol_request_board.request_id
              AND assignment.status IN ('completed', 'completedServer', 'cancelled')
          )
      `,
      [ownerUserId]
    );

    await tx.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'cancelledServer'
        WHERE owner_user_id = ?
          AND status IN ('accepted', 'inProgress', 'paused')
          AND EXISTS (
            SELECT 1
            FROM patrol_request_board request
            WHERE request.owner_user_id = patrol_assignments.owner_user_id
              AND request.request_id = patrol_assignments.request_id
              AND request.status IN ('cancelled', 'cancelledServer')
          )
      `,
      [ownerUserId]
    );

    await tx.runAsync(
      `
        UPDATE patrol_request_board
        SET status = 'cancelledServer'
        WHERE owner_user_id = ?
          AND EXISTS (
            SELECT 1
            FROM patrol_assignments assignment
            WHERE assignment.owner_user_id = patrol_request_board.owner_user_id
              AND assignment.request_id = patrol_request_board.request_id
              AND assignment.status = 'cancelledServer'
          )
      `,
      [ownerUserId]
    );

    for (const assignment of bootstrap.assignments) {
      await tx.runAsync(
        `
          INSERT INTO patrol_assignments (
            assignment_id,
            owner_user_id,
            request_id,
            route_id,
            status,
            started_at_local,
            completed_at_local,
            revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(assignment_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            request_id = excluded.request_id,
            route_id = excluded.route_id,
            status = CASE
              WHEN excluded.status IN ('cancelled', 'cancelledServer')
                AND patrol_assignments.status NOT IN ('completedLocal', 'syncing') THEN 'cancelledServer'
              WHEN patrol_assignments.status IN ('accepted', 'inProgress', 'paused', 'completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision', 'cancelledServer') THEN patrol_assignments.status
              ELSE excluded.status
            END,
            started_at_local = COALESCE(patrol_assignments.started_at_local, excluded.started_at_local),
            completed_at_local = CASE
              WHEN patrol_assignments.status = 'completedLocal' THEN patrol_assignments.completed_at_local
              ELSE excluded.completed_at_local
            END,
            revision = excluded.revision
        `,
        [
          assignment.assignmentId,
          ownerUserId,
          assignment.requestId,
          assignment.routeId,
          assignment.status,
          assignment.startedAtLocal,
          assignment.completedAtLocal,
          assignment.revision
        ]
      );
    }

    const protectedRoutes = await tx.getAllAsync<{ route_id: string }>(
      `
        SELECT DISTINCT route_id
        FROM patrol_assignments
        WHERE owner_user_id = ?
          AND status IN ('inProgress', 'completedLocal')
      `,
      [ownerUserId]
    );
    const protectedRouteIds = new Set(protectedRoutes.map((route) => route.route_id));

    for (const routeId of serverRouteIds) {
      if (protectedRouteIds.has(routeId)) {
        continue;
      }

      const pointIds = serverPointIdsByRoute.get(routeId) ?? [];
      if (pointIds.length > 0) {
        const placeholders = pointIds.map(() => "?").join(", ");
        await tx.runAsync(
          `
            DELETE FROM route_points
            WHERE route_id = ?
              AND point_id NOT IN (${placeholders})
          `,
          [routeId, ...pointIds]
        );
      } else {
        await tx.runAsync(
          `
            DELETE FROM route_points
            WHERE route_id = ?
          `,
          [routeId]
        );
      }
    }

    if (serverRouteIds.length > 0) {
      const placeholders = serverRouteIds.map(() => "?").join(", ");
      await tx.runAsync(
        `
          DELETE FROM route_points
          WHERE route_id NOT IN (${placeholders})
            AND route_id NOT IN (
              SELECT route_id
              FROM patrol_assignments
              WHERE owner_user_id = ?
                AND status IN ('inProgress', 'completedLocal')
            )
        `,
        [...serverRouteIds, ownerUserId]
      );
      await tx.runAsync(
        `
          DELETE FROM routes
          WHERE route_id NOT IN (${placeholders})
            AND route_id NOT IN (
              SELECT route_id
              FROM patrol_assignments
              WHERE owner_user_id = ?
                AND status IN ('inProgress', 'completedLocal')
            )
        `,
        [...serverRouteIds, ownerUserId]
      );
    } else {
      await tx.runAsync(
        `
          DELETE FROM route_points
          WHERE route_id NOT IN (
            SELECT route_id
            FROM patrol_assignments
            WHERE owner_user_id = ?
              AND status IN ('inProgress', 'completedLocal')
          )
        `,
        [ownerUserId]
      );
      await tx.runAsync(
        `
          DELETE FROM routes
          WHERE route_id NOT IN (
            SELECT route_id
            FROM patrol_assignments
            WHERE owner_user_id = ?
              AND status IN ('inProgress', 'completedLocal')
          )
        `,
        [ownerUserId]
      );
    }

    for (const route of bootstrap.routes) {
      await tx.runAsync(
        `
          INSERT INTO routes (
            route_id,
            name,
            version,
            allow_free_order,
            nfc_enabled,
            qr_fallback_enabled
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(route_id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            allow_free_order = excluded.allow_free_order,
            nfc_enabled = excluded.nfc_enabled,
            qr_fallback_enabled = excluded.qr_fallback_enabled
        `,
        [
          route.routeId,
          route.name,
          route.version,
          route.allowFreeOrder ? 1 : 0,
          route.nfcEnabled ? 1 : 0,
          route.qrFallbackEnabled ? 1 : 0
        ]
      );
    }

    for (const point of bootstrap.points) {
      await tx.runAsync(
        `
          INSERT INTO route_points (
            point_id,
            route_id,
            name,
            order_index,
            nfc_uid_hash,
            qr_code_hash,
            required,
            revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(point_id) DO UPDATE SET
            route_id = excluded.route_id,
            name = excluded.name,
            order_index = excluded.order_index,
            nfc_uid_hash = excluded.nfc_uid_hash,
            qr_code_hash = excluded.qr_code_hash,
            required = excluded.required,
            revision = excluded.revision
        `,
        [
          point.pointId,
          point.routeId,
          point.name,
          point.orderIndex,
          point.nfcUidHash,
          point.qrCodeHash,
          point.required ? 1 : 0,
          point.revision
        ]
      );
    }

    for (const assignment of bootstrap.assignments) {
      await tx.runAsync(
        `
          INSERT OR IGNORE INTO assignment_route_points (
            assignment_id,
            point_id,
            route_id,
            name,
            order_index,
            nfc_uid_hash,
            qr_code_hash,
            required,
            revision
          )
          SELECT
            ?,
            point_id,
            route_id,
            name,
            order_index,
            nfc_uid_hash,
            qr_code_hash,
            required,
            revision
          FROM route_points
          WHERE route_id = ?
        `,
        [assignment.assignmentId, assignment.routeId]
      );
    }

    await tx.runAsync(
      `
        INSERT INTO sync_cursors (
          scope,
          cursor_value,
          last_sync_at,
          protocol_version
        )
        VALUES ('bootstrap', ?, ?, '1.0')
        ON CONFLICT(scope) DO UPDATE SET
          cursor_value = excluded.cursor_value,
          last_sync_at = excluded.last_sync_at,
          protocol_version = excluded.protocol_version
      `,
      [bootstrap.syncCursor, bootstrap.serverTime]
    );
}
