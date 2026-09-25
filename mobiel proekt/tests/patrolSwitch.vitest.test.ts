import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ write: vi.fn(), enqueue: vi.fn(), sync: vi.fn(), select: vi.fn(), first: vi.fn(), selectInTransaction: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'op' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'shared-account' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: state.sync }));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ selectCurrentPatrol: state.select, setPatrolDeviceContextInTransaction: state.selectInTransaction }));
vi.mock('@/db/repositories/outboxSql', () => ({ insertOutboxCommandInTransaction: state.enqueue }));
vi.mock('@/db/database', () => ({
  getDatabase: async () => ({}),
  withProtectedExclusiveTransactionAsync: async (_db: unknown, action: (tx: unknown) => Promise<void>) => action({
    getFirstAsync: state.first,
    getAllAsync: async (sql: string) => sql.includes('sequence_no') ? [] : [
      { id: 'a', requestId: 'ra', status: 'inProgress', revision: 1, employeeId: 'alice', enabled: 1 },
      { id: 'b', requestId: 'rb', status: 'accepted', revision: 1, employeeId: 'bob', enabled: 1 }
    ], runAsync: state.write
  })
}));
import { switchPatrolLocally } from '@/db/repositories/patrolSwitchRepository';
import { continuePatrolAfterSwitchConflict } from '@/db/repositories/patrolSwitchRepository';
it('does not bypass normal start validation for another employee', async () => {
  await expect(switchPatrolLocally('a', 'b')).rejects.toThrow('общем списке');
  expect(state.write).not.toHaveBeenCalled();
  expect(state.enqueue).not.toHaveBeenCalled();
});

it('continues the target with a separate command after a failed switch', async () => {
  state.first.mockReset()
    .mockResolvedValueOnce({ status: 'conflict', commandType: 'switchPatrolAssignment', payloadJson: JSON.stringify({ assignmentId: 'b', sourceAssignmentId: 'a', targetStatusBefore: 'accepted' }) })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ requestId: 'rb', status: 'syncError', employeeId: 'alice' })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  state.enqueue.mockClear();
  state.write.mockClear();
  await continuePatrolAfterSwitchConflict('shared-account', 'switch-a-b');
  expect(state.enqueue).toHaveBeenCalledTimes(1);
  const continuation = state.enqueue.mock.calls[0][1];
  expect(continuation.commandType).toBe('startPatrolAssignment');
  expect(continuation.entityLocalId).toBe('b');
  expect(continuation.bypassSwitchBarrier).toBe(true);
  expect(state.selectInTransaction).toHaveBeenCalledWith(expect.anything(), 'shared-account', { assignmentId: 'b', employeeId: 'alice' });
  expect(state.sync).toHaveBeenCalled();
});
