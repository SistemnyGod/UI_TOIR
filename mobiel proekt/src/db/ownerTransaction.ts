import type { SQLiteDatabase } from 'expo-sqlite';
import { assertDataOwnerContext, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { withProtectedExclusiveTransactionAsync } from '@/db/database';

export function withOwnerExclusiveTransactionAsync<T>(
  db: SQLiteDatabase,
  context: DataOwnerContext,
  task: (tx: SQLiteDatabase) => Promise<T>
) {
  return withProtectedExclusiveTransactionAsync(db, async tx => {
    await assertDataOwnerContext(context);
    const result = await task(tx);
    await assertDataOwnerContext(context);
    return result;
  });
}
