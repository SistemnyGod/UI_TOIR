import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openRealDatabase, type QueryHook } from './support/realDatabase';

vi.mock('expo-sqlite', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'owner' }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/api/httpClient', () => ({ mobileRequest: vi.fn() }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: vi.fn() }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

// A phone after months of use: three accounts, 1200 patrols of 25 points,
// 12 000 outbox commands (mostly acknowledged history) and 6000 notifications.
const ASSIGNMENTS = 1200;
const POINTS = 25;
const OUTBOX = 12_000;
const NOTIFICATIONS = 6000;
const owners = ['owner', 'other', 'third'];
const newIndexes = ['ix_mobile_notifications_owner_created', 'ix_mobile_notifications_owner_unread', 'ix_mobile_notifications_owner_read_pending',
  'ix_patrol_assignments_owner_contour_report', 'ix_outbox_commands_dispatchable', 'ix_outbox_commands_unacknowledged_aggregate'];

function seed(raw: DatabaseSync) {
  raw.exec('BEGIN');
  const request = raw.prepare(`INSERT INTO patrol_request_board(request_id,owner_user_id,route_id,route_name,planned_start_at,status,revision,contour_id)
    VALUES (?,?,?,?,?,?,1,'test')`);
  const assignment = raw.prepare(`INSERT INTO patrol_assignments(assignment_id,owner_user_id,request_id,route_id,status,revision,contour_id,
    local_report_present,completed_at_local) VALUES (?,?,?,?,?,1,'test',?,?)`);
  const point = raw.prepare('INSERT INTO assignment_route_points(assignment_id,point_id,route_id,name,order_index) VALUES (?,?,?,?,?)');
  const result = raw.prepare(`INSERT INTO point_results(local_result_id,owner_user_id,assignment_id,point_id,status,sync_status,contour_id)
    VALUES (?,?,?,?,?,'synced','test')`);
  const cache = raw.prepare(`INSERT INTO patrol_report_cache(owner_user_id,contour_id,assignment_id,route_name,employee_name,completed_at,cached_at)
    VALUES (?,'test',?,'Route','Name',?,?)`);
  for (let i = 0; i < ASSIGNMENTS; i++) {
    const owner = owners[i % owners.length], id = `a-${i}`, date = new Date(Date.UTC(2026, 9, 1) - i * 3_600_000).toISOString();
    const done = i % 4 !== 0;
    request.run(`r-${i}`, owner, `route-${i % 30}`, `Маршрут ${i}`, date, done ? 'completed' : 'assigned');
    assignment.run(id, owner, `r-${i}`, `route-${i % 30}`, done ? 'completedServer' : 'inProgress', done ? 1 : 0, done ? date : null);
    for (let p = 0; p < POINTS; p++) {
      point.run(id, `p-${i}-${p}`, `route-${i % 30}`, `Точка ${p}`, p + 1);
      if (done || p % 3 === 0) result.run(`res-${i}-${p}`, owner, id, `p-${i}-${p}`, p % 5 ? 'ok' : 'issue');
    }
    if (i % 2) cache.run(owner, `server-${i}`, date, date);
  }
  const outbox = raw.prepare(`INSERT INTO outbox_commands(client_operation_id,owner_user_id,contour_id,command_type,entity_type,entity_local_id,
    payload_json,created_at_local,status,aggregate_key,sequence_no,next_attempt_at) VALUES (?,?,'test',?,?,?,?,?,?,?,?,?)`);
  const statuses = ['accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'duplicate', 'superseded', 'pending', 'retryLater', 'conflict'];
  for (let i = 0; i < OUTBOX; i++) {
    const owner = owners[i % owners.length], date = new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString();
    const status = statuses[i % statuses.length], aggregate = `a-${i % ASSIGNMENTS}`;
    const completion = i % 7 === 0 && i < ASSIGNMENTS;
    outbox.run(`op-${i}`, owner, completion ? 'completePatrolAssignment' : 'savePatrolPointResult', 'patrolAssignment', completion ? aggregate : `${aggregate}:${i}`,
      JSON.stringify({ assignmentId: aggregate, dependencies: i % 13 === 0 && i > 0 ? [`op-${i - 3}`] : [] }), date, status,
      `patrolAssignment:${aggregate}`, i + 1, status === 'retryLater' ? date : null);
  }
  const notification = raw.prepare(`INSERT INTO mobile_notifications(notification_id,owner_user_id,notification_type,title,message,created_at,read_at,
    read_sync_pending,contour_id) VALUES (?,?,'info','T','M',?,?,?,'test')`);
  for (let i = 0; i < NOTIFICATIONS; i++) {
    const date = new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString();
    notification.run(`n-${i}`, owners[i % owners.length], date, i % 10 ? date : null, i % 50 === 0 ? 1 : 0);
  }
  raw.exec('COMMIT');
}

type Captured = { label: string; sql: string; args: unknown[] };

async function captureHotQueries(hooks: { afterRead: QueryHook | null }) {
  const captured: Captured[] = [];
  const results: Record<string, unknown> = {};
  let label = '';
  hooks.afterRead = (sql, args) => { captured.push({ label, sql, args }); };
  const run = async (name: string, action: () => Promise<unknown>) => { label = name; results[name] = await action(); };
  const board = await import('@/db/repositories/patrolRequestBoardRepository');
  const assignments = await import('@/db/repositories/patrolAssignmentRepository');
  const outboxRead = await import('@/db/repositories/outboxReadRepository');
  const outbox = await import('@/db/repositories/outboxRepository');
  const reports = await import('@/db/repositories/patrolReportRepository');
  const notifications = await import('@/db/repositories/notificationRepository');
  const scope = { ownerUserId: 'owner', contourId: 'test', generation: 0 };
  await run('requestBoard', () => board.listRequestBoard());
  await run('pointList', () => assignments.listAssignmentPoints('a-0', 'owner', 'test'));
  await run('reportReadiness', () => assignments.getReportReadiness('a-0'));
  await run('outboxNext', () => outbox.listPendingOutboxCommands('owner', 25));
  await run('outboxRetryAt', () => outboxRead.getNextOutboxRetryAt('owner'));
  await run('outboxPending', () => outboxRead.countPendingOutboxCommands('owner'));
  await run('reportsFeed', () => reports.listPatrolReports(scope, 25));
  await run('notifications', () => notifications.listLocalNotifications(30));
  await run('notificationsUnread', () => notifications.countUnreadNotifications(scope as never));
  await run('notificationsPendingReads', () => notifications.listPendingNotificationReads());
  hooks.afterRead = null;
  return { captured, results };
}

function plan(raw: DatabaseSync, query: Captured) {
  return (raw.prepare('EXPLAIN QUERY PLAN ' + query.sql).all(...(query.args as never[])) as { detail: string }[]).map(row => row.detail);
}

function medianMs(raw: DatabaseSync, query: Captured) {
  const statement = raw.prepare(query.sql);
  const times: number[] = [];
  statement.all(...(query.args as never[]));
  for (let i = 0; i < 15; i++) {
    const start = performance.now();
    statement.all(...(query.args as never[]));
    times.push(performance.now() - start);
  }
  return Number(times.sort((a, b) => a - b)[7].toFixed(3));
}

function profile(raw: DatabaseSync, captured: Captured[]) {
  const unique = captured.filter((query, index) => captured.findIndex(other => other.label === query.label && other.sql === query.sql) === index);
  return unique.map(query => ({ label: query.label, sql: query.sql.replace(/\s+/g, ' ').trim().slice(0, 90), plan: plan(raw, query), medianMs: medianMs(raw, query) }));
}

function planOf(report: ReturnType<typeof profile>, label: string, sqlStart: string) {
  const entry = report.find(item => item.label === label && item.sql.startsWith(sqlStart));
  expect(entry, `${label}: ${sqlStart}`).toBeDefined();
  return entry!.plan.join(' | ');
}

let raw: DatabaseSync | undefined;
afterEach(() => { raw?.close(); raw = undefined; });

describe('hot query indexes', () => {
  it('upgrade an existing database, keep every result, and remove the scans and sorts', async () => {
    vi.resetModules();
    const first = await openRealDatabase();
    raw = first.raw;
    // The database as an installed 0.1.51 build left it: no new indexes, no marker.
    raw.exec(newIndexes.map(name => `DROP INDEX ${name};`).join('\n')
      + "DELETE FROM schema_migrations WHERE id = '20261019_hot_query_indexes';");
    seed(raw);
    const before = await captureHotQueries(first.hooks);
    const beforeProfile = profile(raw, before.captured);

    vi.resetModules();
    const upgraded = await openRealDatabase(raw);
    const indexNames = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map(row => row.name);
    expect(indexNames).toEqual(expect.arrayContaining(newIndexes));
    expect(raw.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '20261019_hot_query_indexes'").get()).toMatchObject({ n: 1 });
    expect(raw.prepare('SELECT COUNT(*) AS n FROM outbox_commands').get()).toMatchObject({ n: OUTBOX });

    const after = await captureHotQueries(upgraded.hooks);
    const afterProfile = profile(raw, after.captured);
    expect(after.results).toEqual(before.results);

    expect(planOf(afterProfile, 'notifications', 'SELECT notification_id AS id')).toContain('ix_mobile_notifications_owner_created');
    expect(planOf(afterProfile, 'notifications', 'SELECT notification_id AS id')).not.toMatch(/SCAN mobile_notifications|TEMP B-TREE/);
    expect(planOf(afterProfile, 'notificationsUnread', 'SELECT COUNT(*)')).toContain('ix_mobile_notifications_owner_unread');
    expect(planOf(afterProfile, 'notificationsPendingReads', 'SELECT notification_id')).toContain('ix_mobile_notifications_owner_read_pending');
    expect(planOf(afterProfile, 'reportsFeed', 'SELECT * FROM')).toContain('ix_patrol_assignments_owner_contour_report');
    const dispatch = planOf(afterProfile, 'outboxNext', 'SELECT candidate.*');
    expect(dispatch).toContain('SEARCH candidate USING INDEX ix_outbox_commands_dispatchable');
    expect(dispatch).toContain('SEARCH previous USING INDEX ix_outbox_commands_unacknowledged_aggregate');
    expect(dispatch).not.toContain('TEMP B-TREE');

    mkdirSync('output/performance-audit', { recursive: true });
    writeFileSync('output/performance-audit/hot-query-plans.json', JSON.stringify({
      rows: { assignments: ASSIGNMENTS, pointsPerAssignment: POINTS, outbox: OUTBOX, notifications: NOTIFICATIONS },
      before: beforeProfile, after: afterProfile
    }, null, 2));

    // A further launch neither repeats the migration nor fails on the existing indexes.
    vi.resetModules();
    await openRealDatabase(raw);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '20261019_hot_query_indexes'").get()).toMatchObject({ n: 1 });
  }, 120_000);

  it('reads the applied migration list once per launch', async () => {
    vi.resetModules();
    const first = await openRealDatabase();
    raw = first.raw;
    const total = (raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n;
    expect(total).toBeGreaterThan(40);

    // Every read of the next launch on an up-to-date database.
    vi.resetModules();
    const reads: string[] = [];
    await openRealDatabaseCountingReads(raw, reads);
    expect(reads.filter(sql => sql.includes('schema_migrations'))).toHaveLength(1);
    expect(reads.length).toBeLessThan(10);
    console.info(`startup reads on an up-to-date database: ${reads.length} (applied migrations: ${total})`);
  });

  it('reads the route once when it checks report readiness', async () => {
    vi.resetModules();
    const opened = await openRealDatabase();
    raw = opened.raw;
    seed(raw);
    const reads: string[] = [];
    opened.hooks.afterRead = sql => { reads.push(sql); };
    const readiness = await (await import('@/db/repositories/patrolAssignmentRepository')).getReportReadiness('a-0');
    opened.hooks.afterRead = null;
    const { listAssignmentPointsOwnedSql } = await import('@/db/repositories/patrolPointOwnershipQueries');
    expect(reads.filter(sql => sql === listAssignmentPointsOwnedSql)).toHaveLength(1);
    expect(readiness.progress).toEqual(await (await import('@/db/repositories/patrolAssignmentRepository')).getAssignmentProgress('a-0'));
    expect(readiness.progress.total).toBe(POINTS);
  });
});

async function openRealDatabaseCountingReads(existing: DatabaseSync, reads: string[]) {
  const adapter = {
    execAsync: async (sql: string) => { existing.exec(sql); },
    getAllAsync: async (sql: string, args: never[] = []) => { reads.push(sql); return existing.prepare(sql).all(...args); },
    getFirstAsync: async (sql: string, args: never[] = []) => { reads.push(sql); return existing.prepare(sql).get(...args) ?? null; },
    runAsync: async (sql: string, args: never[] = []) => existing.prepare(sql).run(...args),
    closeAsync: async () => {}
  };
  const storage = await import('@/db/encryptedDatabase');
  vi.mocked(storage.openProtectedDatabase).mockResolvedValue(adapter as never);
  vi.mocked(storage.openProtectedDatabaseConnection).mockResolvedValue(adapter as never);
  await (await import('@/db/database')).initializeDatabase();
}
