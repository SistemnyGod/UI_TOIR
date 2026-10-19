import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkItemDto } from '@/domain/emu/emuTypes';
import { buildRepeatWorkPrefill, canRepeatWorkItem, repeatWorkDroppedNotice } from '@/domain/emu/repeatWorkPolicy';
import { openRealDatabase, selectAll } from './support/realDatabase';

// "Повторить работу" on the real schema: a past item of the same owner becomes an ordinary new
// create-work draft. Only description, section and one bound performer are copied; dates, photos,
// statuses, revisions and server ids are not. Saving it is the normal createWorkTask path with a
// new task id and a new clientOperationId.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
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

let raw: DatabaseSync;
beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  ({ raw } = await openRealDatabase());
  raw.exec(`INSERT INTO mobile_employees(employee_id, owner_user_id, full_name) VALUES ('emp-a', 'alice', 'Иванов И.'), ('emp-a2', 'alice', 'Петров П.'), ('emp-b', 'bob', 'Сидоров С.');
    INSERT INTO emu_sections(section_id, name, sort_order) VALUES ('sec-1', 'Участок 1', 1), ('sec-2', 'Участок 2', 2);`);
});
afterEach(() => raw.close());

const participant = (employeeId: string, current = false) =>
  JSON.stringify([{ employeeId, fullName: employeeId, status: 'finished', startedAt: '2026-10-01T08:00:00Z', finishedAt: '2026-10-01T12:00:00Z', isCurrentMobileEmployee: current }]);
function seedHistory(id: string, overrides: Partial<Record<'owner' | 'status' | 'section' | 'employee' | 'actual' | 'description', string | null>> = {}) {
  raw.prepare(`INSERT INTO work_tasks(task_id, owner_user_id, title, status, planned_at, revision, completed_at_local, section_id, section_name,
      employee_id, employee_name, created_at_local, sync_status, item_kind, work_session_id, plan_task_id, description, approval_status, source,
      assigned_employees_json, actual_participants_json, attachments_json, capabilities_json, updated_at_server)
    VALUES (?, ?, 'Замена фильтра', ?, '2026-10-01T08:00:00Z', 7, '2026-10-01T12:00:00Z', ?, 'Участок 1', ?, 'Иванов И.', '2026-10-01T07:59:00Z',
      'synced', 'workSession', 'server-session-1', 'plan-1', ?, 'approved', 'web', '[]', ?,
      '[{"fileId":"file-1","fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":10,"uploadedAt":"2026-10-01T12:00:00Z"}]', '{"canComplete":false}', '2026-10-01T12:05:00Z')`)
    .run(id, overrides.owner ?? 'alice', overrides.status ?? 'completedServer', overrides.section === undefined ? 'sec-1' : overrides.section,
      overrides.employee === undefined ? 'emp-a' : overrides.employee, overrides.description === undefined ? 'Заменить фильтр насоса Н-2' : overrides.description,
      overrides.actual ?? participant('emp-a', true));
  raw.prepare(`INSERT INTO files(client_file_id, owner_user_id, contour_id, work_task_id, local_path, server_file_id, status, content_type, size_bytes, media_kind, created_at_local)
    VALUES (?, ?, 'test', ?, 'file:///photo.jpg', 'file-1', 'uploaded', 'image/jpeg', 10, 'photo', '2026-10-01T12:00:00Z')`).run(`local-${id}`, overrides.owner ?? 'alice', id);
}
const drafts = () => selectAll<{ key: string; kind: string; entity: string; payload: string; owner: string; contour: string }>(raw,
  `SELECT employee_id AS key, form_kind AS kind, entity_id AS entity, payload_json AS payload, owner_user_id AS owner, contour_id AS contour FROM work_form_drafts`);
const context = () => ({ ownerUserId: session.owner, contourId: 'test', generation: session.generation });

it('copies description, section and the bound performer and nothing else', async () => {
  seedHistory('past');
  const repo = await import('@/db/repositories/workTaskRepository');

  const repeat = await repo.createRepeatWorkDraft(context(), 'past');

  expect(repeat.payload).toEqual({ employeeId: 'emp-a', sectionId: 'sec-1', text: 'Заменить фильтр насоса Н-2' });
  expect(repeat.dropped).toEqual([]);
  expect(drafts()).toEqual([{ key: repeat.draftKey, kind: 'task', entity: 'new', owner: 'alice', contour: 'test', payload: JSON.stringify(repeat.payload) }]);
  // No date, status, revision, photo, attachment or server identifier reaches the draft.
  const stored = drafts()[0].payload;
  for (const excluded of ['2026-10-01', 'completed', 'past', 'server-session-1', 'plan-1', 'file-1', 'photo', '"7"', 'approved', 'revision']) {
    expect(stored).not.toContain(excluded);
  }
});

it('the repeated draft is a new identity and saves through the normal createWorkTask outbox flow', async () => {
  seedHistory('past');
  raw.exec(`INSERT INTO work_form_drafts(owner_user_id, contour_id, employee_id, form_kind, entity_id, payload_json, updated_at)
    VALUES ('alice', 'test', 'form:existing', 'task', 'new', '{"text":"чужой черновик"}', '2026-10-02')`);
  const repo = await import('@/db/repositories/workTaskRepository');

  const first = await repo.createRepeatWorkDraft(context(), 'past');
  const second = await repo.createRepeatWorkDraft(context(), 'past');
  expect(first.draftKey).toMatch(/^form:/);
  expect(new Set([first.draftKey, second.draftKey, 'form:existing']).size).toBe(3);

  const taskId = await repo.createWorkTaskLocally({ employeeId: 'emp-a', employeeName: 'Иванов И.', sectionId: 'sec-1', sectionName: 'Участок 1',
    taskDescription: first.payload.text, draftKey: first.draftKey });

  expect(taskId).not.toBe('past');
  expect(selectAll(raw, `SELECT status, revision, completed_at_local AS completedAt, sync_status AS sync, work_session_id AS sessionId, plan_task_id AS planId
      FROM work_tasks WHERE task_id = ?`, taskId)).toEqual([{ status: 'inProgress', revision: 0, completedAt: null, sync: 'pending', sessionId: null, planId: null }]);
  expect(selectAll(raw, 'SELECT COUNT(*) AS count FROM files WHERE work_task_id = ?', taskId)).toEqual([{ count: 0 }]);
  const commands = selectAll<{ id: string; type: string; entity: string; payload: string }>(raw,
    "SELECT client_operation_id AS id, command_type AS type, entity_local_id AS entity, payload_json AS payload FROM outbox_commands WHERE status = 'pending'");
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ type: 'createWorkTask', entity: taskId });
  expect([first.draftKey, second.draftKey, taskId, 'past']).not.toContain(commands[0].id);
  expect(JSON.parse(commands[0].payload)).toMatchObject({ taskId, employeeId: 'emp-a', sectionId: 'sec-1', taskDescription: 'Заменить фильтр насоса Н-2' });
  expect(commands[0].payload).not.toContain('server-session-1');
  // Only the submitted repeat draft is consumed; the other drafts stay.
  expect(drafts().map(draft => draft.key).sort()).toEqual(['form:existing', second.draftKey].sort());
  // The past item itself is untouched.
  expect(selectAll(raw, "SELECT status, revision FROM work_tasks WHERE task_id = 'past'")).toEqual([{ status: 'completedServer', revision: 7 }]);
});

it('a performer or section this account may no longer use is not copied', async () => {
  seedHistory('foreign-performer', { employee: 'emp-b', actual: participant('emp-b'), section: 'sec-removed' });
  const repo = await import('@/db/repositories/workTaskRepository');

  const repeat = await repo.createRepeatWorkDraft(context(), 'foreign-performer');

  expect(repeat.payload).toEqual({ employeeId: '', sectionId: '', text: 'Заменить фильтр насоса Н-2' });
  expect(repeat.dropped).toEqual(['employee', 'section']);
  expect(repeatWorkDroppedNotice(repeat.dropped)).toBe('Недоступно для новой работы: исполнитель и участок. Выберите заново.');
});

it('another owner\'s work, active work and a stale session cannot be repeated', async () => {
  seedHistory('bobs', { owner: 'bob' });
  seedHistory('active', { status: 'inProgress' });
  seedHistory('mine');
  const repo = await import('@/db/repositories/workTaskRepository');

  await expect(repo.createRepeatWorkDraft(context(), 'bobs')).rejects.toThrow('Работа не найдена на телефоне.');
  await expect(repo.createRepeatWorkDraft(context(), 'active')).rejects.toThrow('Повторить можно только завершённую работу');
  const stale = context();
  session.generation = 1;
  await expect(repo.createRepeatWorkDraft(stale, 'mine')).rejects.toThrow();
  session.generation = 0; session.owner = 'bob';
  await expect(repo.createRepeatWorkDraft({ ...stale, generation: 0 }, 'mine')).rejects.toThrow();
  expect(drafts()).toEqual([]);
});

const item = (overrides: Partial<WorkItemDto> = {}) => ({
  status: 'completedServer', title: 'Название', description: 'Описание', sectionId: 'sec-1', employeeId: null,
  actualParticipants: [], assignedEmployees: [], ...overrides
}) as WorkItemDto;
const person = (employeeId: string, isCurrentMobileEmployee = false) => ({ employeeId, fullName: employeeId, status: '', startedAt: null, finishedAt: null, isCurrentMobileEmployee });

it('prefers the current performer, then other participants, then the single bound employee', () => {
  const sections = [{ sectionId: 'sec-1' }];
  expect(buildRepeatWorkPrefill(item({ actualParticipants: [person('x'), person('b', true)], assignedEmployees: [person('a')] }), [{ employeeId: 'a' }, { employeeId: 'b' }], sections).prefill.employeeId).toBe('b');
  expect(buildRepeatWorkPrefill(item({ actualParticipants: [person('x')], assignedEmployees: [person('a')] }), [{ employeeId: 'a' }, { employeeId: 'b' }], sections).prefill.employeeId).toBe('a');
  expect(buildRepeatWorkPrefill(item(), [{ employeeId: 'only' }], sections)).toEqual({ prefill: { employeeId: 'only', sectionId: 'sec-1', text: 'Описание' }, dropped: [] });
  expect(buildRepeatWorkPrefill(item({ description: '  ' }), [], sections).prefill.text).toBe('Название');
});

it('only finished work with a description offers a repeat', () => {
  expect(['completedLocal', 'completedServer', 'cancelled'].map(status => canRepeatWorkItem(item({ status } as Partial<WorkItemDto>)))).toEqual([true, true, true]);
  expect(['available', 'assigned', 'new', 'inProgress', 'paused', 'conflict'].some(status => canRepeatWorkItem(item({ status } as Partial<WorkItemDto>)))).toBe(false);
  expect(canRepeatWorkItem(item({ title: '', description: '' }))).toBe(false);
});
