import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as unknown as DatabaseSync, owner: 'owner', generation: 1, status: 'inProgress', delivery: 'notQueued', readBarrier: null as null | (() => Promise<void>) }));
function executor() { return {
  getFirstAsync: async (sql: string, args: any[] = []) => { await state.readBarrier?.(); return state.db.prepare(sql).get(...args) ?? null; },
  runAsync: async (sql: string, args: any[] = []) => state.db.prepare(sql).run(...args)
}; }
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => state.generation }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined }));
vi.mock('@/db/database', () => ({
  getDatabase: async () => executor(),
  withProtectedExclusiveTransactionAsync: async (_db: unknown, action: (tx: ReturnType<typeof executor>) => Promise<void>) => {
    state.db.exec('BEGIN');
    try { await action(executor()); state.db.exec('COMMIT'); } catch (error) { state.db.exec('ROLLBACK'); throw error; }
  }
}));
vi.mock('@/db/repositories/patrolRepository', () => ({
  getAssignmentById: async () => ({ assignmentId: 'B', requestId: 'request-B', status: state.status }),
  getAssignmentScanPolicy: async () => ({ nfcEnabled: true, qrFallbackEnabled: true })
}));
vi.mock('@/db/repositories/outboxRepository', () => ({ getReportDeliveryState: async () => ({ status: state.delivery, clientOperationId: 'complete-B' }) }));
vi.mock('@/services/patrolEntryService', () => ({ patrolScanPath: (id: string) => `/patrol/assignment/${id}/scan-nfc` }));
import { captureDataOwnerContext } from '@/auth/dataOwnerContext';
import { clearCurrentPatrolIfMatches, getPatrolDeviceContext, selectPatrolForContext } from '@/db/repositories/patrolContextRepository';
import { finishDeliveredNavigation, getPatrolReportState, isReportFullyDelivered, resolvePatrolStartPath, requestBoardPath } from '@/services/patrolNavigationService';

beforeEach(() => {
  state.db = new DatabaseSync(':memory:'); state.owner = 'owner'; state.generation = 1; state.delivery = 'notQueued'; state.status = 'inProgress'; state.readBarrier = null;
  state.db.exec(`CREATE TABLE patrol_device_context(owner_user_id TEXT, contour_id TEXT, employee_id TEXT, assignment_id TEXT, updated_at TEXT, PRIMARY KEY(owner_user_id,contour_id));
    CREATE TABLE outbox_commands(owner_user_id TEXT, contour_id TEXT, client_operation_id TEXT, payload_json TEXT, command_type TEXT, entity_local_id TEXT, status TEXT, last_error TEXT, sequence_no INTEGER, created_at_local TEXT);
    CREATE TABLE patrol_assignments(owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, status TEXT, local_report_present INTEGER, local_report_needs_review INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_user_id, contour_id, assignment_id));
    INSERT INTO patrol_assignments VALUES ('owner','test','B','inProgress',0,0);
    CREATE TABLE files(owner_user_id TEXT, contour_id TEXT, client_file_id TEXT, server_file_id TEXT, status TEXT);
    INSERT INTO patrol_device_context VALUES ('owner','test','employee-A','A','now');
    INSERT INTO outbox_commands VALUES ('owner','test','complete-B','{"pointResults":[{"photoClientFileIds":["photo"]}]}','completePatrolAssignment','B','pending',NULL,1,'now');
    INSERT INTO files VALUES ('owner','test','photo','server-photo','linked');`);
});
afterEach(() => state.db.close());

it('does not treat an ambiguous legacy report as a completed report', async () => {
  state.db.exec("DELETE FROM outbox_commands WHERE command_type='completePatrolAssignment'; UPDATE patrol_assignments SET local_report_present=1, local_report_needs_review=1, status='syncError';");
  expect((await getPatrolReportState(await captureDataOwnerContext(), 'B')).completedLocally).toBe(false);
});

it('A unfinished, B selected and delivered: clears B, keeps employee B and restores the board', async () => {
  const scope = await captureDataOwnerContext();
  await selectPatrolForContext(scope, 'B', 'employee-B');
  state.delivery = 'delivered';
  expect(await finishDeliveredNavigation(scope, 'B', () => true)).toBe(true);
  expect(await getPatrolDeviceContext()).toEqual({ employeeId: 'employee-B', assignmentId: null });
  expect(await resolvePatrolStartPath()).toBe(requestBoardPath);
});
it('a late receipt cannot clear another selected route', async () => {
  state.delivery = 'delivered';
  expect(await finishDeliveredNavigation(await captureDataOwnerContext(), 'B', () => true)).toBe(false);
  expect((await getPatrolDeviceContext()).assignmentId).toBe('A');
});
it('completion alone does not confirm outstanding attachments', async () => {
  state.delivery = 'delivered'; state.db.exec("UPDATE files SET status='queued',server_file_id=NULL");
  expect(await isReportFullyDelivered(await captureDataOwnerContext(), 'B')).toBe(false);
});
it('a corrupted completion payload never counts as delivered', async () => {
  state.delivery = 'delivered';
  state.db.exec("UPDATE outbox_commands SET payload_json = '{not-json' WHERE client_operation_id='complete-B'");
  expect(await isReportFullyDelivered(await captureDataOwnerContext(), 'B')).toBe(false);
});
it('pending point delivery does not open the report before local completion', async () => {
  state.db.exec("DELETE FROM outbox_commands WHERE command_type='completePatrolAssignment'; UPDATE outbox_commands SET command_type='savePatrolPoint', entity_local_id='B-point-1', status='pending';");
  state.delivery = 'queued'; state.status = 'inProgress';
  await selectPatrolForContext(await captureDataOwnerContext(), 'B', 'employee-B');
  expect(await resolvePatrolStartPath()).toBe('/patrol/assignment/B/scan-nfc');
});
it('point delivery error does not create a local report', async () => {
  state.db.exec("DELETE FROM outbox_commands WHERE command_type='completePatrolAssignment'; UPDATE patrol_assignments SET status='syncError';");
  const report = await getPatrolReportState(await captureDataOwnerContext(), 'B');
  expect(report.completedLocally).toBe(false);
  expect(await resolvePatrolStartPath()).toBe('/patrol/assignment/A/scan-nfc');
});
it('blur during an awaited receipt prevents both clearing and navigation', async () => {
  state.delivery = 'delivered'; let active = true;
  const scope = await captureDataOwnerContext(); await selectPatrolForContext(scope, 'B', 'employee-B');
  state.readBarrier = async () => { active = false; };
  expect(await finishDeliveredNavigation(scope, 'B', () => active)).toBe(false);
  state.readBarrier = null;
  expect((await getPatrolDeviceContext()).assignmentId).toBe('B');
});
it('a former account context cannot clear a matching ID in a new session', async () => {
  const scope = await captureDataOwnerContext(); state.generation++;
  await expect(clearCurrentPatrolIfMatches(scope, 'A')).rejects.toThrow('прежней сессии');
  expect((await getPatrolDeviceContext()).assignmentId).toBe('A');
});
it('offline submission restores its summary; paused selection requires explicit continuation', async () => {
  await selectPatrolForContext(await captureDataOwnerContext(), 'B', 'employee-B');
  state.delivery = 'queued';
  expect(await resolvePatrolStartPath()).toBe('/patrol/assignment/B/submit');
  state.db.exec("DELETE FROM outbox_commands WHERE client_operation_id='complete-B'");
  state.delivery = 'notQueued'; state.status = 'paused';
  expect(await resolvePatrolStartPath()).toBe('/patrol/request/request-B');
});
