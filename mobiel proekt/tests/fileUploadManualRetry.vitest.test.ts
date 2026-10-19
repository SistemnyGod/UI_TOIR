import { beforeEach, expect, it, vi } from 'vitest';
import { openRealDatabase, selectAll } from './support/realDatabase';

vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: Awaited<ReturnType<typeof openRealDatabase>>['raw'];
beforeEach(async () => {
  vi.resetModules();
  ({ raw } = await openRealDatabase());
});

function seedFile(id: string, status: string, owner = 'alice') {
  raw.prepare(`INSERT INTO files (client_file_id, owner_user_id, contour_id, local_path, status, created_at_local, attempt_count, last_error)
    VALUES (?, ?, 'test', 'file:///photo.jpg', ?, '2026-10-19T00:00:00Z', 5, 'gave up')`).run(id, owner, status);
}
function seedCommand(id: string, status: string, fileId: string) {
  raw.prepare(`INSERT INTO outbox_commands (client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
    payload_json, created_at_local, status, last_error) VALUES (?, 'alice', 'test', 'completePatrolAssignment', 'patrolAssignment', 'assignment-1', ?, '2026-10-19T00:00:00Z', ?, 'file failed')`)
    .run(id, JSON.stringify({ photos: [{ clientFileId: fileId }] }), status);
}

it('gives the file a fresh attempt budget and requeues the locally rejected report under its original ID', async () => {
  seedFile('file-1', 'failed'); seedCommand('report-1', 'rejected', 'file-1');
  const { retryFailedFileUpload } = await import('@/db/repositories/filesRepository');
  await expect(retryFailedFileUpload('alice', 'file-1')).resolves.toEqual({ reactivatedCommands: 1 });
  expect(selectAll(raw, "SELECT status, attempt_count, last_error FROM files WHERE client_file_id = 'file-1'"))
    .toEqual([{ status: 'retryLater', attempt_count: 0, last_error: null }]);
  expect(selectAll(raw, "SELECT client_operation_id, status, last_error FROM outbox_commands"))
    .toEqual([{ client_operation_id: 'report-1', status: 'pending', last_error: null }]);
});

it('does not reopen a command that the server rejected', async () => {
  seedFile('file-1', 'failed'); seedCommand('report-1', 'rejected', 'file-1');
  raw.prepare(`INSERT INTO sync_conflicts (conflict_id, client_operation_id, owner_user_id, contour_id, entity_type, reason, payload_snapshot_json, status)
    VALUES ('conflict-1', 'report-1', 'alice', 'test', 'patrolAssignment', 'rejected by server', '{}', 'open')`).run();
  const { retryFailedFileUpload } = await import('@/db/repositories/filesRepository');
  await expect(retryFailedFileUpload('alice', 'file-1')).resolves.toEqual({ reactivatedCommands: 0 });
  expect(selectAll(raw, "SELECT status FROM outbox_commands")).toEqual([{ status: 'rejected' }]);
});

it('refuses files that are not in the failed state or belong to another owner', async () => {
  seedFile('file-1', 'retryLater'); seedFile('file-2', 'failed', 'bob');
  const { retryFailedFileUpload } = await import('@/db/repositories/filesRepository');
  await expect(retryFailedFileUpload('alice', 'file-1')).rejects.toThrow('Повторить можно только');
  await expect(retryFailedFileUpload('alice', 'file-2')).rejects.toThrow('Повторить можно только');
  expect(selectAll(raw, "SELECT status FROM files WHERE client_file_id = 'file-2'")).toEqual([{ status: 'failed' }]);
});
