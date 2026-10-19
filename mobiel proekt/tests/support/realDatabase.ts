import { DatabaseSync } from 'node:sqlite';

// Runs the app's real schema and migrations on node:sqlite. The calling test file must
// mock '@/db/encryptedDatabase' with vi.fn() openers, as outboxDatabaseReliability does.
export type QueryHook = (sql: string, args: unknown[]) => void;

type MockedOpener = { mockResolvedValue(value: unknown): void };

// Passing an existing database re-runs startup on it (after vi.resetModules), as on the next app launch.
export async function openRealDatabase(existing?: DatabaseSync) {
  const raw = existing ?? new DatabaseSync(':memory:');
  const hooks: { afterRead: QueryHook | null; afterWrite: QueryHook | null; beforeWrite: QueryHook | null } = { afterRead: null, afterWrite: null, beforeWrite: null };
  const adapter = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    getAllAsync: async (sql: string, args: never[] = []) => {
      const result = raw.prepare(sql).all(...args);
      hooks.afterRead?.(sql, args);
      return result;
    },
    getFirstAsync: async (sql: string, args: never[] = []) => {
      const result = raw.prepare(sql).get(...args) ?? null;
      hooks.afterRead?.(sql, args);
      return result;
    },
    runAsync: async (sql: string, args: never[] = []) => {
      hooks.beforeWrite?.(sql, args);
      const result = raw.prepare(sql).run(...args);
      hooks.afterWrite?.(sql, args);
      return result;
    },
    closeAsync: async () => {}
  };
  const storage = await import('@/db/encryptedDatabase');
  (storage.openProtectedDatabase as unknown as MockedOpener).mockResolvedValue(adapter);
  (storage.openProtectedDatabaseConnection as unknown as MockedOpener).mockResolvedValue(adapter);
  await (await import('@/db/database')).initializeDatabase();
  return { raw, hooks };
}

export function selectAll<T = Record<string, unknown>>(raw: DatabaseSync, sql: string, ...args: (string | number | null)[]) {
  return raw.prepare(sql).all(...args) as T[];
}
