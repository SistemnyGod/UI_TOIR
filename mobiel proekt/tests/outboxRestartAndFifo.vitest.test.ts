import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase } from './support/realDatabase';

// Behavior for two delivery invariants on the real schema:
// - commands left in 'sending' by a killed process are returned to the queue at startup;
// - within one aggregate the next command is released only after the previous one settles
//   (outboxAcknowledgementBarriersSql).
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice' as string | null, generation: 0, uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({
  getStoredOwnerUserId: async () => session.owner,
  getAccessToken: async () => null,
  getStoredSessionSnapshot: async () => ({ ownerUserId: session.owner, accessToken: null, refreshToken: null, offlineSession: null }),
  clearTokens: async () => {}
}));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn(), deleteOrphanPatrolPhotos: vi.fn(), getLocalFileInfo: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {}, pruneMobileActionLog: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
// Network-facing collaborators of syncEngine are irrelevant to startup recovery.
vi.mock('@/api/fileApi', () => ({ uploadMobileFile: vi.fn() }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessToken: vi.fn(), refreshStoredAccessTokenIfNeeded: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ getOutboxResult: vi.fn(), postOutbox: vi.fn() }));
vi.mock('@/api/serverHealthApi', () => ({ invalidateServerHealthFailures: vi.fn(), checkServerConnection: vi.fn() }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => false }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/diagnosticReportService', () => ({ triggerReportDeliveryDiagnostic: vi.fn() }));
vi.mock('@/services/localMediaReclamationService', () => ({ reclaimAcceptedLocalMedia: vi.fn() }));

let raw: DatabaseSync;

beforeEach(async () => {
  vi.resetModules();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  ({ raw } = await openRealDatabase());
});
afterEach(() => raw.close());

function seed(id: string, status: string, options: { owner?: string; aggregate?: string; sequence?: number } = {}) {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type,
      payload_json, created_at_local, status, aggregate_key, sequence_no, last_attempt_at)
    VALUES (?, ?, 'test', 'savePatrolPointResult', 'patrolPoint', '{}', '2026-10-19', ?, ?, ?, '2026-10-19T08:00:00Z')`)
    .run(id, options.owner ?? 'alice', status, options.aggregate ?? id, options.sequence ?? 1);
}
const commandRow = (id: string) => raw.prepare(
  'SELECT status, next_attempt_at AS nextAttemptAt, last_attempt_at AS lastAttemptAt FROM outbox_commands WHERE client_operation_id = ?'
).get(id) as { status: string; nextAttemptAt: string | null; lastAttemptAt: string | null };

it('returns commands interrupted in sending to the queue when the app starts', async () => {
  seed('interrupted', 'sending');
  seed('queued', 'pending');
  seed('refused', 'rejected');
  seed('foreign', 'sending', { owner: 'bob' });
  const { bootstrapApplication } = await import('@/core/bootstrap');

  await bootstrapApplication();

  expect(commandRow('interrupted')).toMatchObject({ status: 'retryLater', lastAttemptAt: null });
  expect(commandRow('interrupted').nextAttemptAt).not.toBeNull();
  expect(commandRow('queued').status).toBe('pending');
  expect(commandRow('refused').status).toBe('rejected');
  expect(commandRow('foreign').status).toBe('sending');
  const queue = await import('@/db/repositories/outboxRepository');
  expect((await queue.listPendingOutboxCommands('alice')).map(command => command.clientOperationId).sort()).toEqual(['interrupted', 'queued']);
});

it.each(['accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal'])(
  'releases the next command of an aggregate once the previous one is %s',
  async settled => {
    seed('head', settled, { aggregate: 'patrolAssignment:a', sequence: 1 });
    seed('next', 'pending', { aggregate: 'patrolAssignment:a', sequence: 2 });
    const queue = await import('@/db/repositories/outboxRepository');

    expect((await queue.listPendingOutboxCommands('alice')).map(command => command.clientOperationId)).toEqual(['next']);
    expect(await queue.markOutboxCommandsSending('alice', ['next'])).toBe(1);
  }
);

it.each(['pending', 'sending', 'retryLater', 'rejected', 'conflict', 'waiting_auth'])(
  'holds the next command of an aggregate while the previous one is %s',
  async unsettled => {
    seed('head', unsettled, { aggregate: 'patrolAssignment:a', sequence: 1 });
    seed('next', 'pending', { aggregate: 'patrolAssignment:a', sequence: 2 });
    seed('other-aggregate', 'pending', { aggregate: 'patrolAssignment:b', sequence: 3 });
    const queue = await import('@/db/repositories/outboxRepository');

    const listed = (await queue.listPendingOutboxCommands('alice')).map(command => command.clientOperationId);
    expect(listed).not.toContain('next');
    expect(listed).toContain('other-aggregate');
    expect(await queue.markOutboxCommandsSending('alice', ['next'])).toBe(0);
    expect(commandRow('next').status).toBe('pending');
  }
);
