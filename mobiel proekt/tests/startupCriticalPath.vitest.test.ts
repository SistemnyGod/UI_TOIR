import type { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';

import { openRealDatabase } from './support/realDatabase';

// What startup does before the first screen, measured on the real schema: the
// critical path keeps database setup, auth transition repair, outbox recovery
// and orphan photo cleanup; log pruning and accepted media reclamation run later.
vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
vi.mock('@/auth/tokenStorage', () => ({
  getStoredOwnerUserId: async () => 'alice',
  getAccessToken: async () => null,
  getStoredSessionSnapshot: async () => ({ ownerUserId: 'alice', accessToken: null, refreshToken: null, offlineSession: null }),
  clearTokens: async () => {}
}));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
const files = vi.hoisted(() => ({ orphanCleanup: vi.fn(), deleted: [] as string[] }));
vi.mock('@/services/fileStorageService', () => ({
  deletePatrolPhotoDirectory: vi.fn(), deleteOrphanPatrolPhotos: files.orphanCleanup, getLocalFileInfo: vi.fn(),
  deletePreparedMedia: async (path: string) => { files.deleted.push(path); }
}));
vi.mock('@/services/nfcService', () => ({}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('@/api/fileApi', () => ({ uploadMobileFile: vi.fn() }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessToken: vi.fn(), refreshStoredAccessTokenIfNeeded: vi.fn() }));
vi.mock('@/api/mobileApi', () => ({ getOutboxResult: vi.fn(), postOutbox: vi.fn() }));
vi.mock('@/api/serverHealthApi', () => ({ invalidateServerHealthFailures: vi.fn(), checkServerConnection: vi.fn() }));
vi.mock('@/core/network', () => ({ hasUsableNetwork: async () => false }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/diagnosticReportService', () => ({ triggerReportDeliveryDiagnostic: vi.fn() }));

const LINKED_FILES = 60;
const OUTBOX = 4000;
let raw: DatabaseSync | undefined;
afterEach(() => { raw?.close(); raw = undefined; });

function seed(db: DatabaseSync) {
  db.exec('BEGIN');
  const old = '2026-01-01T00:00:00.000Z';
  const file = db.prepare(`INSERT INTO files(client_file_id, owner_user_id, contour_id, local_path, status, server_file_id, linked_at, created_at_local)
    VALUES (?, 'alice', 'test', ?, 'linked', ?, ?, ?)`);
  for (let i = 0; i < LINKED_FILES; i++) file.run(`file-${i}`, `/photos/file-${i}.jpg`, `server-${i}`, old, old);
  const command = db.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type,
    payload_json, created_at_local, status, aggregate_key, sequence_no) VALUES (?, 'alice', 'test', 'savePatrolPointResult', 'patrolPoint', ?, ?, ?, ?, ?)`);
  for (let i = 0; i < OUTBOX; i++) {
    command.run(`op-${i}`, JSON.stringify({ comment: 'x'.repeat(200) }), old, i === 0 ? 'sending' : 'accepted', `point:${i}`, i + 1);
  }
  const log = db.prepare(`INSERT INTO mobile_action_log(id, owner_user_id, event_type, message, created_at_local) VALUES (?, 'alice', 'event', 'm', ?)`);
  for (let i = 0; i < 500; i++) log.run(`log-${i}`, old);
  db.exec('COMMIT');
}

it('keeps outbox recovery before the first screen and moves housekeeping after it', async () => {
  vi.resetModules();
  const opened = await openRealDatabase();
  raw = opened.raw;
  seed(raw);
  const statements: { phase: string; sql: string }[] = [];
  let phase = '';
  opened.hooks.afterRead = sql => { statements.push({ phase, sql }); };
  opened.hooks.afterWrite = sql => { statements.push({ phase, sql }); };
  const { bootstrapApplication, runDeferredStartupMaintenance } = await import('@/core/bootstrap');

  phase = 'critical';
  let start = performance.now();
  await bootstrapApplication();
  const criticalMs = performance.now() - start;
  const critical = statements.filter(item => item.phase === 'critical');
  expect(raw.prepare("SELECT status FROM outbox_commands WHERE client_operation_id = 'op-0'").get()).toMatchObject({ status: 'retryLater' });
  expect(files.orphanCleanup).toHaveBeenCalledOnce();
  expect(critical.some(item => item.sql.includes('mobile_action_log'))).toBe(false);
  expect(critical.some(item => item.sql.includes("status = 'linked'"))).toBe(false);
  expect(files.deleted).toEqual([]);

  phase = 'deferred';
  start = performance.now();
  await runDeferredStartupMaintenance();
  const deferredMs = performance.now() - start;
  const deferred = statements.filter(item => item.phase === 'deferred');
  expect(files.deleted).toHaveLength(LINKED_FILES);
  expect(raw.prepare("SELECT COUNT(*) AS n FROM files WHERE status = 'deletedAfterRetention'").get()).toMatchObject({ n: LINKED_FILES });
  expect(raw.prepare('SELECT COUNT(*) AS n FROM mobile_action_log').get()).toMatchObject({ n: 0 });

  console.info(`startup SQL before first screen: ${critical.length} statements, ${criticalMs.toFixed(1)} ms; `
    + `moved after first render: ${deferred.length} statements, ${deferredMs.toFixed(1)} ms`);
});
