import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: DatabaseSync;
let directory: string;
let databaseFile: string;
let afterWrite: ((sql: string) => void) | null = null;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  directory = mkdtempSync(join(tmpdir(), 'patrol-mobile-db-test-'));
  databaseFile = join(directory, 'test.sqlite');
  raw = new DatabaseSync(databaseFile);
  afterWrite = null;
  const adapter = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    getAllAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).all(...args),
    getFirstAsync: async (sql: string, args: never[] = []) => raw.prepare(sql).get(...args) ?? null,
    runAsync: async (sql: string, args: never[] = []) => { const result = raw.prepare(sql).run(...args); afterWrite?.(sql); return result; },
    closeAsync: async () => {}
  };
  const storage = await import('@/db/encryptedDatabase');
  vi.mocked(storage.openProtectedDatabase).mockResolvedValue(adapter as never);
  vi.mocked(storage.openProtectedDatabaseConnection).mockResolvedValue(adapter as never);
  await (await import('@/db/database')).initializeDatabase();
});
afterEach(() => { raw.close(); unlinkSync(databaseFile); rmdirSync(directory); });

function seed(id: string, status: string, dependencies: string[] = [], owner = 'alice') {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type,
    entity_type, payload_json, created_at_local, status, aggregate_key, sequence_no, next_attempt_at)
    VALUES (?, ?, 'test', 'savePatrolPointResult', 'patrolPoint', ?, '2026-01-01', ?, ?, 1, '2026-01-02')`)
    .run(id, owner, JSON.stringify({ dependencies }), status, id);
}

it('does not schedule retries for a command blocked by an explicit dependency', async () => {
  seed('parent', 'waiting_auth'); seed('child', 'retryLater', ['parent']);
  const queue = await import('@/db/repositories/outboxRepository');
  expect(await queue.listPendingOutboxCommands('alice')).toEqual([]);
  expect(await queue.getNextOutboxRetryAt('alice')).toBeNull();
  raw.exec("UPDATE outbox_commands SET status='accepted' WHERE client_operation_id='parent'");
  expect(await queue.getNextOutboxRetryAt('alice')).toBe('2026-01-02');
  expect((await queue.listPendingOutboxCommands('alice')).map(c => c.clientOperationId)).toEqual(['child']);
});

it('a missing or other-owner dependency cannot enable a retry timer', async () => {
  seed('parent', 'accepted', [], 'bob'); seed('child', 'retryLater', ['parent']);
  const queue = await import('@/db/repositories/outboxRepository');
  expect(await queue.getNextOutboxRetryAt('alice')).toBeNull();
});

it('only claims an operation once and does not claim cancelled work', async () => {
  seed('queued', 'pending'); seed('cancelled', 'cancelledLocal');
  const queue = await import('@/db/repositories/outboxRepository');
  expect(await queue.markOutboxCommandsSending('alice', ['queued'])).toBe(1);
  expect(await queue.markOutboxCommandsSending('alice', ['queued'])).toBe(0);
  expect(await queue.markOutboxCommandsSending('alice', ['cancelled'])).toBe(0);
  expect(raw.prepare("SELECT attempt_count FROM outbox_commands WHERE client_operation_id='queued'").get()).toMatchObject({ attempt_count: 1 });
});

it('does not claim a stale payload or a newly blocked dependency', async () => {
  seed('edited', 'pending'); seed('parent', 'waiting_auth'); seed('blocked', 'pending', ['parent']);
  const queue = await import('@/db/repositories/outboxRepository');
  raw.exec(`UPDATE outbox_commands SET payload_json='{"dependencies":[],"comment":"new"}' WHERE client_operation_id='edited'`);
  expect(await queue.markOutboxCommandsSending('alice', ['edited'], { dependencies: [] })).toBe(0);
  expect(await queue.markOutboxCommandsSending('alice', ['blocked'])).toBe(0);
  expect(await queue.markOutboxCommandsSending('alice', ['edited'], { dependencies: [], comment: 'new' })).toBe(1);
});

it('claims a legacy formatted JSON payload without allowing a changed payload', async () => {
  seed('formatted', 'pending');
  raw.prepare('UPDATE outbox_commands SET payload_json = ? WHERE client_operation_id = ?')
    .run('{\n  "dependencies": [],\n  "value": 1.0\n}', 'formatted');
  const queue = await import('@/db/repositories/outboxRepository');
  const [command] = await queue.listPendingOutboxCommands('alice');
  expect(await queue.markOutboxCommandsSending('alice', ['formatted'], command.payload)).toBe(1);
});

it('keeps both simultaneous remark attachments in SQLite and its create payload', async () => {
  // The test adapter shares one SQLite connection; serialize transactions as native write locks do.
  const db = await import('@/db/database');
  const original = db.withProtectedExclusiveTransactionAsync;
  let tail = Promise.resolve();
  vi.spyOn(db, 'withProtectedExclusiveTransactionAsync').mockImplementation((database, task) => {
    const result = tail.then(() => original(database, task));
    tail = result.then(() => undefined, () => undefined);
    return result;
  });
  const remarks = await import('@/db/repositories/shiftRemarkRepository');
  const id = await remarks.createShiftRemarkLocally({ comment: 'test', sectionId: 'section', sectionName: 'Section', employeeId: 'employee', employeeName: 'Employee' });
  const file = (clientFileId: string) => ({ clientFileId, ownerUserId: 'alice', localPath: `${clientFileId}.jpg`, status: 'localOnly' as const, remarkId: id, createdAtLocal: '2026-09-30' });
  await Promise.all([remarks.attachMediaToShiftRemark(id, file('first')), remarks.attachMediaToShiftRemark(id, file('second'))]);
  const remark = raw.prepare('SELECT media_client_file_ids_json AS ids FROM shift_remarks WHERE remark_id=?').get(id) as { ids: string };
  expect(JSON.parse(remark.ids)).toEqual(['first', 'second']);
  const create = raw.prepare("SELECT payload_json AS payload FROM outbox_commands WHERE command_type='createShiftRemark'").get() as { payload: string };
  expect(JSON.parse(create.payload).mediaClientFileIds).toEqual(['first', 'second']);
  expect(raw.prepare('SELECT * FROM files').all()).toHaveLength(2);
});

it('rejects an attachment from another owner before creating any file or command', async () => {
  const remarks = await import('@/db/repositories/shiftRemarkRepository');
  await expect(remarks.attachMediaToShiftRemark('remark', { clientFileId: 'foreign', ownerUserId: 'bob', localPath: 'foreign.jpg', status: 'localOnly', createdAtLocal: '2026-09-30' })).rejects.toThrow('другому аккаунту');
  expect(raw.prepare('SELECT * FROM files').all()).toEqual([]);
  expect(raw.prepare('SELECT * FROM outbox_commands').all()).toEqual([]);
});

it('refuses to save a bootstrap belonging to another owner or a previous session', async () => {
  const { saveBootstrap } = await import('@/db/repositories/bootstrapRepository');
  const context = { ownerUserId: 'alice', contourId: 'test', generation: 0 };
  await expect(saveBootstrap({ user: { serverUserId: 'bob' } } as never, { context })).rejects.toThrow('другому мобильному аккаунту');
  session.generation++;
  await expect(saveBootstrap({ user: { serverUserId: 'alice' } } as never, { context })).rejects.toThrow('Устаревший');
  expect(raw.prepare('SELECT * FROM users').all()).toEqual([]);
});

it('rolls back a server acknowledgement if the session changes during its SQLite transaction', async () => {
  seed('receipt', 'pending');
  afterWrite = sql => { if (sql.includes('UPDATE outbox_commands')) session.generation++; };
  const queue = await import('@/db/repositories/outboxRepository');
  const { StaleDataOwnerContextError } = await import('@/auth/dataOwnerContext');
  await expect(queue.applyOutboxResponses('alice', [{ clientOperationId: 'receipt', status: 'accepted', serverEntityId: null, serverRevision: null }] as never,
    { ownerUserId: 'alice', contourId: 'test', generation: 0 })).rejects.toBeInstanceOf(StaleDataOwnerContextError);
  expect(raw.prepare("SELECT status FROM outbox_commands WHERE client_operation_id='receipt'").get()).toMatchObject({ status: 'pending' });
});

it('rolls back a work mutation and its command if the owner session changes before commit', async () => {
  const tasks = await import('@/db/repositories/workTaskRepository');
  afterWrite = sql => { if (sql.includes('INSERT INTO outbox_commands')) session.generation++; };
  await expect(tasks.createWorkTaskLocally({ taskDescription: 'offline task', sectionId: 's', sectionName: 'S', employeeId: 'e', employeeName: 'E' })).rejects.toThrow('Устаревший');
  expect(raw.prepare('SELECT * FROM work_tasks').all()).toEqual([]);
  expect(raw.prepare('SELECT * FROM outbox_commands').all()).toEqual([]);
});

it.each([false, true])('completion and its outbox command commit together; changed session=%s', async changed => {
  raw.exec(`
    INSERT INTO routes(route_id, name, version) VALUES ('route', 'Route', 1);
    INSERT INTO patrol_request_board(request_id, owner_user_id, route_id, route_name, planned_start_at, status, revision)
      VALUES ('request', 'alice', 'route', 'Route', '2026-09-30', 'inProgress', 1);
    INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision, route_version_no, snapshot_version)
      VALUES ('assignment', 'alice', 'test', 'request', 'route', 'inProgress', 1, 1, 1);
    INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index)
      VALUES ('assignment', 'point', 'route', 'Point', 1);
    INSERT INTO point_results(local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, sync_status, confirmation_type, completed_at_local)
      VALUES ('result', 'alice', 'test', 'assignment', 'point', 'ok', 'pending', 'nfc', '2026-09-30T00:00:00Z');
  `);
  const patrol = await import('@/db/repositories/patrolRepository');
  if (changed) {
    afterWrite = sql => { if (sql.includes('INSERT INTO outbox_commands')) session.generation++; };
    await expect(patrol.completeAssignmentLocally('assignment')).rejects.toThrow('Устаревший');
    expect(raw.prepare("SELECT status FROM patrol_assignments WHERE assignment_id='assignment'").get()).toMatchObject({ status: 'inProgress' });
    expect(raw.prepare('SELECT * FROM outbox_commands').all()).toHaveLength(0);
  } else {
    const first = await patrol.completeAssignmentLocally('assignment');
    const again = await patrol.completeAssignmentLocally('assignment');
    expect(again).toMatchObject({ clientOperationId: first.clientOperationId, alreadyQueued: true });
    expect(raw.prepare('SELECT * FROM outbox_commands').all()).toHaveLength(1);
    expect(raw.prepare("SELECT status FROM patrol_assignments WHERE assignment_id='assignment'").get()).toMatchObject({ status: 'completedLocal' });
  }
});

it('retains local data, media references and its delivery queue after reopening the database', async () => {
  const remarks = await import('@/db/repositories/shiftRemarkRepository');
  const id = await remarks.createShiftRemarkLocally({ comment: 'offline', sectionId: 's', sectionName: 'S', employeeId: 'e', employeeName: 'E' });
  await remarks.attachMediaToShiftRemark(id, { clientFileId: 'photo', ownerUserId: 'alice', remarkId: id, localPath: 'saved.jpg', status: 'localOnly', createdAtLocal: '2026-09-30' });
  const before = raw.prepare('SELECT * FROM outbox_commands ORDER BY sequence_no').all();
  raw.close(); raw = new DatabaseSync(databaseFile);
  // Re-run the real schema/migration entrypoint just as a fresh process does.
  vi.resetModules();
  await (await import('@/db/database')).initializeDatabase();
  expect(raw.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
  expect(raw.prepare('SELECT * FROM outbox_commands ORDER BY sequence_no').all()).toEqual(before);
  expect(raw.prepare('SELECT comment, media_client_file_ids_json AS ids FROM shift_remarks WHERE remark_id=?').get(id)).toMatchObject({ comment: 'offline', ids: '["photo"]' });
  expect(raw.prepare('SELECT local_path, status FROM files').get()).toMatchObject({ local_path: 'saved.jpg', status: 'queued' });
});

it('rolls back local data and its outbox command together on an interrupted write', async () => {
  const db = await import('@/db/database');
  await expect(db.withProtectedExclusiveTransactionAsync(await db.getDatabase(), async tx => {
    await tx.runAsync("INSERT INTO point_results(local_result_id,owner_user_id,assignment_id,point_id,status,sync_status) VALUES ('result','alice','assignment','point','ok','pending')");
    seed('interrupted', 'pending');
    throw new Error('simulated write failure');
  })).rejects.toThrow('simulated write failure');
  expect(raw.prepare('SELECT * FROM point_results').all()).toEqual([]);
  expect(raw.prepare('SELECT * FROM outbox_commands').all()).toEqual([]);
});
