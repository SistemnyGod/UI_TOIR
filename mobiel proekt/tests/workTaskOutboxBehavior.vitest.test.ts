import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkItemDto, WorkTaskDto } from '@/domain/emu/emuTypes';
import { openRealDatabase, selectAll, type QueryHook } from './support/realDatabase';

// Behavior of EMU work tasks on the real schema: refreshes (saveWorkTasks/saveWorkItems) never
// prune or overwrite rows with undelivered local changes, pause/resume/complete do not queue a
// second active command of the same type, mutations enqueue from the current SQLite row and roll
// back when it changes underneath, planned work start reuses its session and keeps the plan until
// the server accepts it, and V2 work items do not invent a completion time.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
const api = vi.hoisted(() => ({ mobileRequest: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('@/api/httpClient', () => ({ mobileRequest: api.mobileRequest }));

const activeStatuses = ['pending', 'sending', 'retryLater', 'waiting_auth', 'waiting_network', 'wrong_contour', 'blocked'];
const keptStatuses = [...activeStatuses, 'rejected', 'conflict', 'invalidPayload'];
const changedError = 'Работа изменилась до сохранения.';
let raw: DatabaseSync;
let hooks: { afterRead: QueryHook | null };

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  api.mobileRequest.mockReset();
  ({ raw, hooks } = await openRealDatabase());
});
afterEach(() => raw.close());

type Row = { status?: string; revision?: number; sync?: string; completedAt?: string | null; kind?: string; planTaskId?: string | null };
function seedTask(id: string, row: Row = {}) {
  raw.prepare(`INSERT INTO work_tasks(task_id, owner_user_id, title, status, revision, completed_at_local, section_id, section_name,
      created_at_local, sync_status, item_kind, plan_task_id, capabilities_json)
    VALUES (?, 'alice', 'Local title', ?, ?, ?, 'local-section', 'Local', '2026-10-01', ?, ?, ?, '{"local":true}')`)
    .run(id, row.status ?? 'inProgress', row.revision ?? 1, row.completedAt ?? null, row.sync ?? 'synced', row.kind ?? 'workSession', row.planTaskId ?? null);
}
function seedCommand(id: string, taskId: string, type: string, status: string, contour = 'test') {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, aggregate_key, sequence_no)
    VALUES (?, 'alice', ?, ?, 'workTask', ?, '{}', '2026-10-01', ?, ?, 1)`).run(id, contour, type, taskId, status, `workTask:${taskId}`);
}
const taskRow = (id: string) => raw.prepare(`SELECT title, status, revision, sync_status AS sync, completed_at_local AS completedAt,
    section_id AS sectionId, capabilities_json AS capabilities FROM work_tasks WHERE task_id = ?`).get(id) as Record<string, unknown> | undefined;
const commandsFor = (id: string) => selectAll<{ type: string; payload: string }>(raw,
  "SELECT command_type AS type, payload_json AS payload FROM outbox_commands WHERE entity_local_id = ? AND status = 'pending' AND contour_id = 'test' ORDER BY rowid", id);
const taskIds = () => selectAll<{ id: string }>(raw, 'SELECT task_id AS id FROM work_tasks ORDER BY task_id').map(row => row.id);
const dto = (taskId: string, status: string) => ({ taskId, status }) as WorkTaskDto;
const serverTask = (taskId: string, overrides: Partial<WorkTaskDto> = {}): WorkTaskDto => ({
  taskId, title: 'Server title', status: 'inProgress', plannedAt: null, revision: 2, completedAtLocal: null, sectionId: 'server-section',
  sectionName: 'Server', employeeId: null, employeeName: null, createdAtLocal: '2026-10-02', syncStatus: 'synced', ...overrides
});
const serverItem = (itemId: string, overrides: Partial<WorkItemDto> = {}) => ({
  taskId: itemId, itemId, kind: 'workSession', workSessionId: itemId, planTaskId: null, description: '', title: 'Server title',
  sectionId: 'server-section', sectionName: 'Server', plannedAt: '2026-10-05T08:00:00Z', status: 'inProgress', approvalStatus: 'approved',
  revision: 2, updatedAt: '2026-10-05T08:00:00Z', source: 'web', assignedEmployees: [], actualParticipants: [], attachments: [],
  capabilities: { canStart: false, canJoin: false, canReplace: false, canPause: true, canResume: false, canComplete: true },
  employeeId: null, employeeName: null, createdAtLocal: '2026-10-05', completedAtLocal: null, syncStatus: 'synced', ...overrides
}) as WorkItemDto;

type Transition = 'pauseWorkTask' | 'resumeWorkTask' | 'completeWorkTask';
const fromStatus: Record<Transition, string> = { pauseWorkTask: 'inProgress', resumeWorkTask: 'paused', completeWorkTask: 'inProgress' };
async function transition(type: Transition, task: WorkTaskDto) {
  const repo = await import('@/db/repositories/workTaskRepository');
  if (type === 'pauseWorkTask') return repo.pauseWorkTaskLocally(task, 'pause');
  if (type === 'resumeWorkTask') return repo.resumeWorkTaskLocally(task, 'resume');
  return repo.completeWorkTaskLocally(task, 'done');
}
const transitions = Object.keys(fromStatus) as Transition[];

it.each(transitions.flatMap(type => activeStatuses.map(status => [type, status])))(
  '%s is not queued twice while the same command is %s', async (type, status) => {
    seedTask('task', { status: fromStatus[type as Transition] });
    seedCommand('earlier', 'task', type, status);

    await transition(type as Transition, dto('task', fromStatus[type as Transition]));

    expect(selectAll(raw, 'SELECT client_operation_id FROM outbox_commands')).toEqual([{ client_operation_id: 'earlier' }]);
    expect(taskRow('task')).toMatchObject({ status: fromStatus[type as Transition], sync: 'synced' });
  });

it.each(transitions.flatMap(type => ['accepted', 'duplicate', 'rejected', 'conflict', 'invalidPayload'].map(status => [type, status])))(
  '%s is queued again after the earlier one settled as %s', async (type, status) => {
    seedTask('task', { status: fromStatus[type as Transition] });
    seedCommand('earlier', 'task', type, status);

    await transition(type as Transition, dto('task', fromStatus[type as Transition]));

    expect(commandsFor('task').map(command => command.type)).toEqual([type]);
    expect(taskRow('task')).toMatchObject({ sync: 'pending' });
  });

it('an active command of another type or contour does not block a transition', async () => {
  seedTask('task', { status: 'paused' });
  seedCommand('pause', 'task', 'pauseWorkTask', 'pending');
  seedCommand('foreign', 'task', 'completeWorkTask', 'pending', 'other');

  await transition('completeWorkTask', dto('task', 'paused'));

  expect(commandsFor('task').map(command => command.type)).toEqual(['pauseWorkTask', 'completeWorkTask']);
  expect(taskRow('task')).toMatchObject({ status: 'completedLocal', sync: 'pending' });
});

it('transitions enqueue the base revision of the current row, not of the stale task object', async () => {
  seedTask('task', { status: 'inProgress', revision: 7 });
  const repo = await import('@/db/repositories/workTaskRepository');

  await repo.pauseWorkTaskLocally({ ...dto('task', 'inProgress'), revision: 1 }, 'pause');
  await repo.updateWorkTaskLocally({ task: { ...dto('task', 'paused'), revision: 1 }, sectionId: 's2', sectionName: 'S2', taskDescription: 'Edited' });

  expect(commandsFor('task').map(command => [command.type, JSON.parse(command.payload).baseRevision]))
    .toEqual([['pauseWorkTask', 7], ['updateWorkTask', 7]]);
});

it.each(transitions)('%s rejects a stale task object whose row already reached a final status', async type => {
  seedTask('task', { status: 'completedServer', revision: 3 });

  await expect(transition(type, dto('task', fromStatus[type]))).rejects.toThrow();

  expect(commandsFor('task')).toEqual([]);
  expect(taskRow('task')).toMatchObject({ status: 'completedServer', sync: 'synced' });
});

const employee = { employeeId: 'bob', fullName: 'Bob', position: null, department: null };
const mutations: [string, string, (repo: typeof import('@/db/repositories/workTaskRepository')) => Promise<unknown>][] = [
  ['pause', 'inProgress', repo => repo.pauseWorkTaskLocally(dto('task', 'inProgress'), 'c')],
  ['resume', 'paused', repo => repo.resumeWorkTaskLocally(dto('task', 'paused'), 'c')],
  ['complete', 'inProgress', repo => repo.completeWorkTaskLocally(dto('task', 'inProgress'), 'c')],
  ['update', 'inProgress', repo => repo.updateWorkTaskLocally({ task: dto('task', 'inProgress'), sectionId: 's', sectionName: 'S', taskDescription: 'New' })],
  ['join', 'accepted', repo => repo.joinWorkTaskLocally({ itemId: 'task', workSessionId: 'task', status: 'accepted' } as WorkItemDto, employee, 'c')]
];
it.each(mutations)('%s rolls back without a command when the row disappears after it was read', async (_name, status, run) => {
  seedTask('task', { status });
  hooks.afterRead = sql => {
    if (sql.includes('SELECT task_id AS taskId, status, revision FROM work_tasks')) raw.exec("DELETE FROM work_tasks WHERE task_id = 'task'");
  };

  await expect(run(await import('@/db/repositories/workTaskRepository'))).rejects.toThrow(changedError);

  hooks.afterRead = null;
  expect(selectAll(raw, 'SELECT * FROM outbox_commands')).toEqual([]);
  expect(taskRow('task')).toMatchObject({ status, sync: 'synced', title: 'Local title' });
});

const plan = (status = 'accepted') => serverItem('plan-row', { kind: 'planTask', planTaskId: 'plan-1', workSessionId: null, status } as Partial<WorkItemDto>);
const plannedCommands = () => selectAll<{ id: string; entity: string; payload: string }>(raw,
  "SELECT client_operation_id AS id, entity_local_id AS entity, payload_json AS payload FROM outbox_commands WHERE command_type = 'startPlannedWork'");
const sessionsFor = (planTaskId: string) => selectAll<{ id: string; sync: string }>(raw,
  "SELECT task_id AS id, sync_status AS sync FROM work_tasks WHERE item_kind = 'workSession' AND plan_task_id = ?", planTaskId);

it('planned work start creates one session from the current plan row and reuses it on a repeated start', async () => {
  seedTask('plan-row', { kind: 'planTask', planTaskId: 'plan-1', status: 'accepted', revision: 4 });
  const repo = await import('@/db/repositories/workTaskRepository');

  const first = await repo.startPlannedWorkLocally({ ...plan(), revision: 1 }, employee);
  const second = await repo.startPlannedWorkLocally(plan(), employee);

  expect(second).toBe(first);
  expect(sessionsFor('plan-1')).toEqual([{ id: first, sync: 'pending' }]);
  expect(plannedCommands().map(command => [command.entity, JSON.parse(command.payload).baseRevision])).toEqual([[first, 4]]);
  expect(JSON.parse(taskRow('plan-row')!.capabilities as string)).toMatchObject({ canStart: false, canJoin: false });
});

it('planned work start returns a session that already exists for the plan instead of inserting one', async () => {
  seedTask('plan-row', { kind: 'planTask', planTaskId: 'plan-1', status: 'accepted' });
  seedTask('existing', { kind: 'workSession', planTaskId: 'plan-1' });
  const repo = await import('@/db/repositories/workTaskRepository');

  expect(await repo.startPlannedWorkLocally(plan(), employee)).toBe('existing');

  expect(sessionsFor('plan-1').map(row => row.id)).toEqual(['existing']);
  expect(plannedCommands()).toEqual([]);
  expect(taskIds()).toEqual(['existing', 'plan-row']);
});

it('planned work start re-checks the plan row and rolls back when it changes after the read', async () => {
  seedTask('plan-row', { kind: 'planTask', planTaskId: 'plan-1', status: 'completedServer' });
  const repo = await import('@/db/repositories/workTaskRepository');
  await expect(repo.startPlannedWorkLocally(plan('accepted'), employee)).rejects.toThrow();

  raw.exec("UPDATE work_tasks SET status = 'accepted' WHERE task_id = 'plan-row'");
  hooks.afterRead = sql => {
    if (sql.includes("item_kind = 'planTask'") && sql.includes('AS taskId, status, revision')) raw.exec("UPDATE work_tasks SET item_kind = 'workSession' WHERE task_id = 'plan-row'");
  };
  await expect(repo.startPlannedWorkLocally(plan(), employee)).rejects.toThrow('Работа изменилась до запуска.');

  hooks.afterRead = null;
  expect(plannedCommands()).toEqual([]);
  expect(sessionsFor('plan-1')).toEqual([]);
  expect(taskRow('plan-row')).toMatchObject({ capabilities: '{"local":true}' });
});

it('the plan row stays local until the server accepts the startPlannedWork command', async () => {
  seedTask('plan-row', { kind: 'planTask', planTaskId: 'plan-1', status: 'accepted' });
  seedTask('other-plan', { kind: 'planTask', planTaskId: 'plan-2', status: 'accepted' });
  const repo = await import('@/db/repositories/workTaskRepository');
  const { applyOutboxResponses } = await import('@/db/repositories/outboxResponseRepository');
  const sessionId = await repo.startPlannedWorkLocally(plan(), employee);
  const [{ id }] = plannedCommands();
  const response = (status: 'accepted' | 'retryLater') => ({ clientOperationId: id, status, serverEntityId: null, serverRevision: 3,
    message: '', conflictId: null, retryAfterSeconds: null });

  await applyOutboxResponses('alice', [response('retryLater')]);
  expect(taskIds()).toEqual(['other-plan', 'plan-row', sessionId].sort());

  await applyOutboxResponses('alice', [response('accepted')]);
  expect(taskIds()).toEqual(['other-plan', sessionId].sort());
  expect(sessionsFor('plan-1')).toEqual([{ id: sessionId, sync: 'synced' }]);
});

it.each([[[serverTask('kept')]], [[]]])('task refresh %# prunes only rows without an undelivered or unresolved command', async snapshot => {
  seedTask('kept');
  keptStatuses.forEach(status => { seedTask(`p-${status}`); seedCommand(`c-${status}`, `p-${status}`, 'updateWorkTask', status); });
  seedTask('gone-accepted'); seedCommand('c-accepted', 'gone-accepted', 'updateWorkTask', 'accepted');
  seedTask('gone-foreign-contour'); seedCommand('c-foreign', 'gone-foreign-contour', 'updateWorkTask', 'pending', 'other');
  seedTask('gone-plain');
  const { saveWorkTasks } = await import('@/db/repositories/workTaskRepository');

  await saveWorkTasks(snapshot);

  expect(taskIds()).toEqual([...(snapshot.length ? ['kept'] : []), ...keptStatuses.map(status => `p-${status}`)].sort());
});

it.each([
  ['an unsynced local row', { sync: 'conflict', revision: 1 }, 'conflict'],
  ['a newer local revision', { sync: 'synced', revision: 5 }, 'synced']
])('task refresh keeps local values over %s', async (_name, row, sync) => {
  seedTask('task', { ...row, status: 'completedLocal', completedAt: '2026-10-10T10:00:00Z' });
  const { saveWorkTasks } = await import('@/db/repositories/workTaskRepository');

  await saveWorkTasks([serverTask('task', { revision: 3, status: 'inProgress' })]);

  expect(taskRow('task')).toMatchObject({ status: 'completedLocal', sync, completedAt: '2026-10-10T10:00:00Z',
    title: 'Local title', sectionId: 'local-section', revision: Math.max(3, row.revision) });
});

it('task refresh applies a newer server revision to a synced row', async () => {
  seedTask('task', { status: 'inProgress', revision: 1 });
  const { saveWorkTasks } = await import('@/db/repositories/workTaskRepository');

  await saveWorkTasks([serverTask('task', { revision: 2, status: 'completedServer', completedAtLocal: '2026-10-11T00:00:00Z' })]);

  expect(taskRow('task')).toMatchObject({ status: 'completedServer', sync: 'synced', revision: 2, title: 'Server title', completedAt: '2026-10-11T00:00:00Z' });
});

it.each(activeStatuses)('task refresh keeps the outcome of a %s transition command visible', async status => {
  seedTask('paused', { status: 'inProgress' });
  seedCommand('pause', 'paused', 'pauseWorkTask', status);
  seedTask('done', { status: 'inProgress', completedAt: '2026-10-10T10:00:00Z' });
  seedCommand('complete', 'done', 'completeWorkTask', status);
  const { saveWorkTasks } = await import('@/db/repositories/workTaskRepository');

  await saveWorkTasks([serverTask('paused'), serverTask('done')]);

  expect(taskRow('paused')).toMatchObject({ status: 'paused', sync: 'pending' });
  expect(taskRow('done')).toMatchObject({ status: 'completedLocal', sync: 'pending', completedAt: '2026-10-10T10:00:00Z' });
});

it('task refresh applies server state once the transition command was accepted', async () => {
  seedTask('task', { status: 'inProgress' });
  seedCommand('pause', 'task', 'pauseWorkTask', 'accepted');
  const { saveWorkTasks } = await import('@/db/repositories/workTaskRepository');

  await saveWorkTasks([serverTask('task', { status: 'inProgress' })]);

  expect(taskRow('task')).toMatchObject({ status: 'inProgress', sync: 'synced', revision: 2 });
});

it('work item refresh with a partial snapshot updates listed rows and keeps the others', async () => {
  seedTask('listed');
  seedTask('absent');
  const { saveWorkItems } = await import('@/db/repositories/workTaskRepository');

  await saveWorkItems([serverItem('listed')]);

  expect(taskIds()).toEqual(['absent', 'listed']);
  expect(taskRow('listed')).toMatchObject({ title: 'Server title', revision: 2 });
  expect(taskRow('absent')).toMatchObject({ title: 'Local title', revision: 1 });
});

it('work item refresh keeps a pending local edit over a newer stale server snapshot', async () => {
  seedTask('task', { status: 'inProgress', revision: 1 });
  const repo = await import('@/db/repositories/workTaskRepository');
  await repo.updateWorkTaskLocally({ task: dto('task', 'inProgress'), sectionId: 'edited-section', sectionName: 'Edited', taskDescription: 'Edited title' });

  await repo.saveWorkItems([serverItem('task', { revision: 4, status: 'paused' })]);

  expect(taskRow('task')).toMatchObject({ title: 'Edited title', sectionId: 'edited-section', status: 'inProgress',
    capabilities: '{"local":true}', sync: 'pending', revision: 4 });
});

it('work item refresh ignores an older server revision of a synced row', async () => {
  seedTask('task', { status: 'paused', revision: 6 });
  const { saveWorkItems } = await import('@/db/repositories/workTaskRepository');

  await saveWorkItems([serverItem('task', { revision: 5 })]);

  expect(taskRow('task')).toMatchObject({ title: 'Local title', sectionId: 'local-section', status: 'paused', capabilities: '{"local":true}', revision: 6 });
});

it('V2 work items leave the completion time empty instead of copying the planned time', async () => {
  api.mobileRequest.mockResolvedValue([{ ...serverItem('done', { status: 'completedServer', plannedAt: '2026-10-05T08:00:00Z' }), completedAtLocal: undefined }]);
  const { getWorkItemsV2 } = await import('@/api/emuApi');

  const [item] = await getWorkItemsV2();

  expect(item).toMatchObject({ status: 'completedServer', plannedAt: '2026-10-05T08:00:00Z', completedAtLocal: null, createdAtLocal: '2026-10-05T08:00:00Z' });
});
