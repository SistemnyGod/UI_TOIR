import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getDatabase } from "@/db/database";
import { insertLocalFileInTransaction } from "@/db/repositories/filesRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";
import { parseStringArray, supersedePendingPointStatusCommands, updateLatestPendingMarkPhotoPayloadInTransaction, upsertPointResult, upsertPointResultInTransaction } from "@/db/repositories/patrolPersistence";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { LocalMobileFile } from "@/domain/files/fileTypes";
import { isPhotoEvidenceRequired } from "@/domain/patrol/photoEvidencePolicy";
import { OutboxCommand } from "@/domain/sync/syncTypes";
import { getNfcCodeCandidates, normalizeNfcCode } from "@/services/nfcService";

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

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
  routeVersionNo: number;
};

export type PointListItem = {
  pointId: string;
  routeId: string;
  name: string;
  description?: string | null;
  instruction?: string | null;
  orderIndex: number;
  required: boolean;
  requiresPhoto: boolean;
  status: "pending" | "scanned" | "ok" | "issue" | "deferred" | "skipped";
  comment: string | null;
  issueTypeId?: string | null;
  confirmationType?: "nfc" | "qr" | "manual" | null;
  photoClientFileIds: string[];
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
        assignment.revision,
        assignment.route_version_no AS routeVersionNo
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
        assignment.revision,
        assignment.route_version_no AS routeVersionNo
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
    throw new Error("Р—Р°СЏРІРєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅР° РЅР° С‚РµР»РµС„РѕРЅ.");
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
          revision,
          route_version_no
        )
        VALUES (?, ?, ?, ?, 'inProgress', ?, NULL, 0, 0)
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
          requires_photo,
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
          requires_photo,
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
      throw new Error("РњР°СЂС€СЂСѓС‚ РЅРµ Р·Р°РіСЂСѓР¶РµРЅ РЅР° С‚РµР»РµС„РѕРЅ.");
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
    message: "Р—Р°СЏРІРєР° РІР·СЏС‚Р° РІ СЂР°Р±РѕС‚Сѓ.",
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
      revision: 0,
      routeVersionNo: 0
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
    throw new Error("Р—Р°СЏРІРєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅР° РЅР° С‚РµР»РµС„РѕРЅ.");
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
            revision,
            route_version_no
          )
          VALUES (?, ?, ?, ?, 'accepted', NULL, NULL, 0, 0)
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
      revision: 0,
      routeVersionNo: 0
    } satisfies ActiveAssignment,
    created: true
  };
}

export async function releaseAcceptedRequestLocally(assignmentId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("РќР°Р·РЅР°С‡РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ.");
  }

  if (assignment.status !== "accepted" || assignment.startedAtLocal) {
    throw new Error("Р’РµСЂРЅСѓС‚СЊ РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РїСЂРёРЅСЏС‚СѓСЋ Р·Р°СЏРІРєСѓ РґРѕ РЅР°С‡Р°Р»Р° РѕР±С…РѕРґР°.");
  }

  const pendingRelease = await db.getFirstAsync<{ client_operation_id: string }>(
    `
      SELECT client_operation_id
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND command_type = 'releasePatrolRequest'
        AND entity_local_id = ?
        AND status IN ('pending', 'sending', 'retryLater')
      LIMIT 1
    `,
    [ownerUserId, assignmentId]
  );
  if (pendingRelease) {
    throw new Error("Р’РѕР·РІСЂР°С‚ Р·Р°СЏРІРєРё СѓР¶Рµ СЃРѕС…СЂР°РЅС‘РЅ Рё РѕР¶РёРґР°РµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРµСЂРІРµСЂР°.");
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
      const releaseAlreadyQueued = await tx.getFirstAsync<{ clientOperationId: string }>(
        `
          SELECT client_operation_id AS clientOperationId
          FROM outbox_commands
          WHERE owner_user_id = ?
            AND command_type = 'releasePatrolRequest'
            AND entity_local_id = ?
            AND status IN ('pending', 'sending', 'retryLater')
          LIMIT 1
        `,
        [ownerUserId, assignment.assignmentId]
      );
      if (releaseAlreadyQueued) {
        throw new Error("Р’РѕР·РІСЂР°С‚ Р·Р°СЏРІРєРё СѓР¶Рµ СЃРѕС…СЂР°РЅС‘РЅ Рё РѕР¶РёРґР°РµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРµСЂРІРµСЂР°.");
      }

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

  const rows = await db.getAllAsync<{
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
    issueTypeId: string | null;
    confirmationType: PointListItem["confirmationType"];
    photoClientFileIdsJson: string | null;
  }>(
    `
      SELECT
        point.point_id AS pointId,
        point.route_id AS routeId,
        point.name,
        point.description,
        point.instruction,
        point.order_index AS orderIndex,
        point.required AS required,
        point.requires_photo AS requiresPhoto,
        COALESCE(result.status, 'pending') AS status,
        result.comment AS comment,
        result.issue_type_id AS issueTypeId,
        result.confirmation_type AS confirmationType,
        result.photo_client_file_ids_json AS photoClientFileIdsJson
      FROM patrol_assignments assignment
      JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
      LEFT JOIN point_results result
        ON result.owner_user_id = assignment.owner_user_id
       AND result.assignment_id = assignment.assignment_id
       AND result.point_id = point.point_id
      WHERE assignment.assignment_id = ?
      ORDER BY point.order_index ASC
    `,
    [assignmentId]
  );

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
    issueTypeId: row.issueTypeId,
    confirmationType: row.confirmationType,
    photoClientFileIds: parseStringArray(row.photoClientFileIdsJson)
  } satisfies PointListItem));
}

type ExistingPointResultForScan = {
  status: PointListItem["status"];
  comment: string | null;
  issueTypeId: string | null;
  severity: string | null;
  deferredReason: string | null;
  confirmationType: PointListItem["confirmationType"];
  photoClientFileIdsJson: string | null;
};

async function getExistingPointResultForScan(
  db: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  pointId: string
) {
  return db.getFirstAsync<ExistingPointResultForScan>(
    `
      SELECT
        status,
        comment,
        issue_type_id AS issueTypeId,
        severity,
        deferred_reason AS deferredReason,
        confirmation_type AS confirmationType,
        photo_client_file_ids_json AS photoClientFileIdsJson
      FROM point_results
      WHERE owner_user_id = ? AND assignment_id = ? AND point_id = ?
      LIMIT 1
    `,
    [ownerUserId, assignmentId, pointId]
  );
}

function isTerminalPointStatus(status: PointListItem["status"] | null | undefined): status is "ok" | "issue" | "skipped" {
  return status === "ok" || status === "issue" || status === "skipped";
}

export async function scanPointByNfc(assignmentId: string, nfcCode: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  await assertPointActionAllowed(assignmentId);
  const scannedCandidates = getNfcCodeCandidates(nfcCode);
  const points = await db.getAllAsync<{
    pointId: string;
    routeId: string;
    name: string;
    orderIndex: number;
    required: number;
    requiresPhoto: number;
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
        point.requires_photo AS requiresPhoto,
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

  const existingResult = await getExistingPointResultForScan(db, ownerUserId, assignmentId, point.pointId);
  if (isTerminalPointStatus(existingResult?.status)) {
    return {
      matched: true as const,
      alreadyCompleted: true as const,
      point: {
        pointId: point.pointId,
        routeId: point.routeId,
        name: point.name,
        orderIndex: point.orderIndex,
        required: point.required === 1,
        requiresPhoto: point.requiresPhoto === 1,
        status: existingResult.status,
        comment: existingResult.comment,
        issueTypeId: existingResult.issueTypeId,
        confirmationType: existingResult.confirmationType,
        photoClientFileIds: parseStringArray(existingResult.photoClientFileIdsJson)
      } satisfies PointListItem
    };
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
        comment: existingResult?.comment ?? null,
        issueTypeId: existingResult?.issueTypeId ?? null,
        severity: existingResult?.severity ?? null,
        deferredReason: existingResult?.deferredReason ?? null,
        completedAtLocal: null,
        syncStatus: "pending",
        confirmationType: "nfc",
        nfcUidHash: normalizedNfcCode,
        scannedAtLocal,
        photoClientFileIds: parseStringArray(existingResult?.photoClientFileIdsJson ?? null)
      });

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  void logMobileAction({
    eventType: "patrol.nfc.scanned",
    entityType: "patrolPoint",
    entityId: point.pointId,
    message: "NFC-РјРµС‚РєР° СЃС‡РёС‚Р°РЅР°.",
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
      requiresPhoto: point.requiresPhoto === 1,
      status: "scanned" as const,
      comment: null,
      photoClientFileIds: []
    } satisfies PointListItem
  };
}

export async function scanPointByQr(assignmentId: string, qrCodeHash: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  await assertPointActionAllowed(assignmentId);
  const normalizedQr = qrCodeHash.trim();
  const point = await db.getFirstAsync<{
    pointId: string;
    routeId: string;
    name: string;
    orderIndex: number;
    required: number;
    requiresPhoto: number;
    revision: number;
  }>(
    `
      SELECT
        point.point_id AS pointId,
        point.route_id AS routeId,
        point.name,
        point.order_index AS orderIndex,
        point.required AS required,
        point.requires_photo AS requiresPhoto,
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

  const existingResult = await getExistingPointResultForScan(db, ownerUserId, assignmentId, point.pointId);
  if (isTerminalPointStatus(existingResult?.status)) {
    return {
      matched: true as const,
      alreadyCompleted: true as const,
      point: {
        pointId: point.pointId,
        routeId: point.routeId,
        name: point.name,
        orderIndex: point.orderIndex,
        required: point.required === 1,
        requiresPhoto: point.requiresPhoto === 1,
        status: existingResult.status,
        comment: existingResult.comment,
        issueTypeId: existingResult.issueTypeId,
        confirmationType: existingResult.confirmationType,
        photoClientFileIds: parseStringArray(existingResult.photoClientFileIdsJson)
      } satisfies PointListItem
    };
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
        comment: existingResult?.comment ?? null,
        issueTypeId: existingResult?.issueTypeId ?? null,
        severity: existingResult?.severity ?? null,
        deferredReason: existingResult?.deferredReason ?? null,
        completedAtLocal: null,
        syncStatus: "pending",
        confirmationType: "qr",
        nfcUidHash: null,
        scannedAtLocal,
        photoClientFileIds: parseStringArray(existingResult?.photoClientFileIdsJson ?? null)
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
      requiresPhoto: point.requiresPhoto === 1,
      status: "scanned" as const,
      comment: null,
      photoClientFileIds: []
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
    description: string | null;
    instruction: string | null;
    orderIndex: number;
    required: number;
    requiresPhoto: number;
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
        point.description,
        point.instruction,
        point.order_index AS orderIndex,
        point.required AS required,
        point.requires_photo AS requiresPhoto,
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
        ON result.owner_user_id = assignment.owner_user_id
       AND result.assignment_id = assignment.assignment_id
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
    description: row.description,
    instruction: row.instruction,
    orderIndex: row.orderIndex,
    required: row.required === 1,
    requiresPhoto: row.requiresPhoto === 1,
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
  await assertPointActionAllowed(assignmentId);
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("РњРµС‚РєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅР° РЅР° С‚РµР»РµС„РѕРЅ.");
  }

  const selectedStatus = input.selectedStatus ?? (point.issueTypeId ? "issue" : null);
  const issueTypeId = selectedStatus === "issue"
    ? input.issueTypeId?.trim() || point.issueTypeId || "РќРµРёСЃРїСЂР°РІРЅРѕСЃС‚СЊ"
    : null;

  await upsertPointResult({
    ownerUserId,
    assignmentId,
    pointId,
    status: "deferred",
    comment: input.comment ?? point.comment,
    issueTypeId,
    severity: null,
    deferredReason: input.reason ?? "Р—Р°РїРѕР»РЅРёС‚СЊ РїРѕР·Р¶Рµ",
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
    message: "РњРµС‚РєР° РѕС‚Р»РѕР¶РµРЅР° РЅР° РїРѕС‚РѕРј.",
    payload: { assignmentId, selectedStatus, photoCount: (input.photoClientFileIds ?? point.photoClientFileIds).length }
  }).catch(() => undefined);
}

export async function skipPoint(assignmentId: string, pointId: string, input: Pick<DeferPointInput, "comment" | "photoClientFileIds"> = {}) {
  const ownerUserId = await requireOwnerUserId();
  await assertPointActionAllowed(assignmentId);
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("РњРµС‚РєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅР° РЅР° С‚РµР»РµС„РѕРЅ.");
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
    deferredReason: "РњРµС‚РєР° РЅРµРґРѕСЃС‚СѓРїРЅР°",
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
    message: "РњРµС‚РєР° РѕС‚РјРµС‡РµРЅР° РєР°Рє РЅРµРґРѕСЃС‚СѓРїРЅР°СЏ.",
    payload: { assignmentId, attachmentCount: (input.photoClientFileIds ?? point.photoClientFileIds).length }
  }).catch(() => undefined);
}

export async function attachPhotoToPoint(assignmentId: string, pointId: string, file: LocalMobileFile) {
  const ownerUserId = await requireOwnerUserId();
  await assertPointActionAllowed(assignmentId);
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("РњРµС‚РєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅР° РЅР° С‚РµР»РµС„РѕРЅ.");
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
    message: file.mediaKind === "video" ? "Р’РёРґРµРѕ РґРѕР±Р°РІР»РµРЅРѕ Рє РјРµС‚РєРµ." : "Р¤РѕС‚Рѕ РґРѕР±Р°РІР»РµРЅРѕ Рє РјРµС‚РєРµ.",
    payload: { assignmentId, clientFileId: file.clientFileId }
  }).catch(() => undefined);
}

export async function getReportReadiness(assignmentId: string): Promise<ReportReadiness> {
  const db = await getDatabase();
  const assignment = await getAssignmentById(assignmentId);
  const points = await listAssignmentPoints(assignmentId);
  const problems: ReportProblem[] = [];

  if (assignment?.routeVersionNo) {
    const route = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM routes WHERE route_id = ? LIMIT 1",
      [assignment.routeId]
    );
    if (route && route.version !== assignment.routeVersionNo) {
      problems.push({
        pointId: "route-version",
        pointName: assignment.routeName,
        orderIndex: 0,
        reason: "РњР°СЂС€СЂСѓС‚ РѕР±РЅРѕРІР»РµРЅ РїРѕСЃР»Рµ РЅР°Р·РЅР°С‡РµРЅРёСЏ. РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓР№С‚Рµ РґР°РЅРЅС‹Рµ Рё РїРѕР»СѓС‡РёС‚Рµ Р°РєС‚СѓР°Р»СЊРЅС‹Р№ С‡РµРє-Р»РёСЃС‚."
      });
    }
  }

  if (assignment && points.length === 0) {
    problems.push({
      pointId: "route-empty",
      pointName: assignment.routeName,
      orderIndex: 0,
      reason: "РњР°СЂС€СЂСѓС‚ РЅРµ Р·Р°РіСЂСѓР¶РµРЅ РЅР° С‚РµР»РµС„РѕРЅ"
    });
  }

  for (const point of points) {
    if (point.status === "scanned") {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "Р’С‹Р±РµСЂРёС‚Рµ СЃРѕСЃС‚РѕСЏРЅРёРµ РјРµС‚РєРё РїРѕСЃР»Рµ СЃРєР°РЅРёСЂРѕРІР°РЅРёСЏ"
      });
    }

    if (point.required && point.status === "pending") {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "РћР±СЏР·Р°С‚РµР»СЊРЅР°СЏ РјРµС‚РєР° РЅРµ Р·Р°РїРѕР»РЅРµРЅР°"
      });
    }

    if (point.required && point.status === "deferred") {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "РћР±СЏР·Р°С‚РµР»СЊРЅР°СЏ РјРµС‚РєР° РѕС‚Р»РѕР¶РµРЅР°"
      });
    }

    if (point.status === "issue" && !point.comment?.trim()) {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "Р”Р»СЏ РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё РЅСѓР¶РµРЅ РєРѕРјРјРµРЅС‚Р°СЂРёР№"
      });
    }

    if (point.status === "issue" && !point.issueTypeId?.trim()) {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "Р”Р»СЏ РЅРµРёСЃРїСЂР°РІРЅРѕСЃС‚Рё РЅСѓР¶РЅРѕ СѓРєР°Р·Р°С‚СЊ С‚РёРї"
      });
    }

    if (point.status === "skipped" && !point.comment?.trim()) {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "РЈРєР°Р¶РёС‚Рµ РїСЂРёС‡РёРЅСѓ РЅРµРґРѕСЃС‚СѓРїРЅРѕСЃС‚Рё РјРµС‚РєРё"
      });
    }

    if (isPhotoEvidenceRequired(point.requiresPhoto, point.status) && point.photoClientFileIds.length === 0) {
      problems.push({
        pointId: point.pointId,
        pointName: point.name,
        orderIndex: point.orderIndex,
        reason: "Р”Р»СЏ РјРµС‚РєРё С‚СЂРµР±СѓРµС‚СЃСЏ С„РѕС‚РѕС„РёРєСЃР°С†РёСЏ"
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
  await assertPointActionAllowed(assignmentId);
  const readiness = await getReportReadiness(assignmentId);
  if (!readiness.assignment || !readiness.ready) {
    throw new Error("РћС‚С‡РµС‚ РµС‰Рµ РЅРµ РіРѕС‚РѕРІ Рє РѕС‚РїСЂР°РІРєРµ.");
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
      routeVersionNo: readiness.assignment.routeVersionNo,
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

  type CompletionResult = {
    completedAtLocal: string;
    clientOperationId: string;
    alreadyQueued: boolean;
  };
  const completionResultRef: { current: CompletionResult | null } = { current: null };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      // The duplicate check must be inside the same exclusive transaction as
      // the insert. This protects double taps and concurrent lifecycle callbacks
      // from creating two completion commands for one assignment.
      const queuedCompleteCommand = await getQueuedCompleteAssignmentCommand(tx, ownerUserId, assignmentId);
      if (queuedCompleteCommand) {
        const existingCompletedAt = readiness.assignment?.completedAtLocal ?? queuedCompleteCommand.createdAtLocal;
        await tx.runAsync(
          `
            UPDATE patrol_assignments
            SET status = 'completedLocal',
                completed_at_local = COALESCE(completed_at_local, ?)
            WHERE owner_user_id = ?
              AND assignment_id = ?
          `,
          [existingCompletedAt, ownerUserId, assignmentId]
        );
        completionResultRef.current = {
          completedAtLocal: existingCompletedAt,
          clientOperationId: queuedCompleteCommand.clientOperationId,
          alreadyQueued: true
        };
        return;
      }

      await tx.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'completedLocal',
            completed_at_local = ?
        WHERE owner_user_id = ?
          AND assignment_id = ?
      `,
      [completedAtLocal, ownerUserId, assignmentId]
    );

      await insertOutboxCommandInTransaction(tx, command);
      completionResultRef.current = {
        completedAtLocal,
        clientOperationId: command.clientOperationId,
        alreadyQueued: false
      };
    })
  );

  const completionResult = completionResultRef.current;
  if (!completionResult) {
    throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РѕС‚С‡РµС‚ РІ РѕС‡РµСЂРµРґСЊ РѕС‚РїСЂР°РІРєРё.");
  }

  if (completionResult.alreadyQueued) {
    return { ...completionResult, alreadyQueued: true as const };
  }

  void logMobileAction({
    eventType: "patrol.report.completedLocal",
    entityType: "patrolAssignment",
    entityId: assignmentId,
    message: "РћС‚С‡РµС‚ Р·Р°РІРµСЂС€РµРЅ Р»РѕРєР°Р»СЊРЅРѕ Рё РѕР¶РёРґР°РµС‚ РѕС‚РїСЂР°РІРєРё.",
    payload: { photoCount, pointCount: readiness.progress.total }
  }).catch(() => undefined);

  return { ...completionResult, alreadyQueued: false as const };
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
        assignment.revision,
        assignment.route_version_no AS routeVersionNo
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
    throw new Error("РќР°Р·РЅР°С‡РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ.");
  }

  if (commandType === "startPatrolAssignment" && !["accepted", "paused", "inProgress"].includes(assignment.status)) {
    throw new Error("РќР°С‡Р°С‚СЊ РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РїСЂРёРЅСЏС‚СѓСЋ РёР»Рё РїСЂРёРѕСЃС‚Р°РЅРѕРІР»РµРЅРЅСѓСЋ Р·Р°СЏРІРєСѓ.");
  }

  if (commandType === "startPatrolAssignment" || commandType === "resumePatrolAssignment") {
    const competing = await db.getFirstAsync<{ assignmentId: string }>(
      `
        SELECT assignment_id AS assignmentId
        FROM patrol_assignments
        WHERE owner_user_id = ?
          AND assignment_id <> ?
          AND status IN ('inProgress', 'paused')
        LIMIT 1
      `,
      [ownerUserId, assignment.assignmentId]
    );
    if (competing) {
      throw new Error("РЎРЅР°С‡Р°Р»Р° Р·Р°РІРµСЂС€РёС‚Рµ РёР»Рё РїРµСЂРµРґР°Р№С‚Рµ С‚РµРєСѓС‰РёР№ РѕР±С…РѕРґ.");
    }
  }

  if (commandType === "pausePatrolAssignment" && assignment.status !== "inProgress") {
    throw new Error("РџСЂРёРѕСЃС‚Р°РЅРѕРІРёС‚СЊ РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РЅР°С‡Р°С‚С‹Р№ РѕР±С…РѕРґ.");
  }

  if (commandType === "resumePatrolAssignment" && assignment.status !== "paused") {
    throw new Error("РџСЂРѕРґРѕР»Р¶РёС‚СЊ РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РїСЂРёРѕСЃС‚Р°РЅРѕРІР»РµРЅРЅС‹Р№ РѕР±С…РѕРґ.");
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
      const current = await tx.getFirstAsync<{ status: string }>(
        `
          SELECT status
          FROM patrol_assignments
          WHERE owner_user_id = ?
            AND assignment_id = ?
          LIMIT 1
        `,
        [ownerUserId, assignment.assignmentId]
      );
      if (!current) {
        throw new Error("Assignment is no longer available on this device.");
      }

      const releasePending = await tx.getFirstAsync<{ clientOperationId: string }>(
        `
          SELECT client_operation_id AS clientOperationId
          FROM outbox_commands
          WHERE owner_user_id = ?
            AND command_type = 'releasePatrolRequest'
            AND entity_local_id = ?
            AND status IN ('pending', 'sending', 'retryLater')
          LIMIT 1
        `,
        [ownerUserId, assignment.assignmentId]
      );
      if (releasePending) {
        throw new Error("Р—Р°СЏРІРєР° РѕР¶РёРґР°РµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РІРѕР·РІСЂР°С‚Р° Рё РїРѕРєР° РЅРµРґРѕСЃС‚СѓРїРЅР° РґР»СЏ Р·Р°РїСѓСЃРєР°.");
      }

      if (commandType === "startPatrolAssignment"
        && !["accepted", "paused", "inProgress"].includes(current.status)) {
        throw new Error("Only an accepted or paused patrol can be started.");
      }

      if (commandType === "pausePatrolAssignment" && current.status !== "inProgress") {
        throw new Error("Only an in-progress patrol can be paused.");
      }

      if (commandType === "resumePatrolAssignment" && current.status !== "paused") {
        throw new Error("Only a paused patrol can be resumed.");
      }

      if (commandType === "startPatrolAssignment" || commandType === "resumePatrolAssignment") {
        const competing = await tx.getFirstAsync<{ assignmentId: string }>(
          `
            SELECT assignment_id AS assignmentId
            FROM patrol_assignments
            WHERE owner_user_id = ?
              AND assignment_id <> ?
              AND status IN ('inProgress', 'paused')
            LIMIT 1
          `,
          [ownerUserId, assignment.assignmentId]
        );
        if (competing) {
          throw new Error("Finish or hand off the current patrol before starting another one.");
        }
      }

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
        requires_photo,
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
        requires_photo,
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
    throw new Error("РњР°СЂС€СЂСѓС‚ РЅРµ Р·Р°РіСЂСѓР¶РµРЅ РЅР° С‚РµР»РµС„РѕРЅ.");
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
        ON result.owner_user_id = assignment.owner_user_id
       AND result.assignment_id = assignment.assignment_id
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

export async function listMissingCompleteAssignmentAttachmentIds(assignmentId: string, pointId: string) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const db = await getDatabase();
  const command = await db.getFirstAsync<{ payloadJson: string }>(
    `
      SELECT payload_json AS payloadJson
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND command_type = 'completePatrolAssignment'
        AND entity_local_id = ?
        AND status IN ('pending', 'retryLater')
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, currentContourId, assignmentId]
  );

  if (!command) {
    return [];
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
  } catch {
    return [];
  }

  const pointResult = Array.isArray(payload.pointResults)
    ? payload.pointResults.find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && value.pointId === pointId)
    : undefined;
  const clientFileIds = Array.isArray(pointResult?.photoClientFileIds)
    ? pointResult.photoClientFileIds.filter((value): value is string => typeof value === "string")
    : [];

  if (clientFileIds.length === 0) {
    return [];
  }

  const placeholders = clientFileIds.map(() => "?").join(", ");
  const presentFiles = await db.getAllAsync<{ clientFileId: string }>(
    `
      SELECT client_file_id AS clientFileId
      FROM files
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND client_file_id IN (${placeholders})
    `,
    [ownerUserId, currentContourId, ...clientFileIds]
  );
  const presentIds = new Set(presentFiles.map((file) => file.clientFileId));
  return clientFileIds.filter((clientFileId) => !presentIds.has(clientFileId));
}

export async function restoreMissingPointAttachment(
  assignmentId: string,
  pointId: string,
  missingClientFileId: string,
  file: LocalMobileFile
) {
  const ownerUserId = await requireOwnerUserId();
  if (file.ownerUserId !== ownerUserId || file.assignmentId !== assignmentId || file.pointId !== pointId) {
    throw new Error("Вложение не соответствует текущему пользователю или точке.");
  }
  if (file.clientFileId === missingClientFileId) {
    throw new Error("Для восстановления требуется новый файл.");
  }

  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("Назначение не найдено на телефоне.");
  }
  if (assignment.status !== "completedLocal") {
    throw new Error("Восстановление доступно только для локально завершённого отчёта.");
  }

  const db = await getDatabase();
  const resultRef: { clientOperationId: string | null } = { clientOperationId: null };

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      const command = await tx.getFirstAsync<{
        clientOperationId: string;
        payloadJson: string;
      }>(
        `
          SELECT
            client_operation_id AS clientOperationId,
            payload_json AS payloadJson
          FROM outbox_commands
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND command_type = 'completePatrolAssignment'
            AND entity_local_id = ?
            AND status IN ('pending', 'retryLater')
          ORDER BY created_at_local DESC
          LIMIT 1
        `,
        [ownerUserId, currentContourId, assignmentId]
      );

      if (!command) {
        throw new Error("Не найдена ожидающая отправки команда завершения отчёта.");
      }

      const existingMissingFile = await tx.getFirstAsync<{ clientFileId: string }>(
        `
          SELECT client_file_id AS clientFileId
          FROM files
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND client_file_id = ?
          LIMIT 1
        `,
        [ownerUserId, currentContourId, missingClientFileId]
      );
      if (existingMissingFile) {
        throw new Error("Исходное вложение уже доступно на телефоне; повторное восстановление не требуется.");
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
      } catch {
        throw new Error("Не удалось прочитать payload завершённого отчёта.");
      }

      if (!Array.isArray(payload.pointResults)) {
        throw new Error("В отчёте отсутствуют результаты точек для восстановления.");
      }

      let replaced = false;
      const pointResults = payload.pointResults.map((value) => {
        if (!value || typeof value !== "object") {
          return value;
        }
        const pointResult = value as Record<string, unknown>;
        if (pointResult.pointId !== pointId) {
          return value;
        }
        const ids = Array.isArray(pointResult.photoClientFileIds)
          ? pointResult.photoClientFileIds.filter((id): id is string => typeof id === "string")
          : [];
        if (!ids.includes(missingClientFileId)) {
          return value;
        }
        replaced = true;
        return {
          ...pointResult,
          photoClientFileIds: ids.map((id) => (id === missingClientFileId ? file.clientFileId : id))
        };
      });

      if (!replaced) {
        throw new Error("Указанное отсутствующее вложение не относится к этой точке.");
      }

      const pointRow = await tx.getFirstAsync<{ photoClientFileIdsJson: string | null }>(
        `
          SELECT photo_client_file_ids_json AS photoClientFileIdsJson
          FROM point_results
          WHERE owner_user_id = ?
            AND assignment_id = ?
            AND point_id = ?
          LIMIT 1
        `,
        [ownerUserId, assignmentId, pointId]
      );
      if (!pointRow) {
        throw new Error("Результат точки не найден; восстановление остановлено без изменения отчёта.");
      }
      const persistedIds = parseStringArray(pointRow.photoClientFileIdsJson ?? null);
      const updatedPersistedIds = Array.from(new Set(
        (persistedIds.length > 0 ? persistedIds : [missingClientFileId])
          .map((id) => (id === missingClientFileId ? file.clientFileId : id))
      ));

      await insertLocalFileInTransaction(tx, {
        ...file,
        ownerUserId,
        contourId: currentContourId,
        assignmentId,
        pointId,
        status: "queued"
      });
      await tx.runAsync(
        `
          UPDATE point_results
          SET photo_client_file_ids_json = ?,
              sync_status = 'pending'
          WHERE owner_user_id = ?
            AND assignment_id = ?
            AND point_id = ?
        `,
        [JSON.stringify(updatedPersistedIds), ownerUserId, assignmentId, pointId]
      );
      await tx.runAsync(
        `
          UPDATE outbox_commands
          SET payload_json = ?,
              next_attempt_at = NULL,
              updated_at_local = ?
          WHERE client_operation_id = ?
            AND owner_user_id = ?
            AND contour_id = ?
            AND status IN ('pending', 'retryLater')
        `,
        [JSON.stringify({ ...payload, pointResults }), new Date().toISOString(), command.clientOperationId, ownerUserId, currentContourId]
      );

      resultRef.clientOperationId = command.clientOperationId;
    })
  );

  if (!resultRef.clientOperationId) {
    throw new Error("Не удалось сохранить восстановленное вложение.");
  }
  return { clientOperationId: resultRef.clientOperationId };
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
    throw new Error("Р’С‹РїРѕР»РЅРёС‚Рµ РІС…РѕРґ РІ РјРѕР±РёР»СЊРЅС‹Р№ Р°РєРєР°СѓРЅС‚.");
  }

  return ownerUserId;
}

async function assertPointActionAllowed(assignmentId: string) {
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("РќР°Р·РЅР°С‡РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ РЅР° С‚РµР»РµС„РѕРЅРµ.");
  }

  if (assignment.status === "cancelled" || assignment.status === "cancelledServer") {
    throw new Error("Р—Р°СЏРІРєР° РѕС‚РјРµРЅРµРЅР° РґРёСЃРїРµС‚С‡РµСЂРѕРј. Р”РµР№СЃС‚РІРёСЏ РїРѕ РѕР±С…РѕРґСѓ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅС‹.");
  }

  if (["completed", "completedServer", "completedLocal"].includes(assignment.status)) {
    throw new Error("РћР±С…РѕРґ СѓР¶Рµ Р·Р°РІРµСЂС€С‘РЅ. РР·РјРµРЅРµРЅРёРµ С‚РѕС‡РµРє РЅРµРґРѕСЃС‚СѓРїРЅРѕ.");
  }

  if (assignment.status !== "inProgress") {
    throw new Error("Р”РµР№СЃС‚РІРёСЏ СЃ РјРµС‚РєР°РјРё РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РЅР°С‡Р°Р»Р° РѕР±С…РѕРґР°.");
  }
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
  await assertPointActionAllowed(assignmentId);
  const point = await getPointForFill(assignmentId, pointId);
  if (!point) {
    throw new Error("РњРµС‚РєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅР° РЅР° С‚РµР»РµС„РѕРЅ.");
  }

  const completedAtLocal = new Date().toISOString();
  if (point.confirmationType !== "nfc" && point.confirmationType !== "qr" && !comment.trim()) {
    throw new Error("Р”Р»СЏ СЂСѓС‡РЅРѕРіРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СѓРєР°Р¶РёС‚Рµ РїСЂРёС‡РёРЅСѓ, РїРѕС‡РµРјСѓ РјРµС‚РєСѓ РЅРµ СѓРґР°Р»РѕСЃСЊ РѕС‚СЃРєР°РЅРёСЂРѕРІР°С‚СЊ.");
  }

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
      await supersedePendingPointStatusCommands(tx, ownerUserId, assignmentId, pointId);
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
    message: status === "issue" ? "РњРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР° РєР°Рє РЅРµРёСЃРїСЂР°РІРЅР°СЏ." : "РњРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР° РєР°Рє РёСЃРїСЂР°РІРЅР°СЏ.",
    payload: { assignmentId, status, photoCount: point.photoClientFileIds.length }
  }).catch(() => undefined);
}
