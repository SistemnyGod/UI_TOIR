import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { insertLocalFileInTransaction } from "@/db/repositories/filesRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { LocalMobileFile } from "@/domain/files/fileTypes";
import { OutboxCommand } from "@/domain/sync/syncTypes";
import { getNfcCodeCandidates, normalizeNfcCode } from "@/services/nfcService";

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getFirstAsync" | "runAsync">;

export type RequestBoardItem = {
  requestId: string;
  displayNumber: string | null;
  routeId: string;
  routeName: string;
  plannedStartAt: string;
  assignedFullName: string | null;
  status: string;
  revision: number;
};

export type ActiveAssignment = {
  assignmentId: string;
  requestId: string;
  routeId: string;
  routeName: string;
  status: string;
  startedAtLocal: string | null;
  completedAtLocal: string | null;
  revision: number;
};

export type PointListItem = {
  pointId: string;
  routeId: string;
  name: string;
  orderIndex: number;
  required: boolean;
  status: "pending" | "scanned" | "ok" | "issue" | "deferred" | "skipped";
  comment: string | null;
};

export type PointForFill = PointListItem & {
  assignmentId: string;
  nfcUidHash: string | null;
  qrCodeHash: string | null;
  confirmationType: "nfc" | "qr" | "manual" | null;
  scannedAtLocal: string | null;
  completedAtLocal: string | null;
  issueTypeId: string | null;
  deferredReason: string | null;
  photoClientFileIds: string[];
};

export type AssignmentProgress = {
  total: number;
  completed: number;
  deferred: number;
  issues: number;
  skipped: number;
};

export type ReportProblem = {
  pointId: string;
  pointName: string;
  orderIndex: number;
  reason: string;
};

export type ReportReadiness = {
  assignment: ActiveAssignment | null;
  progress: AssignmentProgress;
  problems: ReportProblem[];
  ready: boolean;
};

export type DeferPointInput = {
  selectedStatus?: "ok" | "issue" | null;
  comment?: string | null;
  issueTypeId?: string | null;
  photoClientFileIds?: string[];
  reason?: string;
};

export async function listRequestBoard() {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  return db.getAllAsync<RequestBoardItem>(
    `
      SELECT
        request_id AS requestId,
        display_number AS displayNumber,
        route_id AS routeId,
        route_name AS routeName,
        planned_start_at AS plannedStartAt,
        assigned_full_name AS assignedFullName,
        status,
        revision
      FROM patrol_request_board
      WHERE owner_user_id = ?
      ORDER BY planned_start_at ASC
    `,
    [ownerUserId]
  );
}

export async function getRequestBoardItem(requestId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  return db.getFirstAsync<RequestBoardItem>(
    `
      SELECT
        request_id AS requestId,
        display_number AS displayNumber,
        route_id AS routeId,
        route_name AS routeName,
        planned_start_at AS plannedStartAt,
        assigned_full_name AS assignedFullName,
        status,
        revision
      FROM patrol_request_board
      WHERE owner_user_id = ?
        AND request_id = ?
    `,
    [ownerUserId, requestId]
  );
}

export async function getActiveAssignment() {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  return db.getFirstAsync<ActiveAssignment>(
    `
      SELECT
        assignment.assignment_id AS assignmentId,
        assignment.request_id AS requestId,
        assignment.route_id AS routeId,
        COALESCE(route.name, request.route_name, '') AS routeName,
        assignment.status,
        assignment.started_at_local AS startedAtLocal,
        assignment.completed_at_local AS completedAtLocal,
        assignment.revision
      FROM patrol_assignments assignment
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request ON request.request_id = assignment.request_id
      WHERE assignment.owner_user_id = ?
        AND assignment.status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer', 'conflict')
      ORDER BY
        CASE
          WHEN assignment.status = 'inProgress' THEN 0
          WHEN assignment.status = 'completedLocal' THEN 1
          WHEN assignment.status = 'accepted' THEN 2
          WHEN assignment.status = 'paused' THEN 3
          ELSE 2
        END,
        assignment.started_at_local DESC
      LIMIT 1
    `,
    [ownerUserId]
  );
}

export async function getAssignmentByRequestId(requestId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  return db.getFirstAsync<ActiveAssignment>(
    `
      SELECT
        assignment.assignment_id AS assignmentId,
        assignment.request_id AS requestId,
        assignment.route_id AS routeId,
        COALESCE(route.name, request.route_name, '') AS routeName,
        assignment.status,
        assignment.started_at_local AS startedAtLocal,
        assignment.completed_at_local AS completedAtLocal,
        assignment.revision
      FROM patrol_assignments assignment
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request ON request.request_id = assignment.request_id
      WHERE assignment.owner_user_id = ?
        AND assignment.request_id = ?
        AND assignment.status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer', 'conflict')
      ORDER BY
        CASE
          WHEN assignment.status = 'inProgress' THEN 0
          WHEN assignment.status = 'completedLocal' THEN 1
          WHEN assignment.status = 'accepted' THEN 2
          WHEN assignment.status = 'paused' THEN 3
          ELSE 2
        END,
        assignment.started_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, requestId]
  );
}

export async function takeRequestLocally(requestId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const existing = await getAssignmentByRequestId(requestId);
  if (existing) {
    return { assignment: existing, created: false };
  }

  const request = await getRequestBoardItem(requestId);
  if (!request) {
    throw new Error("Заявка не загружена на телефон.");
  }

  const assignmentId = Crypto.randomUUID();
  const takenAtLocal = new Date().toISOString();
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType: "takePatrolRequest",
    entityType: "patrolRequest",
    entityLocalId: assignmentId,
    entityServerId: request.requestId,
    payload: {
      requestId: request.requestId,
      routeId: request.routeId,
      requestRevision: request.revision,
      takenAtLocal
    },
    createdAtLocal: takenAtLocal,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
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
        VALUES (?, ?, ?, ?, 'inProgress', ?, NULL, 0)
      `,
      [assignmentId, ownerUserId, request.requestId, request.routeId, takenAtLocal]
    );

    await tx.runAsync(
      `
        INSERT OR REPLACE INTO assignment_route_points (
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
      [assignmentId, request.routeId]
    );

    const snapshot = await tx.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM assignment_route_points
        WHERE assignment_id = ?
      `,
      [assignmentId]
    );
    if ((snapshot?.count ?? 0) === 0) {
      throw new Error("Маршрут не загружен на телефон.");
    }

    await tx.runAsync(
      `
        UPDATE patrol_request_board
        SET status = 'inProgress'
        WHERE owner_user_id = ?
          AND request_id = ?
      `,
      [ownerUserId, request.requestId]
    );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  void logMobileAction({
    eventType: "patrol.request.taken",
    entityType: "patrolAssignment",
    entityId: assignmentId,
    message: "Заявка взята в работу.",
    payload: { requestId: request.requestId, routeId: request.routeId }
  }).catch(() => undefined);

  return {
    assignment: {
      assignmentId,
      requestId: request.requestId,
      routeId: request.routeId,
      routeName: request.routeName,
      status: "inProgress",
      startedAtLocal: takenAtLocal,
      completedAtLocal: null,
      revision: 0
    } satisfies ActiveAssignment,
    created: true
  };
}

export async function acceptRequestLocally(requestId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const existing = await getAssignmentByRequestId(requestId);
  if (existing) {
    return { assignment: existing, created: false };
  }

  const request = await getRequestBoardItem(requestId);
  if (!request) {
    throw new Error("Заявка не загружена на телефон.");
  }

  const assignmentId = Crypto.randomUUID();
  const acceptedAtLocal = new Date().toISOString();
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType: "acceptPatrolRequest",
    entityType: "patrolRequest",
    entityLocalId: assignmentId,
    entityServerId: request.requestId,
    payload: {
      requestId: request.requestId,
      routeId: request.routeId,
      requestRevision: request.revision,
      acceptedAtLocal
    },
    createdAtLocal: acceptedAtLocal,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
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
          VALUES (?, ?, ?, ?, 'accepted', NULL, NULL, 0)
        `,
        [assignmentId, ownerUserId, request.requestId, request.routeId]
      );

      await snapshotRoutePointsInTransaction(tx, assignmentId, request.routeId);

      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = 'accepted'
          WHERE owner_user_id = ?
            AND request_id = ?
        `,
        [ownerUserId, request.requestId]
      );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  return {
    assignment: {
      assignmentId,
      requestId: request.requestId,
      routeId: request.routeId,
      routeName: request.routeName,
      status: "accepted",
      startedAtLocal: null,
      completedAtLocal: null,
      revision: 0
    } satisfies ActiveAssignment,
    created: true
  };
}

export async function releaseAcceptedRequestLocally(assignmentId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("Назначение не найдено на телефоне.");
  }

  if (assignment.status !== "accepted" || assignment.startedAtLocal) {
    throw new Error("Вернуть можно только принятую заявку до начала обхода.");
  }

  const now = new Date().toISOString();
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType: "releasePatrolRequest",
    entityType: "patrolAssignment",
    entityLocalId: assignment.assignmentId,
    entityServerId: assignment.assignmentId,
    payload: {
      assignmentId: assignment.assignmentId,
      requestId: assignment.requestId,
      releasedAtLocal: now
    },
    createdAtLocal: now,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync("DELETE FROM point_results WHERE assignment_id = ?", [assignment.assignmentId]);
      await tx.runAsync("DELETE FROM assignment_route_points WHERE assignment_id = ?", [assignment.assignmentId]);
      await tx.runAsync("DELETE FROM patrol_assignments WHERE assignment_id = ?", [assignment.assignmentId]);
      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = CASE WHEN assigned_full_name IS NULL THEN 'available' ELSE 'assigned' END
          WHERE owner_user_id = ?
            AND request_id = ?
        `,
        [ownerUserId, assignment.requestId]
      );
      await insertOutboxCommandInTransaction(tx, command);
    })
  );
}

export async function startAssignmentLocally(assignmentId: string) {
  return updateAssignmentLifecycleLocally(assignmentId, "startPatrolAssignment", "inProgress", "startedAtLocal");
}

export async function pauseAssignmentLocally(assignmentId: string) {
  return updateAssignmentLifecycleLocally(assignmentId, "pausePatrolAssignment", "paused");
}

export async function resumeAssignmentLocally(assignmentId: string) {
  return updateAssignmentLifecycleLocally(assignmentId, "resumePatrolAssignment", "inProgress");
}

export async function handoffAssignmentLocally(assignmentId: string) {
  return updateAssignmentLifecycleLocally(assignmentId, "handoffPatrolAssignment", "needsDispatcherDecision");
}

export async function listAssignmentPoints(assignmentId: string) {
  const db = await getDatabase();

  return db.getAllAsync<PointListItem>(
    `
      SELECT
        point.point_id AS pointId,
        point.route_id AS routeId,
        point.name,
        point.order_index AS orderIndex,
        point.required = 1 AS required,
        COALESCE(result.status, 'pending') AS status,
        result.comment AS comment
      FROM patrol_assignments assignment
      JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
      LEFT JOIN point_results result
        ON result.assignment_id = assignment.assignment_id
       AND result.point_id = point.point_id
      WHERE assignment.assignment_id = ?
      ORDER BY point.order_index ASC
    `,
    [assignmentId]
  );
}

export async function scanPointByNfc(assignmentId: string, nfcCode: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const scannedCandidates = getNfcCodeCandidates(nfcCode);
  const points = await db.getAllAsync<{
    pointId: string;
    routeId: string;
    name: string;
    orderIndex: number;
    required: number;
    revision: number;
    nfcUidHash: string | null;
  }>(
    `
      SELECT
        point.point_id AS pointId,
        point.route_id AS routeId,
        point.name,
        point.order_index AS orderIndex,
        point.required AS required,
        point.revision AS revision,
        point.nfc_uid_hash AS nfcUidHash
      FROM patrol_assignments assignment
      JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
      WHERE assignment.assignment_id = ?
    `,
    [assignmentId]
  );

  const point = points.find((candidate) => {
    if (!candidate.nfcUidHash) {
      return false;
    }

    const expectedCandidates = getNfcCodeCandidates(candidate.nfcUidHash);
    return expectedCandidates.some((expected) => scannedCandidates.includes(expected));
  });

  const normalizedNfcCode = normalizeNfcCode(point?.nfcUidHash ?? nfcCode);
  const scannedNfcCode = normalizeNfcCode(nfcCode);

  if (scannedCandidates.length === 0) {
    return { matched: false as const, scannedCode: null };
  }

  if (!point) {
    return { matched: false as const, scannedCode: scannedNfcCode };
  }

  if (!normalizedNfcCode) {
    return { matched: false as const, scannedCode: scannedNfcCode };
  }

  // The backend validates against RoutePoint.NfcCode, so after a tolerant local match
  // we send the normalized route value rather than a device-specific byte order variant.

  const scannedAtLocal = new Date().toISOString();
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType: "scanPatrolPointNfc",
    entityType: "patrolPoint",
    entityLocalId: point.pointId,
    entityServerId: point.pointId,
    payload: {
      assignmentId,
      pointId: point.pointId,
      nfcUidHash: normalizedNfcCode,
      scannedAtLocal
    },
    createdAtLocal: scannedAtLocal,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
    await upsertPointResultInTransaction(tx, {
    ownerUserId,
    assignmentId,
    pointId: point.pointId,
    status: "scanned",
    comment: null,
    issueTypeId: null,
    severity: null,
    deferredReason: null,
    completedAtLocal: null,
    syncStatus: "pending",
    confirmationType: "nfc",
    nfcUidHash: normalizedNfcCode,
    scannedAtLocal,
    photoClientFileIds: []
  });

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  void logMobileAction({
    eventType: "patrol.nfc.scanned",
    entityType: "patrolPoint",
    entityId: point.pointId,
    message: "NFC-метка считана.",
    payload: { assignmentId, nfcCode: normalizedNfcCode }
  }).catch(() => undefined);

  return {
    matched: true as const,
    point: {
      pointId: point.pointId,
      routeId: point.routeId,
      name: point.name,
      orderIndex: point.orderIndex,
      required: point.required === 1,
      status: "scanned" as const,
      comment: null
    } satisfies PointListItem
  };
}

export async function scanPointByQr(assignmentId: string, qrCodeHash: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const normalizedQr = qrCodeHash.trim();
  const point = await db.getFirstAsync<{
    pointId: string;
    routeId: string;
    name: string;
    orderIndex: number;
    required: number;
    revision: number;
  }>(
    `
      SELECT
        point.point_id AS pointId,
        point.route_id AS routeId,
        point.name,
        point.order_index AS orderIndex,
        point.required AS required,
        point.revision AS revision
      FROM patrol_assignments assignment
      JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
      WHERE assignment.assignment_id = ?
        AND point.qr_code_hash = ?
      LIMIT 1
    `,
    [assignmentId, normalizedQr]
  );

  if (!point) {
    return { matched: false as const };
  }

  const scannedAtLocal = new Date().toISOString();
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType: "scanPatrolPointQr",
    entityType: "patrolPoint",
    entityLocalId: point.pointId,
    entityServerId: point.pointId,
    payload: {
      assignmentId,
      pointId: point.pointId,
      qrCodeHash: normalizedQr,
      scannedAtLocal
    },
    createdAtLocal: scannedAtLocal,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
    await upsertPointResultInTransaction(tx, {
    ownerUserId,
    assignmentId,
    pointId: point.pointId,
    status: "scanned",
    comment: null,
    issueTypeId: null,
    severity: null,
    deferredReason: null,
    completedAtLocal: null,
    syncStatus: "pending",
    confirmationType: "qr",
    nfcUidHash: null,
    scannedAtLocal,
    photoClientFileIds: []
  });

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  return {
    matched: true as const,
    point: {
      pointId: point.pointId,
      routeId: point.routeId,
      name: point.name,
      orderIndex: point.orderIndex,
      required: point.required === 1,
      status: "scanned" as const,
      comment: null
    } satisfies PointListItem
  };
}

export async function getPointForFill(assignmentId: string, pointId: string) {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    assignmentId: string;
    pointId: string;
    routeId: string;
    name: string;
    orderIndex: number;
    required: number;
    nfcUidHash: string | null;
    qrCodeHash: string | null;
    status: PointListItem["status"] | null;
    comment: string | null;
    confirmationType: "nfc" | "qr" | "manual" | null;
    scannedAtLocal: string | null;
    completedAtLocal: string | null;
    issueTypeId: string | null;
    deferredReason: string | null;
    photoClientFileIdsJson: string | null;
  }>(
    `
      SELECT
        assignment.assignment_id AS assignmentId,
        point.point_id AS pointId,
        point.route_id AS routeId,
        point.name,
        point.order_index AS orderIndex,
        point.required AS required,
        point.nfc_uid_hash AS nfcUidHash,
        point.qr_code_hash AS qrCodeHash,
        result.status AS status,
        result.comment AS comment,
        result.confirmation_type AS confirmationType,
        result.scanned_at_local AS scannedAtLocal,
        result.completed_at_local AS completedAtLocal,
        result.issue_type_id AS issueTypeId,
        result.deferred_reason AS deferredReason,
        result.photo_client_file_ids_json AS photoClientFileIdsJson
      FROM patrol_assignments assignment
      JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
      LEFT JOIN point_results result
        ON result.assignment_id = assignment.assignment_id
       AND result.point_id = point.point_id
      WHERE assignment.assignment_id = ?
        AND point.point_id = ?
      LIMIT 1
    `,
    [assignmentId, pointId]
  );

  if (!row) {
    return null;
  }

  return {
    assignmentId: row.assignmentId,
    pointId: row.pointId,
    routeId: row.routeId,
    name: row.name,
    orderIndex: row.orderIndex,
    required: row.required === 1,
    nfcUidHash: row.nfcUidHash,
    qrCodeHash: row.qrCodeHash,
    status: row.status ?? "pending",
    comment: row.comment,
    confirmationType: row.confirmationType,
    scannedAtLocal: row.scannedAtLocal,
    completedAtLocal: row.completedAtLocal,
    issueTypeId: row.issueTypeId,
    deferredReason: row.deferredReason,
    photoClientFileIds: parseStringArray(row.photoClientFileIdsJson)
  } satisfies PointForFill;
}

export async function savePointOk(assignmentId: string, pointId: string, comment: string) {
  return savePointResult({
    assignmentId,
    pointId,
    status: "ok",
    comment,
    issueTypeId: null
  });
}

export async function savePointIssue(assignmentId: string, pointId: string, comment: string, issueTypeId: string) {
  return savePointResult({
    assignmentId,
    pointId,
    status: "issue",
    comment,
    issueTypeId
  });
}

export async function deferPoint(assignmentId: string, pointId: string, input: DeferPointInput = {}) {
  const ownerUserId = await requireOwnerUserId();
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const selectedStatus = input.selectedStatus ?? (point.issueTypeId ? "issue" : null);
  const issueTypeId = selectedStatus === "issue"
    ? input.issueTypeId?.trim() || point.issueTypeId || "Неисправность"
    : null;

  await upsertPointResult({
    ownerUserId,
    assignmentId,
    pointId,
    status: "deferred",
    comment: input.comment ?? point.comment,
    issueTypeId,
    severity: null,
    deferredReason: input.reason ?? "Заполнить позже",
    completedAtLocal: null,
    syncStatus: "pending",
    confirmationType: point.confirmationType ?? "manual",
    nfcUidHash: point.nfcUidHash,
    scannedAtLocal: point.scannedAtLocal ?? new Date().toISOString(),
    photoClientFileIds: input.photoClientFileIds ?? point.photoClientFileIds
  });

  void logMobileAction({
    eventType: "patrol.point.deferred",
    entityType: "patrolPoint",
    entityId: pointId,
    message: "Метка отложена на потом.",
    payload: { assignmentId, selectedStatus, photoCount: (input.photoClientFileIds ?? point.photoClientFileIds).length }
  }).catch(() => undefined);
}

export async function skipPoint(assignmentId: string, pointId: string, input: Pick<DeferPointInput, "comment" | "photoClientFileIds"> = {}) {
  const ownerUserId = await requireOwnerUserId();
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const completedAtLocal = point.status === "skipped" && point.completedAtLocal ? point.completedAtLocal : new Date().toISOString();
  await upsertPointResult({
    ownerUserId,
    assignmentId,
    pointId,
    status: "skipped",
    comment: input.comment ?? point.comment,
    issueTypeId: null,
    severity: null,
    deferredReason: "Метка недоступна",
    completedAtLocal,
    syncStatus: "pending",
    confirmationType: "manual",
    nfcUidHash: null,
    scannedAtLocal: point.scannedAtLocal ?? completedAtLocal,
    photoClientFileIds: input.photoClientFileIds ?? point.photoClientFileIds
  });

  void logMobileAction({
    eventType: "patrol.point.skipped",
    entityType: "patrolPoint",
    entityId: pointId,
    message: "Метка отмечена как недоступная.",
    payload: { assignmentId, attachmentCount: (input.photoClientFileIds ?? point.photoClientFileIds).length }
  }).catch(() => undefined);
}

export async function attachPhotoToPoint(assignmentId: string, pointId: string, file: LocalMobileFile) {
  const ownerUserId = await requireOwnerUserId();
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const photoClientFileIds = Array.from(new Set([...point.photoClientFileIds, file.clientFileId]));
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await insertLocalFileInTransaction(tx, { ...file, status: "queued", assignmentId, pointId });
      await upsertPointResultInTransaction(tx, {
        ownerUserId,
        assignmentId,
        pointId,
        status: point.status,
        comment: point.comment,
        issueTypeId: point.issueTypeId,
        severity: point.status === "issue" ? "medium" : null,
        deferredReason: point.deferredReason,
        completedAtLocal: point.completedAtLocal,
        syncStatus: "pending",
        confirmationType: point.confirmationType ?? "manual",
        nfcUidHash: point.nfcUidHash,
        scannedAtLocal: point.scannedAtLocal,
        photoClientFileIds
      });
      await updateLatestPendingMarkPhotoPayloadInTransaction(tx, assignmentId, pointId, photoClientFileIds);
    })
  );

  void logMobileAction({
    eventType: file.mediaKind === "video" ? "patrol.video.added" : "patrol.photo.added",
    entityType: "patrolPoint",
    entityId: pointId,
    message: file.mediaKind === "video" ? "Видео добавлено к метке." : "Фото добавлено к метке.",
    payload: { assignmentId, clientFileId: file.clientFileId }
  }).catch(() => undefined);
}

export async function getReportReadiness(assignmentId: string): Promise<ReportReadiness> {
  const assignment = await getAssignmentById(assignmentId);
  const points = await listAssignmentPoints(assignmentId);
  const problems: ReportProblem[] = [];

  if (assignment && points.length === 0) {
    problems.push({
      pointId: "route-empty",
      pointName: assignment.routeName,
      orderIndex: 0,
      reason: "Маршрут не загружен на телефон"
    });
  }

  for (const point of points) {
    if (point.required && point.status === "pending") {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "Обязательная метка не заполнена"
      });
    }

    if (point.required && point.status === "deferred") {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "Обязательная метка отложена"
      });
    }

    if (point.status === "issue" && !point.comment?.trim()) {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "Для неисправности нужен комментарий"
      });
    }
  }

  const progress = await getAssignmentProgress(assignmentId);

  return {
    assignment,
    progress,
    problems,
    ready: assignment !== null && problems.length === 0
  };
}

export async function completeAssignmentLocally(assignmentId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const readiness = await getReportReadiness(assignmentId);
  if (!readiness.assignment || !readiness.ready) {
    throw new Error("Отчет еще не готов к отправке.");
  }

  const queuedCompleteCommand = await getQueuedCompleteAssignmentCommand(db, ownerUserId, assignmentId);
  if (queuedCompleteCommand) {
    const completedAtLocal = readiness.assignment.completedAtLocal ?? queuedCompleteCommand.createdAtLocal;
    await db.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'completedLocal',
            completed_at_local = COALESCE(completed_at_local, ?)
        WHERE owner_user_id = ?
          AND assignment_id = ?
      `,
      [completedAtLocal, ownerUserId, assignmentId]
    );

    return {
      completedAtLocal,
      clientOperationId: queuedCompleteCommand.clientOperationId,
      alreadyQueued: true as const
    };
  }

  const completedAtLocal = new Date().toISOString();
  const pointResults = await buildCompletedPointResults(assignmentId);
  const photoCount = pointResults.reduce((sum, result) => sum + result.photoClientFileIds.length, 0);
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType: "completePatrolAssignment",
    entityType: "patrolAssignment",
    entityLocalId: assignmentId,
    entityServerId: assignmentId,
    payload: {
      assignmentId,
      requestId: readiness.assignment.requestId,
      completedAtLocal,
      baseRevision: readiness.assignment.revision,
      summary: {
        totalPoints: readiness.progress.total,
        completedPoints: readiness.progress.completed,
        issueCount: readiness.progress.issues,
        deferredCount: readiness.progress.deferred,
        skippedCount: readiness.progress.skipped,
        photoCount
      },
      pointResults
    },
    createdAtLocal: completedAtLocal,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'completedLocal',
            completed_at_local = ?
        WHERE assignment_id = ?
      `,
      [completedAtLocal, assignmentId]
    );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  void logMobileAction({
    eventType: "patrol.report.completedLocal",
    entityType: "patrolAssignment",
    entityId: assignmentId,
    message: "Отчет завершен локально и ожидает отправки.",
    payload: { photoCount, pointCount: readiness.progress.total }
  }).catch(() => undefined);

  return { completedAtLocal, clientOperationId: command.clientOperationId, alreadyQueued: false as const };
}

export async function getAssignmentProgress(assignmentId: string): Promise<AssignmentProgress> {
  const points = await listAssignmentPoints(assignmentId);

  return {
    total: points.length,
    completed: points.filter((point) => point.status === "ok" || point.status === "issue" || point.status === "skipped").length,
    deferred: points.filter((point) => point.status === "deferred").length,
    issues: points.filter((point) => point.status === "issue").length,
    skipped: points.filter((point) => point.status === "skipped").length
  };
}

export async function getActiveAssignmentWithProgress() {
  const assignment = await getActiveAssignment();
  if (!assignment) {
    return null;
  }

  return {
    assignment,
    progress: await getAssignmentProgress(assignment.assignmentId)
  };
}

export async function getAssignmentById(assignmentId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  return db.getFirstAsync<ActiveAssignment>(
    `
      SELECT
        assignment.assignment_id AS assignmentId,
        assignment.request_id AS requestId,
        assignment.route_id AS routeId,
        COALESCE(route.name, request.route_name, '') AS routeName,
        assignment.status,
        assignment.started_at_local AS startedAtLocal,
        assignment.completed_at_local AS completedAtLocal,
        assignment.revision
      FROM patrol_assignments assignment
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request ON request.request_id = assignment.request_id
      WHERE assignment.owner_user_id = ?
        AND assignment.assignment_id = ?
      LIMIT 1
    `,
    [ownerUserId, assignmentId]
  );
}

async function updateAssignmentLifecycleLocally(
  assignmentId: string,
  commandType: "startPatrolAssignment" | "pausePatrolAssignment" | "resumePatrolAssignment" | "handoffPatrolAssignment",
  nextStatus: "inProgress" | "paused" | "needsDispatcherDecision",
  timestampMode?: "startedAtLocal"
) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("Назначение не найдено на телефоне.");
  }

  if (commandType === "startPatrolAssignment" && !["accepted", "paused", "inProgress"].includes(assignment.status)) {
    throw new Error("Начать можно только принятую или приостановленную заявку.");
  }

  if (commandType === "pausePatrolAssignment" && assignment.status !== "inProgress") {
    throw new Error("Приостановить можно только начатый обход.");
  }

  if (commandType === "resumePatrolAssignment" && assignment.status !== "paused") {
    throw new Error("Продолжить можно только приостановленный обход.");
  }

  const now = new Date().toISOString();
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType,
    entityType: "patrolAssignment",
    entityLocalId: assignment.assignmentId,
    entityServerId: assignment.assignmentId,
    payload: {
      assignmentId: assignment.assignmentId,
      requestId: assignment.requestId,
      [`${nextStatus}AtLocal`]: now,
      ...(timestampMode === "startedAtLocal" ? { startedAtLocal: now } : {})
    },
    createdAtLocal: now,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET status = ?,
              started_at_local = CASE
                WHEN ? = 'startedAtLocal' AND started_at_local IS NULL THEN ?
                ELSE started_at_local
              END
          WHERE owner_user_id = ?
            AND assignment_id = ?
        `,
        [nextStatus, timestampMode ?? "", now, ownerUserId, assignment.assignmentId]
      );

      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = ?
          WHERE owner_user_id = ?
            AND request_id = ?
        `,
        [nextStatus, ownerUserId, assignment.requestId]
      );

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  return getAssignmentById(assignment.assignmentId);
}

async function snapshotRoutePointsInTransaction(executor: SqlExecutor, assignmentId: string, routeId: string) {
  await executor.runAsync(
    `
      INSERT OR REPLACE INTO assignment_route_points (
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
    [assignmentId, routeId]
  );

  const snapshot = await executor.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM assignment_route_points
      WHERE assignment_id = ?
    `,
    [assignmentId]
  );
  if ((snapshot?.count ?? 0) === 0) {
    throw new Error("Маршрут не загружен на телефон.");
  }
}

async function buildCompletedPointResults(assignmentId: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    pointId: string;
    status: "ok" | "issue" | "skipped";
    comment: string | null;
    issueTypeId: string | null;
    photoClientFileIdsJson: string | null;
    confirmationType: "nfc" | "qr" | "manual" | null;
    nfcUidHash: string | null;
    completedAtLocal: string | null;
  }>(
    `
      SELECT
        point.point_id AS pointId,
        result.status AS status,
        result.comment AS comment,
        result.issue_type_id AS issueTypeId,
        result.photo_client_file_ids_json AS photoClientFileIdsJson,
        result.confirmation_type AS confirmationType,
        result.nfc_uid_hash AS nfcUidHash,
        result.completed_at_local AS completedAtLocal
      FROM patrol_assignments assignment
      JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
      JOIN point_results result
        ON result.assignment_id = assignment.assignment_id
       AND result.point_id = point.point_id
      WHERE assignment.assignment_id = ?
        AND result.status IN ('ok', 'issue', 'skipped')
      ORDER BY point.order_index ASC
    `,
    [assignmentId]
  );

  const fallbackCompletedAtLocal = new Date().toISOString();

  return rows.map((row) => ({
    pointId: row.pointId,
    status: row.status,
    comment: row.comment ?? "",
    issueTypeId: row.issueTypeId,
    photoClientFileIds: parseStringArray(row.photoClientFileIdsJson),
    confirmationType: row.confirmationType ?? "manual",
    nfcUidHash: row.nfcUidHash,
    completedAtLocal: row.completedAtLocal ?? fallbackCompletedAtLocal
  }));
}

async function getQueuedCompleteAssignmentCommand(executor: SqlExecutor, ownerUserId: string, assignmentId: string) {
  return executor.getFirstAsync<{
    clientOperationId: string;
    createdAtLocal: string;
  }>(
    `
      SELECT
        client_operation_id AS clientOperationId,
        created_at_local AS createdAtLocal
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND command_type = 'completePatrolAssignment'
        AND entity_local_id = ?
        AND status IN ('pending', 'sending', 'retryLater', 'accepted', 'duplicate')
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, assignmentId]
  );
}

async function requireOwnerUserId() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Выполните вход в мобильный аккаунт.");
  }

  return ownerUserId;
}

async function savePointResult({
  assignmentId,
  pointId,
  status,
  comment,
  issueTypeId
}: {
  assignmentId: string;
  pointId: string;
  status: "ok" | "issue";
  comment: string;
  issueTypeId: string | null;
}) {
  const ownerUserId = await requireOwnerUserId();
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const completedAtLocal = new Date().toISOString();
  const commandType = status === "issue" ? "markPatrolPointIssue" : "markPatrolPointOk";
  const command: OutboxCommand = {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId,
    commandType,
    entityType: "patrolPoint",
    entityLocalId: pointId,
    entityServerId: pointId,
    payload: {
      assignmentId,
      pointId,
      comment,
      issueTypeId,
      photoClientFileIds: point.photoClientFileIds,
      completedAtLocal
    },
    createdAtLocal: completedAtLocal,
    attemptCount: 0,
    status: "pending"
  };

  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
    await upsertPointResultInTransaction(tx, {
      ownerUserId,
      assignmentId,
      pointId,
      status,
      comment,
      issueTypeId,
      severity: status === "issue" ? "medium" : null,
      deferredReason: null,
      completedAtLocal,
      syncStatus: "pending",
      confirmationType: point.confirmationType ?? "manual",
      nfcUidHash: point.nfcUidHash,
      scannedAtLocal: point.scannedAtLocal ?? completedAtLocal,
      photoClientFileIds: point.photoClientFileIds
    });

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  void logMobileAction({
    eventType: "patrol.point.saved",
    entityType: "patrolPoint",
    entityId: pointId,
    message: status === "issue" ? "Метка сохранена как неисправная." : "Метка сохранена как исправная.",
    payload: { assignmentId, status, photoCount: point.photoClientFileIds.length }
  }).catch(() => undefined);
}

async function updateLatestPendingMarkPhotoPayloadInTransaction(
  executor: SqlExecutor,
  assignmentId: string,
  pointId: string,
  photoClientFileIds: string[]
) {
  const command = await executor.getFirstAsync<{
    client_operation_id: string;
    payload_json: string;
  }>(
    `
      SELECT client_operation_id, payload_json
      FROM outbox_commands
      WHERE entity_local_id = ?
        AND command_type IN ('markPatrolPointOk', 'markPatrolPointIssue')
        AND status IN ('pending', 'retryLater')
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [pointId]
  );

  if (!command) {
    return;
  }

  const payload = JSON.parse(command.payload_json) as Record<string, unknown>;
  if (payload.assignmentId !== assignmentId || payload.pointId !== pointId) {
    return;
  }

  await executor.runAsync(
    `
      UPDATE outbox_commands
      SET payload_json = ?,
          updated_at_local = ?
      WHERE client_operation_id = ?
    `,
    [
      JSON.stringify({
        ...payload,
        photoClientFileIds
      }),
      new Date().toISOString(),
      command.client_operation_id
    ]
  );
}

async function upsertPointResult(input: {
  ownerUserId: string;
  assignmentId: string;
  pointId: string;
  status: PointListItem["status"];
  comment: string | null;
  issueTypeId: string | null;
  severity: string | null;
  deferredReason: string | null;
  completedAtLocal: string | null;
  syncStatus: string;
    confirmationType: "nfc" | "qr" | "manual" | null;
  nfcUidHash: string | null;
  scannedAtLocal: string | null;
  photoClientFileIds: string[];
}) {
  const db = await getDatabase();
  await withSqliteBusyRetry(() => upsertPointResultInTransaction(db, input));
}

async function upsertPointResultInTransaction(executor: SqlExecutor, input: {
  ownerUserId: string;
  assignmentId: string;
  pointId: string;
  status: PointListItem["status"];
  comment: string | null;
  issueTypeId: string | null;
  severity: string | null;
  deferredReason: string | null;
  completedAtLocal: string | null;
  syncStatus: string;
  confirmationType: "nfc" | "qr" | "manual" | null;
  nfcUidHash: string | null;
  scannedAtLocal: string | null;
  photoClientFileIds: string[];
}) {
  const existing = await executor.getFirstAsync<{ localResultId: string }>(
    `
      SELECT local_result_id AS localResultId
      FROM point_results
      WHERE assignment_id = ?
        AND point_id = ?
      LIMIT 1
    `,
    [input.assignmentId, input.pointId]
  );
  const localResultId = existing?.localResultId ?? Crypto.randomUUID();

  await executor.runAsync(
    `
      INSERT OR REPLACE INTO point_results (
        local_result_id,
        owner_user_id,
        assignment_id,
        point_id,
        status,
        comment,
        issue_type_id,
        severity,
        deferred_reason,
        completed_at_local,
        sync_status,
        confirmation_type,
        nfc_uid_hash,
        scanned_at_local,
        photo_client_file_ids_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      localResultId,
      input.ownerUserId,
      input.assignmentId,
      input.pointId,
      input.status,
      input.comment,
      input.issueTypeId,
      input.severity,
      input.deferredReason,
      input.completedAtLocal,
      input.syncStatus,
      input.confirmationType,
      input.nfcUidHash,
      input.scannedAtLocal,
      JSON.stringify(input.photoClientFileIds)
    ]
  );
}

async function insertOutboxCommandInTransaction(executor: SqlExecutor, command: OutboxCommand) {
  await executor.runAsync(
    `
      INSERT INTO outbox_commands (
        client_operation_id,
        owner_user_id,
        command_type,
        entity_type,
        entity_local_id,
        entity_server_id,
        payload_json,
        created_at_local,
        updated_at_local,
        attempt_count,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      command.clientOperationId,
      command.ownerUserId,
      command.commandType,
      command.entityType,
      command.entityLocalId ?? null,
      command.entityServerId ?? null,
      JSON.stringify(command.payload),
      command.createdAtLocal,
      command.createdAtLocal,
      command.attemptCount,
      command.status
    ]
  );
}

function parseStringArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
