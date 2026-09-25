import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  owner: 'account-a',
  storage: new Map<string, string>(),
  contexts: new Map<string, { employeeId: string | null; assignmentId: string | null }>()
}));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => state.storage.get(key),
  setItemAsync: async (key: string, value: string) => { state.storage.set(key, value); },
  deleteItemAsync: async (key: string) => { state.storage.delete(key); }
}));
vi.mock('@/db/database', () => {
  const db = {
    getFirstAsync: async (_sql: string, args: unknown[]) => {
      const key = `${String(args[0])}:${String(args[1])}`;
      return state.contexts.get(key) ?? null;
    },
    runAsync: async (_sql: string, args: unknown[]) => {
      const key = `${String(args[0])}:${String(args[1])}`;
      state.contexts.set(key, {
        employeeId: (args[2] as string | null) ?? null,
        assignmentId: (args[3] as string | null) ?? null
      });
    }
  };
  return {
    getDatabase: async () => db,
    withProtectedExclusiveTransactionAsync: async (_db: unknown, callback: (tx: typeof db) => Promise<unknown>) => callback(db)
  };
});
vi.mock('@/db/sqliteBusyRetry', () => ({ withSqliteBusyRetry: async <T>(operation: () => Promise<T>) => operation() }));
import { getPatrolDeviceContext, selectCurrentPatrol, selectPatrolEmployee } from '@/db/repositories/patrolContextRepository';
beforeEach(() => { state.owner = 'account-a'; state.storage.clear(); state.contexts.clear(); });
it('serializes concurrent selection updates without losing the performer', async () => {
  await Promise.all([selectPatrolEmployee('alice'), selectCurrentPatrol('route-a')]);
  expect(await getPatrolDeviceContext()).toEqual({ employeeId: 'alice', assignmentId: 'route-a' });
});
it('keeps selections isolated during an account change', async () => {
  const first = selectCurrentPatrol('route-a', 'alice');
  state.owner = 'account-b';
  const second = selectCurrentPatrol('route-b', 'bob');
  await Promise.all([first, second]);
  expect(await getPatrolDeviceContext()).toEqual({ employeeId: 'bob', assignmentId: 'route-b' });
  state.owner = 'account-a';
  expect(await getPatrolDeviceContext()).toEqual({ employeeId: 'alice', assignmentId: 'route-a' });
});
