import { captureDataOwnerContext, assertDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { getDatabase } from '@/db/database';
import { acceptRequestLocally, getAssignmentByRequestId, getRequestBoardItem, getAssignmentScanPolicy, startAssignmentLocally, resumeAssignmentLocally } from '@/db/repositories/patrolRepository';
import { getPatrolDeviceContext, selectPatrolForContext } from '@/db/repositories/patrolContextRepository';
import { switchPatrolLocally } from '@/db/repositories/patrolSwitchRepository';

const pending = new Map<string, Promise<string>>();
export async function enterPatrolRequest(requestId: string, employeeId?: string, isCurrent: () => boolean = () => true) {
  const scope = await captureDataOwnerContext();
  const key = `${scope.ownerUserId}:${scope.contourId}:${scope.generation}:${requestId}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const operation = enter(scope, requestId, employeeId, isCurrent);
  pending.set(key, operation);
  try { return await operation; }
  finally { if (pending.get(key) === operation) pending.delete(key); }
}

async function enter(scope: DataOwnerContext, requestId: string, employeeId: string | undefined, isCurrent: () => boolean) {
  let assignment = await getAssignmentByRequestId(requestId);
  await assertDataOwnerContext(scope);
  if (!assignment || assignment.status === 'assigned') {
    const request = await getRequestBoardItem(requestId);
    await assertDataOwnerContext(scope);
    const performer = request?.assignedEmployeeId && !request.performerSelectionAvailable ? undefined : employeeId;
    assignment = (await acceptRequestLocally(requestId, performer)).assignment;
  }
  await assertDataOwnerContext(scope);
  if (!['accepted', 'paused', 'inProgress'].includes(assignment.status)) {
    throw new Error('Этот обход недоступен для запуска. Откройте сохранённые результаты.');
  }
  if (assignment.status !== 'inProgress') {
    const context = await getPatrolDeviceContext();
    const db = await getDatabase();
    const competing = await db.getFirstAsync<{ assignmentId: string }>(
      `SELECT assignment_id AS assignmentId FROM patrol_assignments
       WHERE owner_user_id = ? AND contour_id = ? AND employee_id = ?
         AND assignment_id <> ? AND status = 'inProgress' LIMIT 1`,
      [scope.ownerUserId, scope.contourId, assignment.employeeId ?? null, assignment.assignmentId]);
    await assertDataOwnerContext(scope);
    if (competing && context.employeeId === assignment.employeeId) await switchPatrolLocally(competing.assignmentId, assignment.assignmentId, async () => {
      await assertDataOwnerContext(scope);
      if (!isCurrent()) throw new Error('Выбор заявки закрыт. Переключение не выполнено.');
    });
    else if (assignment.status === 'paused') await resumeAssignmentLocally(assignment.assignmentId);
    else await startAssignmentLocally(assignment.assignmentId);
  }
  await assertDataOwnerContext(scope);
  if (!isCurrent()) throw new Error('Выбор заявки закрыт. Результат операции сохранён.');
  await selectPatrolForContext(scope, assignment.assignmentId, assignment.employeeId ?? null, isCurrent);
  const policy = await getAssignmentScanPolicy(assignment.assignmentId);
  await assertDataOwnerContext(scope);
  return patrolScanPath(assignment.assignmentId, policy);
}

export function patrolScanPath(id: string, policy: { nfcEnabled: boolean; qrFallbackEnabled: boolean }) {
  return `/patrol/assignment/${id}/${policy.nfcEnabled ? 'scan-nfc' : policy.qrFallbackEnabled ? 'scan-qr' : 'all-points'}`;
}
