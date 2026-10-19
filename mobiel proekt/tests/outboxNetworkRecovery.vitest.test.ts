import { beforeEach, expect, it, vi } from 'vitest';
import { openRealDatabase, selectAll } from './support/realDatabase';

vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'alice' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn() }));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

let raw: Awaited<ReturnType<typeof openRealDatabase>>['raw'];
beforeEach(async () => {
  vi.resetModules();
  ({ raw } = await openRealDatabase());
});

const later = new Date(Date.now() + 10 * 60_000).toISOString();
const earlier = new Date(Date.now() - 60_000).toISOString();

function seed(id: string, status: string, options: { reason?: string | null; nextAttemptAt?: string | null; attempts?: number; type?: string } = {}) {
  raw.prepare(`INSERT INTO outbox_commands (client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
    payload_json, created_at_local, updated_at_local, status, retry_reason, next_attempt_at, attempt_count, aggregate_key, sequence_no)
    VALUES (?, 'alice', 'test', ?, 'patrolAssignment', ?, '{}', '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z', ?, ?, ?, ?, ?, 1)`)
    .run(id, options.type ?? 'completePatrolAssignment', `assignment-${id}`, status, options.reason ?? null, options.nextAttemptAt ?? null, options.attempts ?? 1, `patrolAssignment:assignment-${id}`);
}

it('a network change reactivates commands parked because the server was unreachable, slow or offline', async () => {
  seed('waiting', 'waiting_network', { reason: 'network' });
  seed('server', 'retryLater', { reason: 'server', nextAttemptAt: later });
  seed('timeout', 'retryLater', { reason: 'timeout', nextAttemptAt: later });
  seed('rate-limited', 'retryLater', { reason: 'rateLimit', nextAttemptAt: later });
  seed('unknown', 'retryLater', { reason: 'unknown', nextAttemptAt: later });
  const { activateNetworkRecoveredOutboxCommands } = await import('@/db/repositories/outboxRepository');
  await activateNetworkRecoveredOutboxCommands('alice');
  const rows = Object.fromEntries(selectAll<{ client_operation_id: string; status: string }>(raw, 'SELECT client_operation_id, status FROM outbox_commands')
    .map(row => [row.client_operation_id, row.status]));
  expect(rows).toEqual({ waiting: 'pending', server: 'pending', timeout: 'pending', 'rate-limited': 'retryLater', unknown: 'retryLater' });
});

it('report status checks skip never-sent reports and respect the scheduled retry time', async () => {
  seed('never-sent', 'pending', { attempts: 0 });
  seed('due', 'retryLater', { reason: 'server', nextAttemptAt: earlier });
  seed('not-due', 'retryLater', { reason: 'server', nextAttemptAt: later });
  seed('in-flight', 'sending', { attempts: 2 });
  const { listUnconfirmedCompleteReportCommands } = await import('@/db/repositories/outboxRepository');
  const ids = (await listUnconfirmedCompleteReportCommands('alice')).map(command => command.clientOperationId).sort();
  expect(ids).toEqual(['due', 'in-flight']);
});
