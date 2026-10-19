import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'operation-id' }));
vi.mock('expo-sqlite', () => ({}));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'owner' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/db/repositories/filesRepository', () => ({}));
vi.mock('@/db/repositories/outboxSql', () => ({ insertOutboxCommandInTransaction: async (tx: any, command: any) => tx.runAsync('INSERT INTO commands(payload) VALUES (?)', [JSON.stringify(command)]) }));
vi.mock('@/db/database', () => ({
  getDatabase: async () => s.db,
  withProtectedExclusiveTransactionAsync: async (_db: unknown, action: (tx: any) => Promise<unknown>) => {
    s.db.exec('BEGIN');
    try {
      const result = await action({
        runAsync: async (sql: string, args: any[]) => s.db.prepare(sql).run(...args),
        getFirstAsync: async (sql: string, args: any[]) => s.db.prepare(sql).get(...args)
      });
      s.db.exec('COMMIT'); return result;
    } catch (e) { s.db.exec('ROLLBACK'); throw e; }
  }
}));
import { joinWorkTaskLocally, replaceWorkTaskParticipantLocally } from '@/db/repositories/workTaskRepository';
beforeEach(() => {
  s.db = new DatabaseSync(':memory:');
  s.db.exec(`CREATE TABLE work_tasks(task_id TEXT, owner_user_id TEXT, status TEXT, revision INTEGER, sync_status TEXT);
    INSERT INTO work_tasks VALUES('work','owner','accepted',2,'synced');
    CREATE TABLE commands(payload TEXT);
    CREATE TABLE work_form_drafts(owner_user_id TEXT, contour_id TEXT, employee_id TEXT, form_kind TEXT, entity_id TEXT);`);
});
afterEach(() => s.db.close());
it.each(['workJoin','workReplace'] as const)('commits %s and its draft deletion atomically; rolls back on failure', async kind => {
  s.db.prepare('INSERT INTO work_form_drafts VALUES (?,?,?,?,?)').run('owner','test','independent',kind,'work');
  s.db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON work_form_drafts BEGIN SELECT RAISE(ABORT,'draft deletion failed'); END;");
  const item = { itemId: 'work', workSessionId: 'work', status: 'accepted' } as any;
  const employee = { employeeId: 'bob', fullName: 'Bob' } as any;
  const draft = { key: 'independent', kind, entityId: 'work' };
  const submit = () => kind === 'workJoin' ? joinWorkTaskLocally(item,employee,'reason',draft) : replaceWorkTaskParticipantLocally(item,'alice',employee,'reason',draft);
  await expect(submit()).rejects.toThrow('draft deletion failed');
  expect(s.db.prepare('SELECT * FROM commands').all()).toHaveLength(0);
  expect(s.db.prepare('SELECT * FROM work_form_drafts').all()).toHaveLength(1);
  expect(s.db.prepare('SELECT sync_status FROM work_tasks').get()!.sync_status).toBe('synced');
  s.db.exec('DROP TRIGGER fail_delete'); await submit();
  expect(s.db.prepare('SELECT * FROM commands').all()).toHaveLength(1);
  expect(s.db.prepare('SELECT * FROM work_form_drafts').all()).toHaveLength(0);
});
