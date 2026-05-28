import { getDatabase } from "@/db/database";
import { BootstrapDto } from "@/domain/patrol/patrolTypes";
import { deletePatrolPhotoDirectory } from "@/services/fileStorageService";

export async function clearLocalUserData() {
  const db = await getDatabase();
  await deletePatrolPhotoDirectory();

  await db.execAsync(`
    DELETE FROM sync_conflicts;
    DELETE FROM outbox_commands;
    DELETE FROM files;
    DELETE FROM point_results;
    DELETE FROM assignment_route_points;
    DELETE FROM patrol_assignments;
    DELETE FROM patrol_request_board;
    DELETE FROM route_points;
    DELETE FROM routes;
    DELETE FROM devices;
    DELETE FROM users;
    DELETE FROM sync_cursors;
    DELETE FROM work_tasks;
    DELETE FROM mobile_notifications;
    DELETE FROM shift_remarks;
  `);
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
        (SELECT COUNT(*) FROM shift_remarks)
      ) AS count
  `);

  return (row?.count ?? 0) > 0;
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
  const ownerUserId = bootstrap.user.serverUserId;
  const serverRouteIds = bootstrap.routes.map((route) => route.routeId);
  const serverPointIdsByRoute = new Map<string, string[]>();
  for (const point of bootstrap.points) {
    const existing = serverPointIdsByRoute.get(point.routeId) ?? [];
    existing.push(point.pointId);
    serverPointIdsByRoute.set(point.routeId, existing);
  }

  await db.withExclusiveTransactionAsync(async (tx) => {
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
                AND assignment.status IN ('inProgress', 'completedLocal')
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
                AND assignment.status IN ('inProgress', 'completedLocal')
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
            owner_user_id,
            route_id,
            route_name,
            planned_start_at,
            assigned_full_name,
            status,
            revision
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(request_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            route_id = excluded.route_id,
            route_name = excluded.route_name,
            planned_start_at = excluded.planned_start_at,
            assigned_full_name = excluded.assigned_full_name,
            status = CASE
              WHEN patrol_request_board.status = 'inProgress' THEN patrol_request_board.status
              ELSE excluded.status
            END,
            revision = excluded.revision
        `,
        [
          item.requestId,
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
              WHEN patrol_assignments.status IN ('inProgress', 'completedLocal') THEN patrol_assignments.status
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
  });
}
