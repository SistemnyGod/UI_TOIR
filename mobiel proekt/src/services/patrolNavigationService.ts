import { assertDataOwnerContext, captureDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { getPatrolDeviceContext, clearCurrentPatrolIfMatches } from '@/db/repositories/patrolContextRepository';
import { getAssignmentById, getAssignmentScanPolicy } from '@/db/repositories/patrolRepository';
import { getReportDeliveryState } from '@/db/repositories/outboxRepository';
import { getDatabase } from '@/db/database';
import { patrolScanPath } from './patrolEntryService';

export const requestBoardPath = '/patrol/request-board';
export const deliveredBoardPath = `${requestBoardPath}?notice=${encodeURIComponent('Отчёт доставлен')}`;

export type PatrolReportState = {
  completedLocally: boolean;
  completionOperationId: string | null;
  completionStatus: string | null;
  completionError: string | null;
};

/** Reads completion separately from point-level outbox activity. */
export async function getPatrolReportState(scope: DataOwnerContext, assignmentId: string): Promise<PatrolReportState> {
  const db = await getDatabase();
  const assignment = await db.getFirstAsync<{ status: string; localReportPresent: number | null; localReportNeedsReview: number | null }>(
    `SELECT status, local_report_present AS localReportPresent, local_report_needs_review AS localReportNeedsReview
       FROM patrol_assignments
      WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`,
    [scope.ownerUserId, scope.contourId, assignmentId]
  );
  const completion = await db.getFirstAsync<{ id: string; status: string; lastError: string | null }>(
    `SELECT client_operation_id AS id, status, last_error AS lastError
       FROM outbox_commands
      WHERE owner_user_id = ? AND contour_id = ?
        AND command_type = 'completePatrolAssignment' AND entity_local_id = ?
        AND status NOT IN ('superseded', 'cancelled', 'cancelledLocal')
      ORDER BY sequence_no DESC, created_at_local DESC
      LIMIT 1`,
    [scope.ownerUserId, scope.contourId, assignmentId]
  );
  // Point-level delivery failures are not a report.  A report exists only
  // when the completion command/flag is present, or the server has explicitly
  // marked the assignment completed.
  const completedStatus = new Set(['completedServer']);
  return {
    // An older ambiguous row stays visible in history, but must not route the
    // employee to an already completed report until they explicitly finish it.
    completedLocally: Boolean(completion || (assignment?.localReportPresent === 1 && assignment.localReportNeedsReview !== 1) || (assignment && completedStatus.has(assignment.status))),
    completionOperationId: completion?.id ?? null,
    completionStatus: completion?.status ?? null,
    completionError: completion?.lastError ?? null
  };
}

export async function isReportFullyDelivered(scope: DataOwnerContext, assignmentId: string) {
  const delivery = await getReportDeliveryState(scope.ownerUserId, assignmentId);
  if (delivery.status !== 'delivered') return false;
  const db = await getDatabase();
  const command = await db.getFirstAsync<{ payload: string }>(
    `SELECT payload_json AS payload FROM outbox_commands WHERE owner_user_id = ? AND contour_id = ? AND client_operation_id = ?`,
    [scope.ownerUserId, scope.contourId, delivery.clientOperationId]);
  if (!command) return false;
  let payload: { assignmentId?: unknown; pointResults?: unknown };
  try {
    payload = JSON.parse(command.payload) as { pointResults?: unknown };
  } catch {
    // A damaged completion command must be repaired by the employee; it is
    // never evidence that the report and its files reached the server.
    return false;
  }
  const schemaRows = typeof db.getAllAsync === 'function'
    ? await db.getAllAsync<{ name: string }>("PRAGMA table_info(files)")
    : [];
  const hasScopedFileColumns = schemaRows.length > 0
    && schemaRows.some((row) => row.name === 'assignment_id')
    && schemaRows.some((row) => row.name === 'point_id');
  const legacyPayload = !hasScopedFileColumns;
  if ((payload.assignmentId !== assignmentId && !(legacyPayload && payload.assignmentId === undefined))
      || !Array.isArray(payload.pointResults) || payload.pointResults.length === 0) return false;
  const pointIds = new Set<string>();
  const references: { pointId: string | null; clientFileId: string }[] = [];
  for (const value of payload.pointResults) {
    if (!value || typeof value !== 'object') return false;
    const point = value as { pointId?: unknown; status?: unknown; photoClientFileIds?: unknown };
    if (!legacyPayload && (typeof point.pointId !== 'string' || point.pointId.length === 0 || pointIds.has(point.pointId))) return false;
    if (!legacyPayload && point.status !== 'ok' && point.status !== 'issue' && point.status !== 'skipped') return false;
    if (!Array.isArray(point.photoClientFileIds) || point.photoClientFileIds.some((id) => typeof id !== 'string' || id.length === 0)) return false;
    if (typeof point.pointId === 'string') pointIds.add(point.pointId);
    for (const id of point.photoClientFileIds as string[]) references.push({ pointId: typeof point.pointId === 'string' ? point.pointId : null, clientFileId: id });
  }
  const ids = [...new Set(references.map((reference) => reference.clientFileId))];
  if (ids.length) {
    const uploadedIds = new Set<string>();
    // SQLite has a bound-parameter limit on older Android builds. Chunking also
    // keeps a malformed large report from turning delivery verification into a
    // full-table scan.
    for (let offset = 0; offset < ids.length; offset += 250) {
      const batch = ids.slice(offset, offset + 250);
      const placeholders = batch.map(() => '?').join(',');
      const rows = typeof db.getAllAsync === 'function'
        ? await db.getAllAsync<{ id: string }>(
            `SELECT client_file_id AS id FROM files WHERE owner_user_id = ? AND contour_id = ?
               ${hasScopedFileColumns ? 'AND assignment_id = ?' : ''} AND client_file_id IN (${placeholders}) AND server_file_id IS NOT NULL
               AND status IN ('uploaded','linked','deletedAfterRetention')`,
            hasScopedFileColumns ? [scope.ownerUserId, scope.contourId, assignmentId, ...batch] : [scope.ownerUserId, scope.contourId, ...batch]
          )
        : (await Promise.all(batch.map((id) => db.getFirstAsync<{ id: string }>(
            `SELECT client_file_id AS id FROM files WHERE owner_user_id = ? AND contour_id = ?
             ${hasScopedFileColumns ? 'AND assignment_id = ?' : ''} AND client_file_id = ? AND server_file_id IS NOT NULL
             AND status IN ('uploaded','linked','deletedAfterRetention')`,
            hasScopedFileColumns ? [scope.ownerUserId, scope.contourId, assignmentId, id] : [scope.ownerUserId, scope.contourId, id]
          )))).filter((row): row is { id: string } => Boolean(row));
      rows.forEach((row) => uploadedIds.add(row.id));
    }
    if (uploadedIds.size !== ids.length) return false;
    // A file belonging to this assignment but a different point is not a
    // valid completion attachment. Check the exact point association too.
    for (const reference of references) {
      if (!hasScopedFileColumns || !reference.pointId) continue;
      const row = await db.getFirstAsync<{ id: string }>(
        `SELECT client_file_id AS id FROM files WHERE owner_user_id = ? AND contour_id = ?
         AND assignment_id = ? AND point_id = ? AND client_file_id = ?
         AND server_file_id IS NOT NULL AND status IN ('uploaded','linked','deletedAfterRetention')`,
        [scope.ownerUserId, scope.contourId, assignmentId, reference.pointId, reference.clientFileId]
      );
      if (!row) return false;
    }
  }
  await assertDataOwnerContext(scope);
  return true;
}

export async function finishDeliveredNavigation(scope: DataOwnerContext, assignmentId: string, isCurrent: () => boolean) {
  if (!isCurrent() || !await isReportFullyDelivered(scope, assignmentId)) return false;
  await assertDataOwnerContext(scope);
  if (!isCurrent()) return false;
  const cleared = await clearCurrentPatrolIfMatches(scope, assignmentId, isCurrent);
  await assertDataOwnerContext(scope);
  if (!cleared || !isCurrent()) return false;
  const context = await getPatrolDeviceContext();
  await assertDataOwnerContext(scope);
  return isCurrent() && context.assignmentId === null;
}

export async function resolvePatrolStartPath() {
  const scope = await captureDataOwnerContext();
  const context = await getPatrolDeviceContext();
  if (!context.assignmentId) return requestBoardPath;
  const id = context.assignmentId;
  const assignment = await getAssignmentById(id);
  await assertDataOwnerContext(scope);
  if (!assignment || ['cancelled', 'cancelledServer'].includes(assignment.status)) {
    const notice = 'Сохранённый обход отменён или недоступен';
    await clearCurrentPatrolIfMatches(scope, id);
    return `${requestBoardPath}?notice=${encodeURIComponent(notice)}`;
  }
  const reportState = await getPatrolReportState(scope, id);
  await assertDataOwnerContext(scope);
  if (await finishDeliveredNavigation(scope, id, () => true)) return deliveredBoardPath;
  if (reportState.completedLocally) return `/patrol/assignment/${id}/submit`;
  // Point-level outbox activity does not mean that a completion report exists.
  if (['completed', 'completedServer'].includes(assignment.status)) {
    await clearCurrentPatrolIfMatches(scope, id);
    return requestBoardPath;
  }
  if (assignment.status === 'inProgress') {
    const policy = await getAssignmentScanPolicy(id);
    await assertDataOwnerContext(scope);
    return patrolScanPath(id, policy);
  }
  return `/patrol/request/${assignment.requestId}`;
}
