import { getAssignmentById, getReportReadiness, getAssignmentByRequestId, getAssignmentScanPolicy, repairAssignmentContourBinding } from './patrolAssignmentRepository';
import type { ActiveAssignment, PointListItem, PointForFill, DeferPointInput } from './patrolRepositoryTypes';
import { getRequestBoardItem } from './patrolRequestBoardRepository';
import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { currentContourId } from "@/core/environments";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { withOwnerExclusiveTransactionAsync } from "@/db/ownerTransaction";
import { insertLocalFileInTransaction } from "@/db/repositories/filesRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";
import { getPointForFillOwnedSql, listAssignmentPointsOwnedSql } from "@/db/repositories/patrolPointOwnershipQueries";
import { parseStringArray, supersedePendingPointStatusCommands, updateLatestPendingMarkPhotoPayloadInTransaction, upsertPointResult, upsertPointResultInTransaction } from "@/db/repositories/patrolPersistence";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { LocalMobileFile } from "@/domain/files/fileTypes";
import { getCompletionAttachmentFailure } from "@/domain/files/completionAttachmentPolicy";
import { isPhotoEvidenceRequired, type PhotoEvidenceStatus } from "@/domain/patrol/photoEvidencePolicy";
import { normalizePointDraft } from "@/domain/patrol/pointDraftPolicy";
import { canCreateCompletionCommand, isTerminalPointStatus } from "@/domain/patrol/reportReadinessPolicy";

import { canPatrolAction, patrolActionError } from "@/domain/patrol/patrolStateMachine";
import { OutboxCommand } from "@/domain/sync/syncTypes";
import { getNfcCodeCandidates, normalizeNfcCode } from "@/services/nfcService";
import { getLocalFileInfo } from "@/services/fileStorageService";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
export { getAssignmentById, listAssignmentPoints, getAssignmentProgress, getReportReadiness, getReportPreviewPoints, getActiveAssignment, getAssignmentByRequestId, getActiveAssignmentWithProgress, getNextPendingAssignmentPoint, getAssignmentScanPolicy } from './patrolAssignmentRepository';
export type { AssignmentScanPolicy, RequestBoardItem, ActiveAssignment, PointListItem, PointForFill, AssignmentProgress, ReportPreviewPoint, ReportProblem, ReportReadiness, DeferPointInput } from './patrolRepositoryTypes';
export { listRequestBoard, getRequestBoardItem } from './patrolRequestBoardRepository';

type SqlExecutor = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

const nfcDisabledMessage = "\u004e\u0046\u0043-\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0430 \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e.";
const qrDisabledMessage = "\u0051\u0052-\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0430 \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u043e.";

function assertPatrolAction(action: Parameters<typeof canPatrolAction>[0], status: string) {
  if (!canPatrolAction(action, status)) {
    throw new Error(patrolActionError(action, status) ?? "Действие недоступно для текущего статуса назначения.");
  }
}

export async function acceptRequestLocally(requestId: string, selectedEmployeeId?: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const request = await getRequestBoardItem(requestId);
  if (!request) {
    throw new Error("Заявка не загружена на телефон.");
  }

  const existing = await getAssignmentByRequestId(requestId);
  if (existing && existing.status !== "assigned") {
    return { assignment: existing, created: false };
  }

  assertPatrolAction("acceptRequest", request.status);
  const performer = await db.getFirstAsync<{ employeeId: string | null; available: number }>(
    "SELECT assigned_employee_id AS employeeId, performer_selection_available AS available FROM patrol_request_board WHERE request_id = ? AND owner_user_id = ?", [requestId, ownerUserId]);
  const employeeId = performer?.employeeId ?? selectedEmployeeId ?? null;
  if (performer?.available && !employeeId) throw new Error("Выберите исполнителя обхода.");
  if (selectedEmployeeId && !performer?.available) throw new Error("Обновите сервер для выбора исполнителя.");
  if (selectedEmployeeId && performer?.employeeId && selectedEmployeeId !== performer.employeeId) throw new Error("Назначенного сотрудника меняет диспетчер.");
  const employee = employeeId ? await db.getFirstAsync<{ fullName: string }>("SELECT full_name AS fullName FROM mobile_employees WHERE owner_user_id = ? AND employee_id = ?", [ownerUserId, employeeId]) : null;
  if (employeeId && !employee) throw new Error("Сотрудник не связан с текущим аккаунтом.");

  const route = await db.getFirstAsync<{
    version: number;
    allowFreeOrder: number | null;
    nfcEnabled: number | null;
    qrFallbackEnabled: number | null;
  }>(
    "SELECT version, allow_free_order AS allowFreeOrder, nfc_enabled AS nfcEnabled, qr_fallback_enabled AS qrFallbackEnabled FROM routes WHERE route_id = ? LIMIT 1",
    [request.routeId]
  );
  const snapshotVersion = existing?.routeVersionNo ?? route?.version ?? 0;
  const snapshotAllowFreeOrder = existing?.snapshotAllowFreeOrder ?? (route?.allowFreeOrder !== 0 ? 1 : 0);
  const snapshotNfcEnabled = existing?.snapshotNfcEnabled ?? (route?.nfcEnabled === 1 ? 1 : 0);
  const snapshotQrFallbackEnabled = existing?.snapshotQrFallbackEnabled ?? (route?.qrFallbackEnabled !== 0 ? 1 : 0);
  const assignmentId = existing?.assignmentId ?? Crypto.randomUUID();
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
      acceptedAtLocal,
      ...(employeeId ? { employeeId } : {})
    },
    createdAtLocal: acceptedAtLocal,
    attemptCount: 0,
    status: "pending"
  };

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const concurrentAssignment = await tx.getFirstAsync<{ assignmentId: string }>(
        `
          SELECT assignment_id AS assignmentId
          FROM patrol_assignments
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND request_id = ?
            AND assignment_id <> ?
            AND status NOT IN ('completed', 'completedServer', 'cancelled', 'cancelledServer', 'conflict')
          LIMIT 1
        `,
        [ownerUserId, currentContourId, request.requestId, assignmentId]
      );
      if (concurrentAssignment) {
        throw new Error("Заявка уже принята на этом телефоне. Обновите экран.");
      }

      const currentRequest = await tx.getFirstAsync<{ status: string }>(
        `
          SELECT status
          FROM patrol_request_board
          WHERE owner_user_id = ?
            AND request_id = ?
          LIMIT 1
        `,
        [ownerUserId, request.requestId]
      );
      if (!currentRequest) {
        throw new Error("Заявка больше не доступна на телефоне.");
      }
      assertPatrolAction("acceptRequest", currentRequest.status);

      if (existing) {
        const currentAssignment = await tx.getFirstAsync<{ status: string }>(
          `
            SELECT status
            FROM patrol_assignments
            WHERE owner_user_id = ?
              AND assignment_id = ?
              AND contour_id = ?
            LIMIT 1
          `,
          [ownerUserId, assignmentId, currentContourId]
        );
        if (!currentAssignment || currentAssignment.status !== "assigned") {
          throw new Error("Состояние назначения уже изменилось. Обновите список заявок.");
        }

        const pendingAccept = await tx.getFirstAsync<{ clientOperationId: string }>(
          `
            SELECT client_operation_id AS clientOperationId
            FROM outbox_commands
            WHERE owner_user_id = ?
              AND contour_id = ?
              AND command_type = 'acceptPatrolRequest'
              AND entity_local_id = ?
              AND status IN ('pending', 'sending', 'retryLater', 'waiting_network', 'waiting_auth')
            LIMIT 1
          `,
          [ownerUserId, currentContourId, assignmentId]
        );
        await tx.runAsync(
          `
            UPDATE patrol_assignments
            SET status = 'accepted',
                revision = revision + 1
            WHERE owner_user_id = ?
              AND assignment_id = ?
              AND contour_id = ?
          `,
          [ownerUserId, assignmentId, currentContourId]
        );
        if (!pendingAccept) {
          await insertOutboxCommandInTransaction(tx, command);
        }
      } else {
        await tx.runAsync(
          `
            INSERT INTO patrol_assignments (
              assignment_id,
              owner_user_id,
              contour_id,
              request_id,
              route_id,
              status,
              started_at_local,
              completed_at_local,
              revision,
              route_version_no,
              snapshot_version,
              snapshot_created_at,
              snapshot_source,
              snapshot_allow_free_order,
              snapshot_nfc_enabled,
              snapshot_qr_fallback_enabled
            )
            VALUES (?, ?, ?, ?, ?, 'accepted', NULL, NULL, 0, ?, ?, ?, 'local', ?, ?, ?)
          `,
          [assignmentId, ownerUserId, currentContourId, request.requestId, request.routeId, snapshotVersion, snapshotVersion, acceptedAtLocal, snapshotAllowFreeOrder, snapshotNfcEnabled, snapshotQrFallbackEnabled]
        );

        await snapshotRoutePointsInTransaction(tx, assignmentId, request.routeId);
        await insertOutboxCommandInTransaction(tx, command);
      }

      await tx.runAsync("UPDATE patrol_assignments SET employee_id = ? WHERE assignment_id = ? AND owner_user_id = ? AND contour_id = ?", [employeeId, assignmentId, ownerUserId, currentContourId]);
      if (employee) await tx.runAsync("UPDATE patrol_request_board SET assigned_full_name = ?, assigned_employee_id = ? WHERE request_id = ? AND owner_user_id = ?", [employee.fullName, employeeId, requestId, ownerUserId]);
      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = 'accepted'
          WHERE owner_user_id = ?
            AND request_id = ?
        `,
        [ownerUserId, request.requestId]
      );
    })
  );

  const acceptedAssignment = {
    assignment: existing
      ? { ...existing, status: "accepted", revision: existing.revision + 1 }
      : {
          assignmentId,
          requestId: request.requestId,
          routeId: request.routeId,
          routeName: request.routeName,
          status: "accepted",
          startedAtLocal: null,
          completedAtLocal: null,
          revision: 0,
          routeVersionNo: snapshotVersion,
          snapshotVersion,
          snapshotCreatedAt: acceptedAtLocal,
          snapshotSource: "local",
          snapshotAllowFreeOrder,
          snapshotNfcEnabled,
          snapshotQrFallbackEnabled
        } satisfies ActiveAssignment,
    created: !existing
  };
  requestSyncAfterMutation();
  return acceptedAssignment;
}
export async function releaseAcceptedRequestLocally(assignmentId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("Назначение не найдено на телефоне.");
  }

  assertPatrolAction("releaseAssignment", assignment.status);
  if (assignment.startedAtLocal) {
    throw new Error("Заявку можно вернуть только до начала обхода.");
  }

  const pendingAccept = await db.getFirstAsync<{ clientOperationId: string }>(
    `
      SELECT client_operation_id AS clientOperationId
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND command_type = 'acceptPatrolRequest'
        AND entity_local_id = ?
        AND status = 'pending'
      LIMIT 1
    `,
    [ownerUserId, currentContourId, assignmentId]
  );

  if (pendingAccept) {
    await withSqliteBusyRetry(() =>
      withProtectedExclusiveTransactionAsync(db, async (tx) => {
        const pendingAcceptInTransaction = await tx.getFirstAsync<{ clientOperationId: string }>(
          `
            SELECT client_operation_id AS clientOperationId
            FROM outbox_commands
            WHERE owner_user_id = ? AND contour_id = ?
              AND command_type = "acceptPatrolRequest"
              AND entity_local_id = ? AND status = "pending"
            LIMIT 1
          `,
          [ownerUserId, currentContourId, assignmentId]
        );
        if (!pendingAcceptInTransaction) {
          throw new Error("Состояние принятия заявки уже изменилось. Повторите возврат.");
        }
        await tx.runAsync(
          `
            UPDATE outbox_commands
            SET status = 'cancelled',
                last_error = ?,
                next_attempt_at = NULL,
                last_attempt_at = NULL,
                updated_at_local = ?
            WHERE owner_user_id = ?
              AND contour_id = ?
              AND client_operation_id = ?
              AND status = 'pending'
          `,
          ["Принятие заявки отменено локально до отправки.", new Date().toISOString(), ownerUserId, currentContourId, pendingAccept.clientOperationId]
        );
        await tx.runAsync(
          `
            UPDATE patrol_request_board
            SET status = CASE WHEN assigned_full_name IS NULL THEN 'available' ELSE 'assigned' END
            WHERE owner_user_id = ? AND request_id = ?
          `,
          [ownerUserId, assignment.requestId]
        );
        await tx.runAsync(
          "DELETE FROM point_results WHERE owner_user_id = ? AND assignment_id = ?",
          [ownerUserId, assignmentId]
        );
        await tx.runAsync("DELETE FROM assignment_route_points WHERE assignment_id = ?", [assignmentId]);
        await tx.runAsync(
          "DELETE FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ?",
          [ownerUserId, assignmentId]
        );
      })
    );
    requestSyncAfterMutation();
    return;
  }

  const pendingRelease = await db.getFirstAsync<{ clientOperationId: string }>(
    `
      SELECT client_operation_id AS clientOperationId
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND command_type = 'releasePatrolRequest'
        AND entity_local_id = ?
        AND contour_id = ?
        AND status IN ('pending', 'sending', 'retryLater')
      LIMIT 1
    `,
    [ownerUserId, assignmentId, currentContourId]
  );
  if (pendingRelease) {
    throw new Error("Возврат заявки уже сохранён и ожидает подтверждения сервера.");
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
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const currentAssignment = await tx.getFirstAsync<{ status: string }>(
        `
          SELECT status
          FROM patrol_assignments
          WHERE owner_user_id = ?
            AND assignment_id = ?
            AND contour_id = ?
          LIMIT 1
        `,
        [ownerUserId, assignment.assignmentId, currentContourId]
      );
      if (!currentAssignment) {
        throw new Error("Назначение больше не доступно на телефоне.");
      }
      assertPatrolAction("releaseAssignment", currentAssignment.status);

      const releaseAlreadyQueued = await tx.getFirstAsync<{ clientOperationId: string }>(
        `
          SELECT client_operation_id AS clientOperationId
          FROM outbox_commands
          WHERE owner_user_id = ?
            AND command_type = 'releasePatrolRequest'
            AND entity_local_id = ?
            AND contour_id = ?
            AND status IN ('pending', 'sending', 'retryLater')
          LIMIT 1
        `,
        [ownerUserId, assignment.assignmentId, currentContourId]
      );
      if (releaseAlreadyQueued) {
        throw new Error("Возврат заявки уже сохранён и ожидает подтверждения сервера.");
      }

      await tx.runAsync(
        `
          UPDATE patrol_assignments
          SET status = 'releasePending'
          WHERE owner_user_id = ? AND assignment_id = ? AND contour_id = ?
        `,
        [ownerUserId, assignment.assignmentId, currentContourId]
      );
      await tx.runAsync(
        `
          UPDATE patrol_request_board
          SET status = 'releasePending'
          WHERE owner_user_id = ? AND request_id = ?
        `,
        [ownerUserId, assignment.requestId]
      );
      await insertOutboxCommandInTransaction(tx, command);
    })
  );
  requestSyncAfterMutation();
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

type ExistingPointResultForScan = {
  status: PointListItem["status"];
  comment: string | null;
  manualReason?: string | null;
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

type PointScanCommandType = "scanPatrolPointNfc" | "scanPatrolPointQr";

async function findExistingPointScanCommand(
  executor: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  commandType: PointScanCommandType
) {
  const commands = await executor.getAllAsync<{ payloadJson: string }>(
    `
      SELECT payload_json AS payloadJson
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND command_type = ?
        AND entity_local_id = ?
        AND status NOT IN ('rejected', 'conflict', 'superseded', 'cancelled', 'invalidPayload')
      ORDER BY created_at_local ASC
    `,
    [ownerUserId, currentContourId, commandType, pointId]
  );

  return commands.some((command) => {
    try {
      const payload = JSON.parse(command.payloadJson) as { assignmentId?: unknown; pointId?: unknown };
      return payload.assignmentId === assignmentId && payload.pointId === pointId;
    } catch {
      return false;
    }
  });
}
export async function scanPointByNfc(assignmentId: string, nfcCode: string | string[]) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const scanPolicy = await assertScanMethodAllowed(assignmentId, "nfc");
  const scannedCodes = Array.isArray(nfcCode) ? nfcCode : [nfcCode];
  const scannedCandidates = Array.from(new Set(scannedCodes.flatMap(getNfcCodeCandidates)));
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
        AND assignment.owner_user_id = ?
        AND assignment.contour_id = ?
        AND point.route_id = assignment.route_id
    `,
    [assignmentId, ownerUserId, currentContourId]
  );

  const point = points.find((candidate) => {
    if (!candidate.nfcUidHash) {
      return false;
    }

    const expectedCandidates = getNfcCodeCandidates(candidate.nfcUidHash);
    return expectedCandidates.some((expected) => scannedCandidates.includes(expected));
  });

  const normalizedNfcCode = normalizeNfcCode(point?.nfcUidHash ?? scannedCodes[0] ?? "");
  const scannedNfcCode = normalizeNfcCode(scannedCodes[0] ?? "");

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

  await assertPointOrderAllowed(db, ownerUserId, assignmentId, point.pointId, point.orderIndex, scanPolicy.allowFreeOrder);

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

  let duplicateScan = false;

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      if (await findExistingPointScanCommand(tx, ownerUserId, assignmentId, point.pointId, "scanPatrolPointNfc")) {
        duplicateScan = true;
        return;
      }

      await assertPointOrderAllowed(tx, ownerUserId, assignmentId, point.pointId, point.orderIndex, scanPolicy.allowFreeOrder);

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
        photoClientFileIds: parseStringArray(existingResult?.photoClientFileIdsJson ?? null),
        requireInProgress: true
      });

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  if (duplicateScan) {
    return {
      matched: true as const,
      alreadyScanned: true as const,
      point: {
        pointId: point.pointId,
        routeId: point.routeId,
        name: point.name,
        orderIndex: point.orderIndex,
        required: point.required === 1,
        requiresPhoto: point.requiresPhoto === 1,
        status: "scanned" as const,
        comment: existingResult?.comment ?? null,
        issueTypeId: existingResult?.issueTypeId ?? null,
        confirmationType: existingResult?.confirmationType ?? "nfc",
        photoClientFileIds: parseStringArray(existingResult?.photoClientFileIdsJson ?? null)
      } satisfies PointListItem
    };
  }

  requestSyncAfterMutation();
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
  const scanPolicy = await assertScanMethodAllowed(assignmentId, "qr");
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
        AND assignment.owner_user_id = ?
        AND assignment.contour_id = ?
        AND point.route_id = assignment.route_id
        AND point.qr_code_hash = ?
      LIMIT 1
    `,
    [assignmentId, ownerUserId, currentContourId, normalizedQr]
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

  await assertPointOrderAllowed(db, ownerUserId, assignmentId, point.pointId, point.orderIndex, scanPolicy.allowFreeOrder);

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

  let duplicateScan = false;

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      if (await findExistingPointScanCommand(tx, ownerUserId, assignmentId, point.pointId, "scanPatrolPointQr")) {
        duplicateScan = true;
        return;
      }

      await assertPointOrderAllowed(tx, ownerUserId, assignmentId, point.pointId, point.orderIndex, scanPolicy.allowFreeOrder);

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
        photoClientFileIds: parseStringArray(existingResult?.photoClientFileIdsJson ?? null),
        requireInProgress: true
      });

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  if (duplicateScan) {
    return {
      matched: true as const,
      alreadyScanned: true as const,
      point: {
        pointId: point.pointId,
        routeId: point.routeId,
        name: point.name,
        orderIndex: point.orderIndex,
        required: point.required === 1,
        requiresPhoto: point.requiresPhoto === 1,
        status: "scanned" as const,
        comment: existingResult?.comment ?? null,
        issueTypeId: existingResult?.issueTypeId ?? null,
        confirmationType: existingResult?.confirmationType ?? "qr",
        photoClientFileIds: parseStringArray(existingResult?.photoClientFileIdsJson ?? null)
      } satisfies PointListItem
    };
  }
  requestSyncAfterMutation();

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

export async function getPointForFill(assignmentId: string, pointId: string, ownerUserId: string, contourId: string) {
  const db = await getDatabase();
  await repairAssignmentContourBinding(db, assignmentId, ownerUserId);

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
  manualReason?: string | null;
    confirmationType: "nfc" | "qr" | "manual" | null;
    scannedAtLocal: string | null;
    completedAtLocal: string | null;
    issueTypeId: string | null;
    deferredReason: string | null;
    photoClientFileIdsJson: string | null;
  }>(
    getPointForFillOwnedSql,
    [assignmentId, pointId, ownerUserId, contourId]
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
    manualReason: row.manualReason,
    confirmationType: row.confirmationType,
    scannedAtLocal: row.scannedAtLocal,
    completedAtLocal: row.completedAtLocal,
    issueTypeId: row.issueTypeId,
    deferredReason: row.deferredReason,
    photoClientFileIds: parseStringArray(row.photoClientFileIdsJson)
  } satisfies PointForFill;
}

export async function assertPointCanBeOpened(
  assignmentId: string,
  pointId: string,
  action: "editPoint" | "attachMedia" = "editPoint"
) {
  const ownerUserId = await requireOwnerUserId();
  await assertPointActionAllowed(assignmentId, action);
  const point = await getPointForFill(assignmentId, pointId, ownerUserId, currentContourId);
  if (!point) {
    throw new Error("\u041c\u0435\u0442\u043a\u0430 \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u0430 \u043d\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d.");
  }

  const scanPolicy = await getAssignmentScanPolicy(assignmentId);
  const db = await getDatabase();
  await assertPointOrderAllowed(db, ownerUserId, assignmentId, pointId, point.orderIndex, scanPolicy.allowFreeOrder);
  return point;
}

export async function beginManualPointInspection(assignmentId: string, pointId: string, reason: string) {
  const manualReason = reason.trim();
  if (!manualReason || manualReason.length > 120) throw new Error("Укажите короткую причину: от 1 до 120 символов.");
  const ownerUserId = await requireOwnerUserId();
  const point = await assertPointCanBeOpened(assignmentId, pointId);
  if (point.status === "ok" || point.status === "issue") throw new Error("Результат точки уже сохранён.");
  await upsertPointResult({ ownerUserId, assignmentId, pointId,
    status: "pending", comment: point.comment, issueTypeId: point.issueTypeId,
    severity: null, deferredReason: null, completedAtLocal: null, syncStatus: "localOnly",
    confirmationType: "manual", nfcUidHash: null, scannedAtLocal: null,
    manualReason, photoClientFileIds: point.photoClientFileIds, requireInProgress: true });
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
  const draft = await persistPointDraft(assignmentId, pointId, input, "localOnly");

  void logMobileAction({
    eventType: "patrol.point.deferred",
    entityType: "patrolPoint",
    entityId: pointId,
    message: "Метка отложена на потом.",
    payload: { assignmentId, selectedStatus: draft.selectedStatus, photoCount: draft.photoCount }
  }).catch(() => undefined);
}

export async function savePointDraft(assignmentId: string, pointId: string, input: DeferPointInput = {}, scope?: DataOwnerContext) {
  await persistPointDraft(assignmentId, pointId, input, "localOnly", scope);
}

async function persistPointDraft(
  assignmentId: string,
  pointId: string,
  input: DeferPointInput,
  syncStatus: "localOnly",
  scope?: DataOwnerContext
) {
  if (scope) await assertDataOwnerContext(scope);
  const ownerUserId = scope?.ownerUserId ?? await requireOwnerUserId();
  await assertPointActionAllowed(assignmentId, "editPoint");
  const point = await assertPointCanBeOpened(assignmentId, pointId);
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const draft = normalizePointDraft(input, point);
  const photoClientFileIds = input.photoClientFileIds ?? point.photoClientFileIds;

  const db = await getDatabase();
  await withProtectedExclusiveTransactionAsync(db, async tx => {
    if (scope) await assertDataOwnerContext(scope);
    await upsertPointResultInTransaction(tx, {
    ownerUserId,
    assignmentId,
    pointId,
    status: input.manualReason !== undefined && !input.selectedStatus ? point.status : "deferred",
    comment: draft.comment ?? point.comment,
    issueTypeId: draft.issueTypeId,
    severity: null,
    deferredReason: draft.deferredReason,
    completedAtLocal: null,
    syncStatus,
    confirmationType: point.confirmationType ?? "manual",
    manualReason: input.manualReason,
    nfcUidHash: point.nfcUidHash,
    scannedAtLocal: point.scannedAtLocal,
    photoClientFileIds,
    requireInProgress: true
    });
    if (scope) await assertDataOwnerContext(scope);
  });

  return {
    selectedStatus: draft.selectedStatus,
    photoCount: photoClientFileIds.length
  };
}

export async function skipPoint(assignmentId: string, pointId: string, input: Pick<DeferPointInput, "comment" | "photoClientFileIds"> = {}) {
  const ownerUserId = await requireOwnerUserId();
  await assertPointActionAllowed(assignmentId, "editPoint");
  const point = await assertPointCanBeOpened(assignmentId, pointId);
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const completedAtLocal = point.status === "skipped" && point.completedAtLocal ? point.completedAtLocal : new Date().toISOString();
  const comment = input.comment ?? point.comment;
  const photoClientFileIds = input.photoClientFileIds ?? point.photoClientFileIds;
  const db = await getDatabase();
  // A pre-extension server reads markPatrolPointOk as an ordinary successful
  // mark. Do not fabricate that result: keep the local skipped result for the
  // final report and require an upgraded server for strict-order progression.
  const capability = await db.getFirstAsync<{ enabled: number }>(
    "SELECT patrol_point_result_status_extension AS enabled FROM mobile_capabilities WHERE owner_user_id = ? AND contour_id = ?",
    [ownerUserId, currentContourId]
  );
  const command: OutboxCommand | null = capability?.enabled ? {
    clientOperationId: Crypto.randomUUID(), ownerUserId,
    commandType: "markPatrolPointOk", entityType: "patrolPoint", entityLocalId: pointId, entityServerId: pointId,
    payload: { assignmentId, pointId, pointResultStatus: "skipped", comment, manualReason: "Метка недоступна", photoClientFileIds, completedAtLocal },
    createdAtLocal: completedAtLocal, attemptCount: 0, status: "pending"
  } : null;
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async (tx) => {
    await supersedePendingPointStatusCommands(tx, ownerUserId, assignmentId, pointId);
    await upsertPointResultInTransaction(tx, {
      ownerUserId, assignmentId, pointId, status: "skipped", comment, issueTypeId: null, severity: null,
      deferredReason: "Метка недоступна", completedAtLocal, syncStatus: "pending", confirmationType: "manual",
      nfcUidHash: null, scannedAtLocal: point.scannedAtLocal, photoClientFileIds, requireInProgress: true
    });
    if (command) await insertOutboxCommandInTransaction(tx, command);
  }));
  requestSyncAfterMutation();

  void logMobileAction({
    eventType: "patrol.point.skipped",
    entityType: "patrolPoint",
    entityId: pointId,
    message: "Метка отмечена как недоступная.",
    payload: { assignmentId, attachmentCount: (input.photoClientFileIds ?? point.photoClientFileIds).length }
  }).catch(() => undefined);
}

export async function attachPhotoToPoint(assignmentId: string, pointId: string, file: LocalMobileFile, context?: DataOwnerContext) {
  const scope = context ?? await captureDataOwnerContext();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  if (file.ownerUserId !== ownerUserId || (file.contourId && file.contourId !== scope.contourId) || (file.assignmentId && file.assignmentId !== assignmentId) || (file.pointId && file.pointId !== pointId)) throw new Error("Вложение относится к другому аккаунту или метке.");
  await assertPointActionAllowed(assignmentId, "attachMedia");
  const point = await assertPointCanBeOpened(assignmentId, pointId, "attachMedia");
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const photoClientFileIds = Array.from(new Set([...point.photoClientFileIds, file.clientFileId]));
  const db = await getDatabase();
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await assertDataOwnerContext(scope);
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
      await assertDataOwnerContext(scope);
    })
  );

  requestSyncAfterMutation();
  void logMobileAction({
    eventType: file.mediaKind === "video" ? "patrol.video.added" : "patrol.photo.added",
    entityType: "patrolPoint",
    entityId: pointId,
    message: file.mediaKind === "video" ? "Видео добавлено к метке." : "Фото добавлено к метке.",
    payload: { assignmentId, clientFileId: file.clientFileId }
  }).catch(() => undefined);
}

/** Files that left the phone, or are leaving it, are evidence and stay read-only. */
const sentAttachmentStatuses = new Set(["uploading", "uploaded", "linked", "deletedAfterRetention"]);
const attachmentSentMessage = "Вложение уже отправлено. Изменить или удалить его нельзя.";
const attachmentQueuedMessage = "Вложение уже передано в очередь отправки. Изменить или удалить его нельзя.";
const attachmentReadOnlyMessage = "Отчёт завершён. Вложения доступны только для просмотра.";

type AttachmentReference = { clientOperationId: string; commandType: string; status: string; attemptCount: number; payloadJson: string };

/**
 * A point command that was never attempted can still be rewritten: the sync
 * engine re-reads its payload before claiming it. Anything attempted, sent or
 * accepted may already be on the server under its clientOperationId.
 */
function isRewritablePointCommand(reference: AttachmentReference, assignmentId: string, pointId: string) {
  if (reference.status !== "pending" || Number(reference.attemptCount) !== 0) return false;
  if (reference.commandType !== "markPatrolPointOk" && reference.commandType !== "markPatrolPointIssue") return false;
  try {
    const payload = JSON.parse(reference.payloadJson) as Record<string, unknown>;
    return payload.assignmentId === assignmentId && payload.pointId === pointId;
  } catch {
    return false;
  }
}

async function listAttachmentReferences(executor: SqlExecutor, ownerUserId: string, clientFileId: string) {
  return executor.getAllAsync<AttachmentReference>(
    `
      SELECT client_operation_id AS clientOperationId, command_type AS commandType, status,
        attempt_count AS attemptCount, payload_json AS payloadJson
      FROM outbox_commands
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND status NOT IN ('superseded', 'cancelled', 'cancelledLocal')
        AND (entity_local_id = ? OR instr(payload_json, ?) > 0)
    `,
    [ownerUserId, currentContourId, clientFileId, `"${clientFileId}"`]
  );
}

async function findAttachmentEditBlock(
  executor: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  file: { clientFileId: string; status: string }
) {
  if (sentAttachmentStatuses.has(file.status)) return attachmentSentMessage;
  const references = await listAttachmentReferences(executor, ownerUserId, file.clientFileId);
  return references.some((reference) => !isRewritablePointCommand(reference, assignmentId, pointId))
    ? attachmentQueuedMessage
    : null;
}

/**
 * Why each attachment of a point cannot be changed. Attachments missing from
 * the result can be deleted or replaced while the point is not yet sent.
 */
export async function listPointAttachmentEditBlocks(assignmentId: string, pointId: string): Promise<Record<string, string>> {
  const ownerUserId = await requireOwnerUserId();
  const db = await getDatabase();
  const assignment = await db.getFirstAsync<{ status: string }>(
    "SELECT status FROM patrol_assignments WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
    [ownerUserId, currentContourId, assignmentId]
  );
  const files = await db.getAllAsync<{ clientFileId: string; status: string }>(
    `SELECT client_file_id AS clientFileId, status FROM files
      WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND point_id = ?`,
    [ownerUserId, currentContourId, assignmentId, pointId]
  );
  const editable = canPatrolAction("attachMedia", assignment?.status ?? "missing");
  const blocks: Record<string, string> = {};
  for (const file of files) {
    const block = editable
      ? await findAttachmentEditBlock(db, ownerUserId, assignmentId, pointId, file)
      : attachmentReadOnlyMessage;
    if (block) blocks[file.clientFileId] = block;
  }
  return blocks;
}

/** Remove one unsent attachment from a point. The caller deletes the managed file after commit. */
export async function deletePointAttachment(assignmentId: string, pointId: string, clientFileId: string, context?: DataOwnerContext) {
  return detachPointAttachment(assignmentId, pointId, clientFileId, null, context);
}

/** Swap an unsent attachment for a new one in the same position of the point result. */
export async function replacePointAttachment(
  assignmentId: string,
  pointId: string,
  clientFileId: string,
  replacement: LocalMobileFile,
  context?: DataOwnerContext
) {
  return detachPointAttachment(assignmentId, pointId, clientFileId, replacement, context);
}

async function detachPointAttachment(
  assignmentId: string,
  pointId: string,
  clientFileId: string,
  replacement: LocalMobileFile | null,
  context?: DataOwnerContext
) {
  const scope = context ?? await captureDataOwnerContext();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
  if (replacement && (replacement.ownerUserId !== ownerUserId || (replacement.contourId && replacement.contourId !== scope.contourId)
    || (replacement.assignmentId && replacement.assignmentId !== assignmentId) || (replacement.pointId && replacement.pointId !== pointId))) {
    throw new Error("Вложение относится к другому аккаунту или метке.");
  }
  if (replacement?.clientFileId === clientFileId) {
    throw new Error("Для замены требуется новый файл.");
  }

  const db = await getDatabase();
  const outcome: { removedLocalPath: string | null; mediaKind: string | null } = { removedLocalPath: null, mediaKind: null };
  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await assertDataOwnerContext(scope);
      const assignment = await tx.getFirstAsync<{ status: string }>(
        "SELECT status FROM patrol_assignments WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?",
        [ownerUserId, currentContourId, assignmentId]
      );
      if (!assignment) throw new Error("Назначение не найдено на телефоне.");
      if (!canPatrolAction("attachMedia", assignment.status)) throw new Error(attachmentReadOnlyMessage);

      const file = await tx.getFirstAsync<{ clientFileId: string; status: string; localPath: string; assignmentId: string | null; pointId: string | null; mediaKind: string | null }>(
        `SELECT client_file_id AS clientFileId, status, local_path AS localPath, assignment_id AS assignmentId,
            point_id AS pointId, media_kind AS mediaKind
          FROM files WHERE owner_user_id = ? AND contour_id = ? AND client_file_id = ? LIMIT 1`,
        [ownerUserId, currentContourId, clientFileId]
      );
      if (!file || file.assignmentId !== assignmentId || file.pointId !== pointId) {
        throw new Error("Вложение относится к другому аккаунту или метке.");
      }
      const block = await findAttachmentEditBlock(tx, ownerUserId, assignmentId, pointId, file);
      if (block) throw new Error(block);

      const swap = (ids: string[]) => Array.from(new Set(replacement
        ? ids.map((id) => (id === clientFileId ? replacement.clientFileId : id))
        : ids.filter((id) => id !== clientFileId)));

      // Only never-attempted point commands are left after the guard above; a
      // command claimed in the meantime fails the conditional update and rolls back.
      for (const reference of await listAttachmentReferences(tx, ownerUserId, clientFileId)) {
        if (!isRewritablePointCommand(reference, assignmentId, pointId)) throw new Error(attachmentQueuedMessage);
        const payload = JSON.parse(reference.payloadJson) as Record<string, unknown>;
        const ids = Array.isArray(payload.photoClientFileIds) ? payload.photoClientFileIds.filter((id): id is string => typeof id === "string") : [];
        const rewrite = await tx.runAsync(
          `UPDATE outbox_commands SET payload_json = ?, updated_at_local = ?
            WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ? AND status = 'pending' AND attempt_count = 0`,
          [JSON.stringify({ ...payload, photoClientFileIds: swap(ids) }), new Date().toISOString(), ownerUserId, currentContourId, reference.clientOperationId]
        );
        if (rewrite.changes !== 1) throw new Error(attachmentQueuedMessage);
      }

      const result = await tx.getFirstAsync<{ photoClientFileIdsJson: string | null }>(
        `SELECT photo_client_file_ids_json AS photoClientFileIdsJson FROM point_results
          WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND point_id = ? LIMIT 1`,
        [ownerUserId, currentContourId, assignmentId, pointId]
      );
      if (result) {
        const ids = parseStringArray(result.photoClientFileIdsJson);
        const nextIds = replacement && !ids.includes(clientFileId) ? [...ids, replacement.clientFileId] : swap(ids);
        await tx.runAsync(
          `UPDATE point_results SET photo_client_file_ids_json = ?
            WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ? AND point_id = ?`,
          [JSON.stringify(nextIds), ownerUserId, currentContourId, assignmentId, pointId]
        );
      }
      if (replacement) {
        await insertLocalFileInTransaction(tx, { ...replacement, ownerUserId, contourId: currentContourId, assignmentId, pointId, status: "queued" });
      }
      await tx.runAsync(
        "DELETE FROM files WHERE owner_user_id = ? AND contour_id = ? AND client_file_id = ?",
        [ownerUserId, currentContourId, clientFileId]
      );
      const sharedPath = await tx.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM files WHERE local_path = ?",
        [file.localPath]
      );
      outcome.removedLocalPath = file.localPath && Number(sharedPath?.count ?? 0) === 0 ? file.localPath : null;
      outcome.mediaKind = file.mediaKind;
      await assertDataOwnerContext(scope);
    })
  );

  void logMobileAction({
    eventType: replacement ? "patrol.attachment.replaced" : "patrol.attachment.deleted",
    entityType: "patrolPoint",
    entityId: pointId,
    message: replacement ? "Вложение метки заменено до отправки." : "Вложение удалено из метки до отправки.",
    payload: { assignmentId, clientFileId, replacementClientFileId: replacement?.clientFileId ?? null }
  }).catch(() => undefined);
  return outcome;
}

export async function reopenInvalidCompletionReportLocally(assignmentId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  let reopened = false;

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const assignment = await tx.getFirstAsync<{ requestId: string; status: string }>(
        `SELECT request_id AS requestId, status
           FROM patrol_assignments
          WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?
          LIMIT 1`,
        [ownerUserId, currentContourId, assignmentId]
      );
      if (!assignment) {
        throw new Error("Назначение не найдено на телефоне.");
      }

      const invalidCompletion = await tx.getFirstAsync<{ clientOperationId: string }>(
        `SELECT client_operation_id AS clientOperationId
           FROM outbox_commands
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND command_type = 'completePatrolAssignment'
            AND entity_local_id = ?
            AND status IN ('invalidPayload', 'rejected')
          ORDER BY created_at_local DESC
          LIMIT 1`,
        [ownerUserId, currentContourId, assignmentId]
      );
      if (!invalidCompletion) {
        return;
      }

      const updatedAtLocal = new Date().toISOString();
      await tx.runAsync(
        `UPDATE outbox_commands
            SET status = 'superseded',
                last_error = NULL,
                next_attempt_at = NULL,
                retry_reason = NULL,
                updated_at_local = ?
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND command_type = 'completePatrolAssignment'
            AND entity_local_id = ?
            AND status IN ('invalidPayload', 'rejected')`,
        [updatedAtLocal, ownerUserId, currentContourId, assignmentId]
      );
      const assignmentUpdate = await tx.runAsync(
        `UPDATE patrol_assignments
            SET status = 'inProgress',
                completed_at_local = NULL,
                local_report_present = 0,
                local_report_needs_review = 0
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND assignment_id = ?
            AND status IN ('completedLocal', 'syncError', 'inProgress')`,
        [ownerUserId, currentContourId, assignmentId]
      );
      if (assignmentUpdate.changes === 1) {
        await tx.runAsync(
          `UPDATE patrol_request_board
              SET status = 'inProgress'
            WHERE owner_user_id = ? AND request_id = ?`,
          [ownerUserId, assignment.requestId]
        );
        reopened = true;
      }
    })
  );

  return { reopened };
}
export async function completeAssignmentLocally(assignmentId: string) {
  const context = await captureDataOwnerContext();
  const db = await getDatabase();
  const ownerUserId = context.ownerUserId;
  const queued = await getQueuedCompleteAssignmentCommand(db, ownerUserId, assignmentId);
  if (queued) {
    const assignment = await getAssignmentById(assignmentId);
    await assertDataOwnerContext(context);
    if (assignment && ["completedLocal", "syncing", "syncError", "authRequired"].includes(assignment.status)) {
      return {
        completedAtLocal: assignment.completedAtLocal ?? queued.createdAtLocal,
        clientOperationId: queued.clientOperationId,
        alreadyQueued: true as const
      };
    }
  }
  await assertPointActionAllowed(assignmentId, "completeAssignment");
  const readiness = await getReportReadiness(assignmentId);
  if (!readiness.assignment) {
    throw new Error("Отчет еще не готов к отправке.");
  }
  if (!canCreateCompletionCommand(true, readiness.ready)) {
    throw new Error("Отчет еще не готов к отправке.");
  }
  const expectedAssignmentRevision = readiness.assignment.revision;

  const completedAtLocal = new Date().toISOString();
  const pointResults = await buildCompletedPointResults(db, assignmentId, ownerUserId, completedAtLocal);
  if (readiness.progress.total <= 0 || pointResults.length !== readiness.progress.total) {
    throw new Error("Отчёт не содержит результаты всех точек маршрута.");
  }
  await assertCompletionAttachmentsAvailable(db, ownerUserId, assignmentId, pointResults);
  await assertDataOwnerContext(context);
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
    withOwnerExclusiveTransactionAsync(db, context, async (tx) => {
      // The duplicate check must be inside the same exclusive transaction as
      // the insert. This protects double taps and concurrent lifecycle callbacks
      // from creating two completion commands for one assignment.
      const queuedCompleteCommand = await getQueuedCompleteAssignmentCommand(tx, ownerUserId, assignmentId);
      if (!queuedCompleteCommand) {
        const currentAssignment = await tx.getFirstAsync<{ status: string; revision: number }>(
          "SELECT status, revision FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ? AND contour_id = ?",
          [ownerUserId, assignmentId, currentContourId]
        );
        if (!currentAssignment || !canPatrolAction("completeAssignment", currentAssignment.status)) {
          throw new Error(patrolActionError("completeAssignment", currentAssignment?.status ?? "missing") ?? "Отчет больше нельзя завершить.");
        }
        if (currentAssignment.revision !== expectedAssignmentRevision) {
          throw new Error("Состояние назначения изменилось. Обновите данные и повторите завершение отчета.");
        }
        const currentPointResults = await buildCompletedPointResults(tx, assignmentId, ownerUserId, completedAtLocal);
        await assertCompletionAttachmentsAvailable(tx, ownerUserId, assignmentId, currentPointResults);
        if (JSON.stringify(currentPointResults) !== JSON.stringify(pointResults)) {
          throw new Error("Состав точек изменился во время завершения. Проверьте отчет и повторите действие.");
        }
      }

      if (queuedCompleteCommand) {
        const existingCompletedAt = readiness.assignment?.completedAtLocal ?? queuedCompleteCommand.createdAtLocal;
        await tx.runAsync(
          `
            UPDATE patrol_assignments
            SET status = 'completedLocal',
                completed_at_local = COALESCE(completed_at_local, ?),
                local_report_present = 1
            WHERE owner_user_id = ?
              AND contour_id = ?
              AND assignment_id = ?
          `,
          [existingCompletedAt, ownerUserId, currentContourId, assignmentId]
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
          UPDATE outbox_commands
          SET status = 'superseded',
              last_error = NULL,
              next_attempt_at = NULL,
              updated_at_local = ?
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND command_type = 'completePatrolAssignment'
            AND entity_local_id = ?
            AND status IN ('rejected', 'invalidPayload')
        `,
        [completedAtLocal, ownerUserId, currentContourId, assignmentId]
      );

      await tx.runAsync(
      `
        UPDATE patrol_assignments
        SET status = 'completedLocal',
            completed_at_local = ?,
            local_report_present = 1
        WHERE owner_user_id = ?
          AND contour_id = ?
          AND assignment_id = ?
      `,
      [completedAtLocal, ownerUserId, currentContourId, assignmentId]
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
    throw new Error("Не удалось сохранить отчет в очередь отправки.");
  }

  if (completionResult.alreadyQueued) {
    return { ...completionResult, alreadyQueued: true as const };
  }

  void logMobileAction({
    eventType: "patrol.report.completedLocal",
    entityType: "patrolAssignment",
    entityId: assignmentId,
    message: "Отчет завершен локально и ожидает отправки.",
    payload: { photoCount, pointCount: readiness.progress.total }
  }).catch(() => undefined);

  return { ...completionResult, alreadyQueued: false as const };
}



async function assertPointOrderAllowed(
  db: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  pointId: string,
  orderIndex: number,
  allowFreeOrder: boolean
) {
  if (allowFreeOrder) {
    return;
  }

  const unfinished = await db.getFirstAsync<{ pointId: string; name: string }>(
    `
      SELECT
        point.point_id AS pointId,
        point.name
      FROM assignment_route_points point
      LEFT JOIN point_results result
        ON result.owner_user_id = ?
       AND result.assignment_id = point.assignment_id
       AND result.point_id = point.point_id
      WHERE point.assignment_id = ?
        AND point.order_index < ?
        AND point.required = 1
        AND COALESCE(result.status, 'pending') NOT IN ('ok', 'issue', 'skipped')
      ORDER BY point.order_index ASC
      LIMIT 1
    `,
    [ownerUserId, assignmentId, orderIndex]
  );

  if (unfinished && unfinished.pointId !== pointId) {
    throw new Error(`\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u0443\u044e \u0442\u043e\u0447\u043a\u0443 \u00ab${unfinished.name}\u00bb.`);
  }
}

async function assertScanMethodAllowed(assignmentId: string, method: "nfc" | "qr") {
  await assertPointActionAllowed(assignmentId, "scanAssignment");
  const policy = await getAssignmentScanPolicy(assignmentId);

  if (method === "nfc" && !policy.nfcEnabled) {
    throw new Error(nfcDisabledMessage);
  }
  if (method === "qr" && !policy.qrFallbackEnabled) {
    throw new Error(qrDisabledMessage);
  }

  return policy;
}

async function updateAssignmentLifecycleLocally(
  assignmentId: string,
  commandType: "startPatrolAssignment" | "pausePatrolAssignment" | "resumePatrolAssignment" | "handoffPatrolAssignment",
  nextStatus: "inProgress" | "paused" | "needsDispatcherDecision",
  timestampMode?: "startedAtLocal"
) {
  let lifecycleChanged = false;
  const action = commandType === "startPatrolAssignment"
    ? "startAssignment"
    : commandType === "pausePatrolAssignment"
      ? "pauseAssignment"
      : commandType === "resumePatrolAssignment"
        ? "resumeAssignment"
        : null;
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("Назначение не найдено на телефоне.");
  }

  if (action) {
    assertPatrolAction(action, assignment.status);
  }

  if (commandType === "startPatrolAssignment" && !["accepted", "inProgress"].includes(assignment.status)) {
    throw new Error("Начать можно только принятую заявку.");
  }

  if (commandType === "startPatrolAssignment" || commandType === "resumePatrolAssignment") {
    const competing = await db.getFirstAsync<{ assignmentId: string }>(
      `
        SELECT assignment_id AS assignmentId
        FROM patrol_assignments
        WHERE owner_user_id = ?
          AND assignment_id <> ?
          AND contour_id = ?
          AND status = 'inProgress'
          AND (employee_id IS NULL OR employee_id = COALESCE((SELECT employee_id FROM patrol_assignments WHERE assignment_id = ?), employee_id))
        LIMIT 1
      `,
      [ownerUserId, assignment.assignmentId, currentContourId, assignment.assignmentId]
    );
    if (competing) {
      throw new Error("У сотрудника уже есть выполняемый обход. Используйте смену маршрута.");
    }
  }

  if (commandType === "pausePatrolAssignment" && assignment.status !== "inProgress") {
    throw new Error("Приостановить можно только начатый обход.");
  }

  if (commandType === "resumePatrolAssignment" && assignment.status !== "paused") {
    throw new Error("Продолжить можно только приостановленный обход.");
  }

  if (commandType === "handoffPatrolAssignment" && assignment.status !== "inProgress") {
    throw new Error("Передать можно только начатый обход.");
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
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const current = await tx.getFirstAsync<{ status: string }>(
        `
          SELECT status
          FROM patrol_assignments
          WHERE owner_user_id = ?
            AND assignment_id = ?
            AND contour_id = ?
          LIMIT 1
        `,
        [ownerUserId, assignment.assignmentId, currentContourId]
      );
      if (!current) {
        throw new Error("Назначение больше недоступно на этом телефоне.");
      }
      if (commandType === "startPatrolAssignment" && current.status === "inProgress") {
        return;
      }

      if (action) {
        assertPatrolAction(action, current.status);
      }

      const releasePending = await tx.getFirstAsync<{ clientOperationId: string }>(
        `
          SELECT client_operation_id AS clientOperationId
          FROM outbox_commands
          WHERE owner_user_id = ?
            AND command_type = 'releasePatrolRequest'
            AND entity_local_id = ?
            AND contour_id = ?
            AND status IN ('pending', 'sending', 'retryLater')
          LIMIT 1
        `,
        [ownerUserId, assignment.assignmentId, currentContourId]
      );
      if (releasePending) {
        throw new Error("Заявка ожидает подтверждения возврата и пока недоступна для запуска.");
      }

      if (commandType === "startPatrolAssignment"
        && !["accepted", "inProgress"].includes(current.status)) {
        throw new Error("Начать можно только принятую заявку.");
      }

      if (commandType === "pausePatrolAssignment" && current.status !== "inProgress") {
        throw new Error("Приостановить можно только начатый обход.");
      }

      if (commandType === "resumePatrolAssignment" && current.status !== "paused") {
        throw new Error("Продолжить можно только приостановленный обход.");
      }

      if (commandType === "handoffPatrolAssignment" && current.status !== "inProgress") {
        throw new Error("Передать можно только начатый обход.");
      }
      if (commandType === "startPatrolAssignment" || commandType === "resumePatrolAssignment") {
        const competing = await tx.getFirstAsync<{ assignmentId: string }>(
          `
            SELECT assignment_id AS assignmentId
            FROM patrol_assignments
            WHERE owner_user_id = ?
              AND assignment_id <> ?
              AND contour_id = ?
              AND status = 'inProgress'
          AND (employee_id IS NULL OR employee_id = COALESCE((SELECT employee_id FROM patrol_assignments WHERE assignment_id = ?), employee_id))
            LIMIT 1
          `,
          [ownerUserId, assignment.assignmentId, currentContourId, assignment.assignmentId]
        );
        if (competing) {
          throw new Error("У сотрудника уже есть выполняемый обход. Используйте смену маршрута.");
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
            AND contour_id = ?
        `,
        [nextStatus, timestampMode ?? "", now, ownerUserId, assignment.assignmentId, currentContourId]
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
      lifecycleChanged = true;
    })
  );

  if (lifecycleChanged) {
    requestSyncAfterMutation();
  }

  return getAssignmentById(assignment.assignmentId);
}

async function snapshotRoutePointsInTransaction(executor: SqlExecutor, assignmentId: string, routeId: string) {
  await executor.runAsync("DELETE FROM assignment_route_points WHERE assignment_id = ?", [assignmentId]);
  await executor.runAsync(
    `
      INSERT INTO assignment_route_points (
        assignment_id,
        point_id,
        route_id,
        name,
        description,
        instruction,
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
        description,
        instruction,
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
    throw new Error("Маршрут не загружен на телефон.");
  }
}

async function buildCompletedPointResults(
  executor: SqlExecutor,
  assignmentId: string,
  ownerUserId: string,
  fallbackCompletedAtLocal: string
) {
  const rows = await executor.getAllAsync<{
    pointId: string;
    status: string | null;
    comment: string | null;
  manualReason?: string | null;
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
        result.manual_reason AS manualReason,
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
        AND assignment.owner_user_id = ?
        AND assignment.contour_id = ?
      ORDER BY point.order_index ASC
    `,
    [assignmentId, ownerUserId, currentContourId]
  );

  return rows.filter((row): row is typeof row & { status: "ok" | "issue" | "skipped" } => isTerminalPointStatus(row.status)).map((row) => ({
    pointId: row.pointId,
    status: row.status,
    comment: row.comment?.trim() ? row.comment : row.manualReason ?? "",
    manualReason: row.manualReason ?? null,
    issueTypeId: row.issueTypeId,
    photoClientFileIds: parseStringArray(row.photoClientFileIdsJson),
    confirmationType: row.confirmationType ?? "manual",
    nfcUidHash: row.nfcUidHash,
    completedAtLocal: row.completedAtLocal ?? fallbackCompletedAtLocal
  }));
}

async function findCompletionAttachmentFailures(
  executor: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  pointResults: { pointId: string; photoClientFileIds: string[] }[]
) {
  const references = pointResults.flatMap((result) => result.photoClientFileIds.map((clientFileId) => ({
    pointId: result.pointId,
    clientFileId
  })));
  if (references.length === 0) {
    return [];
  }

  const clientFileIds = Array.from(new Set(references.map((reference) => reference.clientFileId)));
  const placeholders = clientFileIds.map(() => "?").join(", ");
  const files = await executor.getAllAsync<LocalMobileFile>(
    `
      SELECT
        client_file_id AS clientFileId,
        owner_user_id AS ownerUserId,
        contour_id AS contourId,
        local_path AS localPath,
        preview_path AS previewPath,
        server_file_id AS serverFileId,
        status,
        sha256,
        size_bytes AS sizeBytes,
        content_type AS contentType,
        media_kind AS mediaKind,
        assignment_id AS assignmentId,
        point_id AS pointId,
        remark_id AS remarkId,
        work_task_id AS workTaskId,
        created_at_local AS createdAtLocal
      FROM files
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND client_file_id IN (${placeholders})
    `,
    [ownerUserId, currentContourId, ...clientFileIds]
  );
  const filesById = new Map(files.map((file) => [file.clientFileId, file]));
  const points = await executor.getAllAsync<Pick<PointListItem, "pointId" | "requiresPhoto" | "status">>(
    listAssignmentPointsOwnedSql,
    [assignmentId, ownerUserId, currentContourId]
  );
  const pointsById = new Map(points.map((point) => [point.pointId, point]));

  const failures = await Promise.all(references.map(async (reference) => {
    const point = pointsById.get(reference.pointId);
    if (!point) {
      return `${reference.clientFileId}: point record is missing`;
    }

    const file = filesById.get(reference.clientFileId);
    const physicalFile = file ? await getLocalFileInfo(file.localPath).catch(() => null) : null;
    const reason = getCompletionAttachmentFailure(file, physicalFile, {
      ownerUserId,
      contourId: currentContourId,
      assignmentId,
      pointId: reference.pointId,
      requiredPhoto: isPhotoEvidenceRequired(point.requiresPhoto, point.status)
    });
    return reason ? `${reference.clientFileId}: ${reason}` : null;
  }));

  return failures.filter((failure): failure is string => failure !== null);
}

async function assertCompletionAttachmentsAvailable(
  executor: SqlExecutor,
  ownerUserId: string,
  assignmentId: string,
  pointResults: { pointId: string; photoClientFileIds: string[] }[]
) {
  const failures = await findCompletionAttachmentFailures(executor, ownerUserId, assignmentId, pointResults);
  if (failures.length > 0) {
    throw new Error(`Отчёт нельзя отправить: ${failures[0]}. Замените вложение и повторите проверку`);
  }
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
        AND status IN ('pending', 'retryLater', 'waiting_network', 'waiting_auth', 'rejected')
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
  const presentFiles = await db.getAllAsync<{ clientFileId: string; localPath: string | null; status: string; sizeBytes: number | null }>(
    `
      SELECT client_file_id AS clientFileId, local_path AS localPath, status, size_bytes AS sizeBytes
      FROM files
      WHERE owner_user_id = ?
        AND contour_id = ?
        AND client_file_id IN (${placeholders})
    `,
    [ownerUserId, currentContourId, ...clientFileIds]
  );
  const presentFilesById = new Map(presentFiles.map((file) => [file.clientFileId, file]));
  const missingIds: string[] = [];
  for (const clientFileId of clientFileIds) {
    const file = presentFilesById.get(clientFileId);
    const physicalFile = file?.localPath ? await getLocalFileInfo(file.localPath).catch(() => null) : null;
    if (!file || file.status === "failed" || !file.localPath || !physicalFile || !physicalFile.exists || physicalFile.size <= 0 || file.sizeBytes === 0) {
      missingIds.push(clientFileId);
    }
  }
  return missingIds;
}

export async function restoreMissingPointAttachment(
  assignmentId: string,
  pointId: string,
  missingClientFileId: string,
  file: LocalMobileFile,
  context?: DataOwnerContext
) {
  const scope = context ?? await captureDataOwnerContext();
  await assertDataOwnerContext(scope);
  const ownerUserId = scope.ownerUserId;
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
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await assertDataOwnerContext(scope);
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
            AND status IN ('pending', 'retryLater', 'waiting_network', 'waiting_auth', 'rejected')
          ORDER BY created_at_local DESC
          LIMIT 1
        `,
        [ownerUserId, currentContourId, assignmentId]
      );

      if (!command) {
        throw new Error("Не найдена ожидающая отправки команда завершения отчёта.");
      }

      const currentAssignment = await tx.getFirstAsync<{ status: string }>(
        `
          SELECT status
          FROM patrol_assignments
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND assignment_id = ?
          LIMIT 1
        `,
        [ownerUserId, currentContourId, assignmentId]
      );
      if (!currentAssignment || currentAssignment.status !== "completedLocal") {
        throw new Error("Восстановление отменено: отчёт уже не находится в состоянии completedLocal.");
      }
      const existingMissingFile = await tx.getFirstAsync<{ clientFileId: string; localPath: string | null; status: string; sizeBytes: number | null }>(
        `
          SELECT client_file_id AS clientFileId, local_path AS localPath, status, size_bytes AS sizeBytes
          FROM files
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND client_file_id = ?
          LIMIT 1
        `,
        [ownerUserId, currentContourId, missingClientFileId]
      );
      const existingPhysicalFile = existingMissingFile?.localPath
        ? await getLocalFileInfo(existingMissingFile.localPath).catch(() => null)
        : null;
      if (
        existingMissingFile &&
        existingMissingFile.status !== "failed" &&
        existingMissingFile.sizeBytes !== 0 &&
        existingPhysicalFile?.exists &&
        existingPhysicalFile.size > 0
      ) {
        throw new Error("Исходное вложение доступно на телефоне; повторное восстановление не требуется.");
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

      const pointRow = await tx.getFirstAsync<{ photoClientFileIdsJson: string | null; status: PhotoEvidenceStatus }>(
        `
          SELECT photo_client_file_ids_json AS photoClientFileIdsJson, status
          FROM point_results
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND assignment_id = ?
            AND point_id = ?
          LIMIT 1
        `,
        [ownerUserId, currentContourId, assignmentId, pointId]
      );
      if (!pointRow) {
        throw new Error("Результат точки не найден на телефоне.");
      }
      const persistedIds = parseStringArray(pointRow.photoClientFileIdsJson ?? null);
      if (persistedIds.length > 0 && !persistedIds.includes(missingClientFileId)) {
        throw new Error("Локальный результат точки не содержит указанное отсутствующее вложение.");
      }
      const updatedPersistedIds = Array.from(new Set(
        (persistedIds.length > 0 ? persistedIds : [missingClientFileId])
          .map((id) => (id === missingClientFileId ? file.clientFileId : id))
      ));

      // The point status lives in point_results; the route snapshot only says whether a photo is required.
      const pointMetadata = await tx.getFirstAsync<{ requiresPhoto: number }>(
        `
          SELECT requires_photo AS requiresPhoto
          FROM assignment_route_points
          WHERE assignment_id = ?
            AND point_id = ?
          LIMIT 1
        `,
        [assignmentId, pointId]
      );
      if (!pointMetadata) {
        throw new Error("Снимок точки не найден на телефоне.");
      }
      const replacementPhysicalFile = await getLocalFileInfo(file.localPath).catch(() => null);
      const replacementFailure = getCompletionAttachmentFailure(
        {
          ...file,
          ownerUserId,
          contourId: currentContourId,
          assignmentId,
          pointId,
          status: "queued"
        },
        replacementPhysicalFile,
        {
          ownerUserId,
          contourId: currentContourId,
          assignmentId,
          pointId,
          requiredPhoto: isPhotoEvidenceRequired(pointMetadata.requiresPhoto === 1, pointRow.status)
        }
      );
      if (replacementFailure) {
        throw new Error(`Новое вложение не прошло проверку: ${replacementFailure}`);
      }
      await insertLocalFileInTransaction(tx, {
        ...file,
        ownerUserId,
        contourId: currentContourId,
        assignmentId,
        pointId,
        status: "queued"
      });
      const pointUpdate = await tx.runAsync(
        `
          UPDATE point_results
          SET photo_client_file_ids_json = ?,
              sync_status = 'pending'
          WHERE owner_user_id = ?
            AND contour_id = ?
            AND assignment_id = ?
            AND point_id = ?
        `,
        [JSON.stringify(updatedPersistedIds), ownerUserId, currentContourId, assignmentId, pointId]
      );
      if (pointUpdate.changes !== 1) {
        throw new Error("Не удалось обновить локальный результат точки при восстановлении вложения.");
      }
      const commandUpdate = await tx.runAsync(
        `
          UPDATE outbox_commands
          SET payload_json = ?,
              status = 'pending',
              last_error = NULL,
              next_attempt_at = NULL,
              updated_at_local = ?
          WHERE client_operation_id = ?
            AND owner_user_id = ?
            AND contour_id = ?
            AND status IN ('pending', 'retryLater', 'waiting_network', 'waiting_auth', 'rejected')
        `,
        [JSON.stringify({ ...payload, pointResults }), new Date().toISOString(), command.clientOperationId, ownerUserId, currentContourId]
      );
      if (commandUpdate.changes !== 1) {
        throw new Error("Не удалось вернуть команду отчёта в очередь после восстановления вложения.");
      }

      await assertDataOwnerContext(scope);
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
        AND contour_id = ?
        AND status IN (
          'pending', 'sending', 'retryLater', 'waiting_network', 'waiting_auth',
          'wrong_contour', 'blocked', 'accepted', 'duplicate', 'conflict'
        )
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [ownerUserId, assignmentId, currentContourId]
  );
}

async function requireOwnerUserId() {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Выполните вход в мобильный аккаунт.");
  }

  return ownerUserId;
}

async function assertPointActionAllowed(
  assignmentId: string,
  action: "scanAssignment" | "editPoint" | "attachMedia" | "completeAssignment"
) {
  const assignment = await getAssignmentById(assignmentId);
  if (!assignment) {
    throw new Error("Назначение не найдено на телефоне.");
  }

  assertPatrolAction(action, assignment.status);
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
  await assertPointActionAllowed(assignmentId, "editPoint");
  const point = await assertPointCanBeOpened(assignmentId, pointId);
  if (!point) {
    throw new Error("Метка не загружена на телефон.");
  }

  const completedAtLocal = new Date().toISOString();
  if (point.confirmationType !== "nfc" && point.confirmationType !== "qr" && !point.manualReason?.trim() && !comment.trim()) {
    throw new Error("Для ручного подтверждения укажите причину, почему метку не удалось отсканировать.");
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
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      const currentAssignment = await tx.getFirstAsync<{ status: string }>(
        "SELECT status FROM patrol_assignments WHERE owner_user_id = ? AND assignment_id = ? AND contour_id = ?",
        [ownerUserId, assignmentId, currentContourId]
      );
      const actionError = patrolActionError("editPoint", currentAssignment?.status ?? "missing");
      if (actionError) {
        throw new Error(actionError);
      }

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
        scannedAtLocal: point.scannedAtLocal,
        photoClientFileIds: point.photoClientFileIds,
        requireInProgress: true
      });

      await insertOutboxCommandInTransaction(tx, command);
    })
  );

  requestSyncAfterMutation();
  void logMobileAction({
    eventType: "patrol.point.saved",
    entityType: "patrolPoint",
    entityId: pointId,
    message: status === "issue" ? "Метка сохранена как неисправная." : "Метка сохранена как исправная.",
    payload: { assignmentId, status, photoCount: point.photoClientFileIds.length }
  }).catch(() => undefined);
}
