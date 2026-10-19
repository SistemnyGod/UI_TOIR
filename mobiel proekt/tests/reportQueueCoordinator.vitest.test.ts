import { queuePatrolReport } from '@/features/patrol/reportSubmissionCoordinator';
import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ commit: vi.fn(), sync: vi.fn() }));
vi.mock('@/db/repositories/patrolRepository', () => ({ completeAssignmentLocally: s.commit }));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: s.sync }));
beforeEach(() => vi.resetAllMocks());

it('offline completion returns the persisted operation without waiting for the network', async () => {
  s.commit.mockResolvedValue({ alreadyQueued: false, clientOperationId: 'persisted-id' });
  let finish!: (value: any) => void;
  s.sync.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await expect(queuePatrolReport('assignment')).resolves.toMatchObject({ status: 'queued', clientOperationId: 'persisted-id' });
  expect(s.commit.mock.invocationCallOrder[0]).toBeLessThan(s.sync.mock.invocationCallOrder[0]);
  finish({ skipped: 'offline' });
});

it('SQLite failure does not start network delivery or report a queued result', async () => {
  s.commit.mockRejectedValue(Error('SQLite full'));
  await expect(queuePatrolReport('assignment')).rejects.toThrow('SQLite full');
  expect(s.sync).not.toHaveBeenCalled();
});

it('a persisted completion is reused even when the immediate network attempt fails', async () => {
  s.commit.mockResolvedValue({ alreadyQueued: true, clientOperationId: 'same-id' });
  s.sync.mockRejectedValue(Error('offline'));
  await expect(queuePatrolReport('assignment')).resolves.toMatchObject({ alreadyQueued: true, clientOperationId: 'same-id' });
});
