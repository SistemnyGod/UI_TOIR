import type { AssignmentScanPolicy, ActiveAssignment, PointListItem, AssignmentProgress, ReportPreviewPoint, ReportProblem, ReportReadiness } from './patrolRepositoryTypes';

import * as SQLite from "expo-sqlite";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";

import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";

import { listAssignmentPointsOwnedSql } from "@/db/repositories/patrolPointOwnershipQueries";
import { parseStringArray } from "@/db/repositories/patrolPersistence";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";

import { isTerminalPointStatus } from "@/domain/patrol/reportReadinessPolicy";
import { evaluatePointEvidence } from '@/domain/patrol/pointEvidenceReadiness';

async function requireOwnerUserId() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Выполните вход в мобильный аккаунт.");
  }

  return ownerUserId;
}
type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;
const frozenSnapshotAssignmentStatuses = new Set(["releasePending", "inProgress", "paused", "completedLocal", "syncing", "syncError", "authRequired", "needsDispatcherDecision"]);

export async function getActiveAssignment(context: { employeeId?: string | null; assignmentId?: string | null } = {}) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  const assignment = await db.getFirstAsync<ActiveAssignment>(
    `
      SELECT
        assignment.employee_id AS employeeId,
        request.assigned_full_name AS assignedFullName,
        assignment.assignment_id AS assignmentId,
        assignment.request_id AS requestId,
        assignment.route_id AS routeId,
        COALESCE(route.name, request.route_name, '') AS routeName,
        assignment.status,
        assignment.started_at_local AS startedAtLocal,
        assignment.completed_at_local AS completedAtLocal,
        assignment.revision,
        assignment.route_version_no AS routeVersionNo,
        assignment.snapshot_version AS snapshotVersion,
        assignment.snapshot_created_at AS snapshotCreatedAt,
        assignment.snapshot_source AS snapshotSource,
        assignment.snapshot_allow_free_order AS snapshotAllowFreeOrder,
        assignment.snapshot_nfc_enabled AS snapshotNfcEnabled,
        assignment.snapshot_qr_fallback_enabled AS snapshotQrFallbackEnabled
      FROM patrol_assignments assignment
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request ON request.request_id = assignment.request_id
      WHERE assignment.owner_user_id = ?
        AND (assignment.contour_id = ? OR assignment.contour_id IS NULL)
        AND (? IS NULL OR assignment.employee_id = ?)
        AND (? IS NULL OR assignment.assignment_id = ?)
        AND assignment.status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer', 'conflict')
      ORDER BY
        CASE
          WHEN assignment.status = 'inProgress' THEN 0
          WHEN assignment.status = 'paused' THEN 1
          WHEN assignment.status IN ('completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN 2
          WHEN assignment.status = 'accepted' THEN 3
          WHEN assignment.status = 'releasePending' THEN 4
          ELSE 5
        END,
        assignment.started_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, currentContourId, context.employeeId ?? null, context.employeeId ?? null, context.assignmentId ?? null, context.assignmentId ?? null]
  );

  if (assignment) {
    await repairAssignmentContourBinding(db, assignment.assignmentId, ownerUserId);
  }

  return assignment;
}

export async function getAssignmentByRequestId(requestId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  const assignment = await db.getFirstAsync<ActiveAssignment>(
    `
      SELECT
        assignment.employee_id AS employeeId,
        request.assigned_full_name AS assignedFullName,
        assignment.assignment_id AS assignmentId,
        assignment.request_id AS requestId,
        assignment.route_id AS routeId,
        COALESCE(route.name, request.route_name, '') AS routeName,
        assignment.status,
        assignment.started_at_local AS startedAtLocal,
        assignment.completed_at_local AS completedAtLocal,
        assignment.revision,
        assignment.route_version_no AS routeVersionNo,
        assignment.snapshot_version AS snapshotVersion,
        assignment.snapshot_created_at AS snapshotCreatedAt,
        assignment.snapshot_source AS snapshotSource,
        assignment.snapshot_allow_free_order AS snapshotAllowFreeOrder,
        assignment.snapshot_nfc_enabled AS snapshotNfcEnabled,
        assignment.snapshot_qr_fallback_enabled AS snapshotQrFallbackEnabled
      FROM patrol_assignments assignment
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request ON request.request_id = assignment.request_id
      WHERE assignment.owner_user_id = ?
        AND assignment.request_id = ?
        AND (assignment.contour_id = ? OR assignment.contour_id IS NULL)
        AND assignment.status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer', 'conflict')
      ORDER BY
        CASE
          WHEN assignment.status = 'inProgress' THEN 0
          WHEN assignment.status = 'paused' THEN 1
          WHEN assignment.status IN ('completedLocal', 'syncing', 'syncError', 'authRequired', 'needsDispatcherDecision') THEN 2
          WHEN assignment.status = 'accepted' THEN 3
          WHEN assignment.status = 'releasePending' THEN 4
          ELSE 5
        END,
        assignment.started_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, requestId, currentContourId]
  );

  if (assignment) {
    await repairAssignmentContourBinding(db, assignment.assignmentId, ownerUserId);
  }

  return assignment;
}

async function repairEmptyAssignmentSnapshot(
  db: SQLite.SQLiteDatabase,
  assignmentId: string,
  ownerUserId: string,
  contourId: string
) {
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await tx.runAsync(
        `
          INSERT OR IGNORE INTO assignment_route_points (
            assignment_id, point_id, route_id, name, description, instruction,
            order_index, nfc_uid_hash, qr_code_hash, required, requires_photo, revision
          )
          SELECT
            assignment.assignment_id, point.point_id, point.route_id, point.name,
            point.description, point.instruction, point.order_index, point.nfc_uid_hash,
            point.qr_code_hash, point.required, point.requires_photo, point.revision
          FROM patrol_assignments assignment
          JOIN route_points point ON point.route_id = assignment.route_id
          WHERE assignment.assignment_id = ?
            AND assignment.owner_user_id = ?
            AND assignment.contour_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM assignment_route_points existing
              WHERE existing.assignment_id = assignment.assignment_id
            )
        `,
        [assignmentId, ownerUserId, contourId]
      );
    })
  );
}

export async function listAssignmentPoints(assignmentId: string, ownerUserId: string, contourId: string) {
  const db = await getDatabase();
  await repairAssignmentContourBinding(db, assignmentId, ownerUserId);

  let rows = await db.getAllAsync<{
    pointId: string;
    routeId: string;
    name: string;
    description: string | null;
    instruction: string | null;
    orderIndex: number;
    required: number;
    requiresPhoto: number;
    status: PointListItem["status"];
    comment: string | null;
  manualReason?: string | null;
    issueTypeId: string | null;
    confirmationType: PointListItem["confirmationType"];
    photoClientFileIdsJson: string | null;
  }>(
    listAssignmentPointsOwnedSql,
    [assignmentId, ownerUserId, contourId]
  );
  if (rows.length === 0) {
    await repairEmptyAssignmentSnapshot(db, assignmentId, ownerUserId, contourId);
    rows = await db.getAllAsync<(typeof rows)[number]>(
      listAssignmentPointsOwnedSql,
      [assignmentId, ownerUserId, contourId]
    );
  }

  return rows.map((row) => ({
    pointId: row.pointId,
    routeId: row.routeId,
    name: row.name,
    description: row.description,
    instruction: row.instruction,
    orderIndex: row.orderIndex,
    required: row.required === 1,
    requiresPhoto: row.requiresPhoto === 1,
    status: row.status,
    comment: row.comment,
    manualReason: row.manualReason,
    issueTypeId: row.issueTypeId,
    confirmationType: row.confirmationType,
    photoClientFileIds: parseStringArray(row.photoClientFileIdsJson)
  } satisfies PointListItem));
}

async function hasConsistentAssignmentSnapshot(
  db: SqlExecutor,
  assignment: ActiveAssignment,
  points: PointListItem[],
  ownerUserId: string
): Promise<boolean> {
  if (points.length === 0 || points.some((point) => point.routeId !== assignment.routeId)) {
    return false;
  }

  const pointIds = new Set(points.map((point) => point.pointId));
  if (pointIds.size !== points.length) {
    return false;
  }

  const orphanResult = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM point_results result
      LEFT JOIN assignment_route_points point
        ON point.assignment_id = result.assignment_id
       AND point.point_id = result.point_id
      WHERE result.owner_user_id = ?
        AND result.assignment_id = ?
        AND point.point_id IS NULL
    `,
    [ownerUserId, assignment.assignmentId]
  );

  return (orphanResult?.count ?? 0) === 0;
}

export async function getReportReadiness(assignmentId: string): Promise<ReportReadiness> {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const assignment = await getAssignmentById(assignmentId);
  const points = await listAssignmentPoints(assignmentId, ownerUserId, currentContourId);
  const problems: ReportProblem[] = [];

  // An accepted assignment may be refreshed to the current route version.
  if (assignment?.status === "accepted" && assignment.routeVersionNo) {
    const route = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM routes WHERE route_id = ? LIMIT 1",
      [assignment.routeId]
    );
    if (route && route.version !== assignment.routeVersionNo) {
      problems.push({
        pointId: "route-version",
        pointName: assignment.routeName,
        orderIndex: 0,
        reason: "\u041c\u0430\u0440\u0448\u0440\u0443\u0442 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d \u043f\u043e\u0441\u043b\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f. \u0421\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0438\u0440\u0443\u0439\u0442\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0438 \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u0435 \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u0447\u0435\u043a-\u043b\u0438\u0441\u0442.",
      });
    }
  }

  // Once work has started, the assignment owns an immutable snapshot.
  // The current routes.version is intentionally not consulted here.
  if (assignment && frozenSnapshotAssignmentStatuses.has(assignment.status)) {
    if (assignment.snapshotVersion !== assignment.routeVersionNo) {
      problems.push({
        pointId: "snapshot-version",
        pointName: assignment.routeName,
        orderIndex: 0,
        reason: "\u0421\u043d\u0438\u043c\u043e\u043a \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0430 \u043d\u0430\u0447\u0430\u0442\u043e\u0433\u043e \u043e\u0431\u0445\u043e\u0434\u0430 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 \u0441 \u0432\u0435\u0440\u0441\u0438\u0435\u0439 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f.",
      });
    }

    const snapshotIsConsistent = await hasConsistentAssignmentSnapshot(db, assignment, points, ownerUserId);
    if (!snapshotIsConsistent) {
      problems.push({
        pointId: "snapshot-integrity",
        pointName: assignment.routeName,
        orderIndex: 0,
        reason: "\u0421\u043d\u0438\u043c\u043e\u043a \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0430 \u043d\u0430\u0447\u0430\u0442\u043e\u0433\u043e \u043e\u0431\u0445\u043e\u0434\u0430 \u043f\u043e\u0432\u0440\u0435\u0436\u0434\u0451\u043d \u0438\u043b\u0438 \u043d\u0435\u043f\u043e\u043b\u043e\u043d.",
      });
    }
  }

  if (assignment && points.length === 0) {
    problems.push({
      pointId: "route-empty",
      pointName: assignment.routeName,
      orderIndex: 0,
      reason: "Маршрут не загружен на телефон"
    });
  }

  // Same points as above: reading them again would repeat the whole route query.
  const progress = summarizeAssignmentProgress(points);
  const reportPointReadiness = evaluatePointEvidence(points);

  for (const problem of reportPointReadiness.problems) {
    problems.push(problem);
  }

  return {
    assignment,
    progress,
    problems,
    ready: assignment !== null
      && reportPointReadiness.ready
      && problems.length === 0
  };
}

/** Every point of the report with its result and attachment counts, read from this phone only. */
export async function getReportPreviewPoints(assignmentId: string): Promise<ReportPreviewPoint[]> {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const points = await listAssignmentPoints(assignmentId, ownerUserId, currentContourId);
  const files = await db.getAllAsync<{ clientFileId: string; mediaKind: string | null; contentType: string | null }>(
    `
      SELECT client_file_id AS clientFileId, media_kind AS mediaKind, content_type AS contentType
      FROM files
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND assignment_id = ?
    `,
    [ownerUserId, currentContourId, assignmentId]
  );
  const filesById = new Map(files.map((file) => [file.clientFileId, file]));

  return points.map((point) => {
    const referenced = Array.from(new Set(point.photoClientFileIds)).map((clientFileId) => filesById.get(clientFileId));
    const isVideo = (file: (typeof files)[number]) => file.mediaKind === "video" || (!file.mediaKind && file.contentType === "video/mp4");
    return {
      ...point,
      photoCount: referenced.filter((file) => file && !isVideo(file)).length,
      videoCount: referenced.filter((file) => file && isVideo(file)).length,
      missingAttachmentCount: referenced.filter((file) => !file).length
    };
  });
}

export async function getAssignmentProgress(assignmentId: string): Promise<AssignmentProgress> {
  const ownerUserId = await requireOwnerUserId();
  return summarizeAssignmentProgress(await listAssignmentPoints(assignmentId, ownerUserId, currentContourId));
}

function summarizeAssignmentProgress(points: PointListItem[]): AssignmentProgress {
  return {
    total: points.length,
    inspected: points.filter((point) => point.status === "ok" || point.status === "issue").length,
    completed: points.filter((point) => isTerminalPointStatus(point.status)).length,
    deferred: points.filter((point) => point.status === "deferred").length,
    issues: points.filter((point) => point.status === "issue").length,
    skipped: points.filter((point) => point.status === "skipped").length
  };
}

export async function getActiveAssignmentWithProgress(context: { employeeId?: string | null; assignmentId?: string | null } = {}) {
  const assignment = await getActiveAssignment(context);
  if (!assignment) {
    return null;
  }

  return {
    assignment,
    progress: await getAssignmentProgress(assignment.assignmentId)
  };
}

export async function getAssignmentScanPolicy(assignmentId: string): Promise<AssignmentScanPolicy> {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const row = await db.getFirstAsync<{
    status: string;
    snapshotAllowFreeOrder: number | null;
    snapshotNfcEnabled: number | null;
    snapshotQrFallbackEnabled: number | null;
    allowFreeOrder: number | null;
    nfcEnabled: number | null;
    qrFallbackEnabled: number | null;
  }>(
    `
      SELECT
        assignment.status,
        assignment.snapshot_allow_free_order AS snapshotAllowFreeOrder,
        assignment.snapshot_nfc_enabled AS snapshotNfcEnabled,
        assignment.snapshot_qr_fallback_enabled AS snapshotQrFallbackEnabled,
        COALESCE(route.allow_free_order, 1) AS allowFreeOrder,
        COALESCE(route.nfc_enabled, 0) AS nfcEnabled,
        COALESCE(route.qr_fallback_enabled, 1) AS qrFallbackEnabled
      FROM patrol_assignments assignment
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      WHERE assignment.owner_user_id = ?
        AND assignment.assignment_id = ?
        AND assignment.contour_id = ?
      LIMIT 1
    `,
    [ownerUserId, assignmentId, currentContourId]
  );

  if (row && frozenSnapshotAssignmentStatuses.has(row.status)) {
    return {
      allowFreeOrder: row.snapshotAllowFreeOrder !== 0,
      nfcEnabled: row.snapshotNfcEnabled === 1,
      qrFallbackEnabled: row.snapshotQrFallbackEnabled !== 0
    };
  }

  return {
    allowFreeOrder: row?.allowFreeOrder !== 0,
    nfcEnabled: row?.nfcEnabled === 1,
    qrFallbackEnabled: row?.qrFallbackEnabled !== 0
  };
}

export async function getAssignmentById(assignmentId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  await repairAssignmentContourBinding(db, assignmentId, ownerUserId);

  return db.getFirstAsync<ActiveAssignment>(
    `
      SELECT
        assignment.employee_id AS employeeId,
        request.assigned_full_name AS assignedFullName,
        assignment.assignment_id AS assignmentId,
        assignment.request_id AS requestId,
        assignment.route_id AS routeId,
        COALESCE(route.name, request.route_name, '') AS routeName,
        assignment.status,
        assignment.started_at_local AS startedAtLocal,
        assignment.completed_at_local AS completedAtLocal,
        assignment.revision,
        assignment.route_version_no AS routeVersionNo,
        assignment.snapshot_version AS snapshotVersion,
        assignment.snapshot_created_at AS snapshotCreatedAt,
        assignment.snapshot_source AS snapshotSource,
        assignment.snapshot_allow_free_order AS snapshotAllowFreeOrder,
        assignment.snapshot_nfc_enabled AS snapshotNfcEnabled,
        assignment.snapshot_qr_fallback_enabled AS snapshotQrFallbackEnabled
      FROM patrol_assignments assignment
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request ON request.request_id = assignment.request_id
      WHERE assignment.owner_user_id = ?
        AND assignment.assignment_id = ?
        AND assignment.contour_id = ?
      LIMIT 1
    `,
    [ownerUserId, assignmentId, currentContourId]
  );
}

export async function repairAssignmentContourBinding(
  db: SQLite.SQLiteDatabase,
  assignmentId: string,
  ownerUserId: string
) {
  const legacyAssignment = await db.getFirstAsync<{ assignmentId: string }>(
    `
      SELECT assignment_id AS assignmentId
      FROM patrol_assignments
      WHERE assignment_id = ?
        AND owner_user_id = ?
        AND contour_id IS NULL
      LIMIT 1
    `,
    [assignmentId, ownerUserId]
  );
  if (!legacyAssignment) {
    return;
  }

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET contour_id = ?
          WHERE assignment_id = ?
            AND owner_user_id = ?
            AND contour_id IS NULL
        `,
        [currentContourId, assignmentId, ownerUserId]
      );
    })
  );
}

export async function getNextPendingAssignmentPoint(assignmentId: string) {
  const ownerUserId = await requireOwnerUserId();
  const points = await listAssignmentPoints(assignmentId, ownerUserId, currentContourId);
  return points.find((point) => !isTerminalPointStatus(point.status)) ?? null;
}
