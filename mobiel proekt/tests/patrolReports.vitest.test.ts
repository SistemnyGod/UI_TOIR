import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ owner: 'alice', db: null as any, request: vi.fn(), deliveries: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/api/httpClient', () => ({ mobileRequest: state.request }));
vi.mock('@/db/repositories/outboxRepository', () => ({ getReportDeliveryStates: state.deliveries }));
vi.mock('@/db/database', () => ({
  getDatabase: async () => state.db,
  withProtectedExclusiveTransactionAsync: async (db: any, action: any) => action(db)
}));
import { fetchPatrolReportPage, listPatrolReports, readPatrolReportDetails } from '@/db/repositories/patrolReportRepository';
let sqlite: DatabaseSync;
const scope = { ownerUserId: 'alice', contourId: 'test' };
beforeEach(() => {
  state.owner = 'alice'; state.request.mockReset(); state.deliveries.mockReset().mockResolvedValue(new Map());
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE patrol_assignments (assignment_id TEXT, owner_user_id TEXT, contour_id TEXT, request_id TEXT, route_id TEXT, status TEXT, completed_at_local TEXT, local_report_present INTEGER NOT NULL DEFAULT 0, local_report_needs_review INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE patrol_request_board (request_id TEXT, owner_user_id TEXT, route_name TEXT, assigned_full_name TEXT);
    CREATE TABLE routes (route_id TEXT, name TEXT);
    CREATE TABLE patrol_report_cache (owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, route_name TEXT, employee_name TEXT, completed_at TEXT, cached_at TEXT, PRIMARY KEY(owner_user_id, contour_id, assignment_id));
    CREATE TABLE patrol_report_detail_cache (owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, points_json TEXT, cached_at TEXT, PRIMARY KEY(owner_user_id, contour_id, assignment_id));
  `);
  state.db = {
    getAllAsync: async (sql: string, params: any[]) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: any[]) => sqlite.prepare(sql).get(...params),
    runAsync: async (sql: string, params: any[]) => sqlite.prepare(sql).run(...params)
  };
});
afterEach(() => sqlite.close());

it('deduplicates before paging and keeps a server-confirmed report available locally', async () => {
  for (let i = 0; i < 30; i++) {
    const id = `route-${String(i).padStart(2, '0')}`;
    const at = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
    sqlite.prepare('INSERT INTO patrol_assignments (assignment_id, owner_user_id, contour_id, status, completed_at_local, local_report_present) VALUES (?, ?, ?, ?, ?, 1)').run(id, 'alice', 'test', 'completedLocal', at);
    sqlite.prepare('INSERT INTO patrol_report_cache VALUES (?, ?, ?, ?, ?, ?, ?)').run('alice', 'test', id, id, 'Alice', at, at);
  }
  sqlite.prepare('INSERT INTO patrol_report_cache VALUES (?, ?, ?, ?, ?, ?, ?)').run('bob', 'test', 'secret', 'Other account', 'Bob', '2099-01-01', '');
  const first = await listPatrolReports(scope, 25);
  expect(first.rows).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(first.rows[0]).toMatchObject({ assignmentId: 'route-29', local: 1, serverConfirmed: 1 });
  expect(new Set(first.rows.map(row => row.assignmentId)).size).toBe(25);
  const expanded = await listPatrolReports(scope, 50);
  expect(expanded.rows).toHaveLength(30);
  expect(expanded.hasMore).toBe(false);
  expect(state.deliveries).toHaveBeenCalledTimes(2);
});

it('keeps a locally completed report visible when its old timestamp cannot be restored', async () => {
  sqlite.prepare('INSERT INTO patrol_assignments (assignment_id, owner_user_id, contour_id, status, completed_at_local, local_report_present) VALUES (?, ?, ?, ?, NULL, 1)').run('undated', 'alice', 'test', 'syncError');
  const reports = await listPatrolReports(scope, 25);
  expect(reports.rows).toContainEqual(expect.objectContaining({ assignmentId: 'undated', local: 1, completedAt: null }));
});

it('does not cache a response into another account after login changes', async () => {
  state.request.mockImplementation(async () => {
    state.owner = 'bob';
    return { items: [{ assignmentId: 'a', routeName: 'A', employeeName: 'Alice', completedAt: null }], total: 1, page: 1, pageSize: 25 };
  });
  await expect(fetchPatrolReportPage(scope, { page: 1, cursor: null })).rejects.toThrow('Аккаунт изменился');
  expect(sqlite.prepare('SELECT COUNT(*) AS total FROM patrol_report_cache').get()).toMatchObject({ total: 0 });
});

it('opens validated cached details without any network request', async () => {
  const points = [{ id: 'p', pointName: 'Pump', status: 'ok', comment: '', photos: 0, actualAt: '2026-09-21T00:00:00Z' }];
  sqlite.prepare('INSERT INTO patrol_report_detail_cache VALUES (?, ?, ?, ?, ?)').run('alice', 'test', 'a', JSON.stringify(points), '');
  expect(await readPatrolReportDetails(scope, 'a')).toEqual({ points, cached: true });
  expect(state.request).not.toHaveBeenCalled();
});

it('supports older servers without a cursor and stores a whole page', async () => {
  state.request.mockResolvedValue({ items: [{ assignmentId: 'a', routeName: 'A', employeeName: 'Alice', completedAt: null }], total: 26, page: 1, pageSize: 25 });
  expect(await fetchPatrolReportPage(scope, { page: 1, cursor: null })).toMatchObject({ page: 2, cursor: null, hasMore: true, items: [{ assignmentId: 'a' }] });
  expect((await listPatrolReports(scope, 25)).rows[0]).toMatchObject({ assignmentId: 'a', local: 0, serverConfirmed: 1 });
});
