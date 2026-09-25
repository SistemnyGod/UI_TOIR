import { z } from 'zod';
import { mobileRequest } from '@/api/httpClient';
import { getStoredOwnerUserId } from '@/auth/tokenStorage';
import { currentContourId } from '@/core/environments';
import { getDatabase, withProtectedExclusiveTransactionAsync } from '@/db/database';
import { withSqliteBusyRetry } from '@/db/sqliteBusyRetry';
import { getReportDeliveryStates } from '@/db/repositories/outboxRepository';
import type { ReportDeliveryStateSnapshot } from '@/domain/reporting/reportDeliveryState';

const reportSchema = z.object({ assignmentId: z.string(), routeName: z.string(), employeeName: z.string(), completedAt: z.string().nullable() });
const pageSchema = z.object({ items: z.array(reportSchema), total: z.number(), page: z.number(), pageSize: z.number(), nextCursor: z.string().nullable().optional() });
const pointsSchema = z.array(z.object({ id: z.string(), pointName: z.string(), status: z.string(), comment: z.string(), photos: z.number(), actualAt: z.string() }));
export type ReportScope = { ownerUserId: string; contourId: string };
export type PatrolReport = z.infer<typeof reportSchema> & { local: number; serverConfirmed: number; status: string | null; needsReview?: number; delivery?: ReportDeliveryStateSnapshot };
export type PatrolReportPoints = z.infer<typeof pointsSchema>;
export type ReportPagePosition = { page: number; cursor: string | null };

export async function getReportScope(): Promise<ReportScope> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) throw new Error('Войдите в аккаунт, чтобы открыть отчёты.');
  return { ownerUserId, contourId: currentContourId };
}

async function assertScope(scope: ReportScope) {
  if (scope.contourId !== currentContourId || scope.ownerUserId !== await getStoredOwnerUserId()) {
    throw new Error('Аккаунт изменился. Откройте журнал заново.');
  }
}

// Deduplicate before LIMIT. Server confirmation preserves local availability.
export const reportListSql = `
  SELECT a.assignment_id AS assignmentId, COALESCE(c.route_name, r.route_name, route.name, '') AS routeName,
    COALESCE(c.employee_name, r.assigned_full_name, '') AS employeeName,
    COALESCE(c.completed_at, a.completed_at_local) AS completedAt, a.status, a.local_report_needs_review AS needsReview, 1 AS local,
    CASE WHEN c.assignment_id IS NOT NULL OR a.status IN ('completed', 'completedServer') THEN 1 ELSE 0 END AS serverConfirmed
  FROM patrol_assignments a
  LEFT JOIN patrol_request_board r ON r.request_id = a.request_id AND r.owner_user_id = a.owner_user_id
  LEFT JOIN routes route ON route.route_id = a.route_id
  LEFT JOIN patrol_report_cache c ON c.assignment_id = a.assignment_id AND c.owner_user_id = a.owner_user_id AND c.contour_id = a.contour_id
  WHERE a.owner_user_id = ? AND a.contour_id = ? AND a.local_report_present = 1
  UNION ALL
  SELECT c.assignment_id, c.route_name, c.employee_name, c.completed_at, NULL, 0, 0, 1
  FROM patrol_report_cache c
  WHERE c.owner_user_id = ? AND c.contour_id = ? AND NOT EXISTS (
    SELECT 1 FROM patrol_assignments a WHERE a.assignment_id = c.assignment_id
      AND a.owner_user_id = c.owner_user_id AND a.contour_id = c.contour_id AND a.local_report_present = 1
  )`;

export async function listPatrolReports(scope: ReportScope, limit: number) {
  await assertScope(scope);
  const db = await getDatabase();
  const rows = await db.getAllAsync<PatrolReport>(
    `SELECT * FROM (${reportListSql})
       ORDER BY CASE WHEN completedAt IS NULL THEN 1 ELSE 0 END, julianday(completedAt) DESC, assignmentId LIMIT ?`,
    [scope.ownerUserId, scope.contourId, scope.ownerUserId, scope.contourId, limit + 1]
  );
  const visible = rows.slice(0, limit);
  const deliveries = await getReportDeliveryStates(scope.ownerUserId, visible.filter(row => row.local).map(row => row.assignmentId));
  await assertScope(scope);
  return { rows: visible.map(row => ({ ...row, delivery: deliveries.get(row.assignmentId) })), hasMore: rows.length > limit };
}

export async function fetchPatrolReportPage(scope: ReportScope, position: ReportPagePosition) {
  await assertScope(scope);
  const remote = await mobileRequest(`/api/v1/mobile/patrol-reports?page=${position.page}&pageSize=25${position.cursor ? `&cursor=${encodeURIComponent(position.cursor)}` : ''}`, pageSchema);
  await assertScope(scope);
  const db = await getDatabase();
  await withSqliteBusyRetry(() => withProtectedExclusiveTransactionAsync(db, async tx => {
    for (const report of remote.items) {
      await tx.runAsync(`INSERT INTO patrol_report_cache (owner_user_id, contour_id, assignment_id, route_name, employee_name, completed_at, cached_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, contour_id, assignment_id) DO UPDATE SET
        route_name = excluded.route_name, employee_name = excluded.employee_name, completed_at = excluded.completed_at, cached_at = excluded.cached_at`,
      [scope.ownerUserId, scope.contourId, report.assignmentId, report.routeName, report.employeeName, report.completedAt, new Date().toISOString()]);
    }
  }));
  const hasMore = remote.nextCursor === undefined ? remote.page * remote.pageSize < remote.total : remote.nextCursor !== null;
  return {
    items: remote.items,
    page: position.page + 1,
    cursor: remote.nextCursor ?? null,
    hasMore
  };
}

export async function readPatrolReportDetails(scope: ReportScope, assignmentId: string) {
  await assertScope(scope);
  const db = await getDatabase();
  const cached = await db.getFirstAsync<{ pointsJson: string }>(`SELECT points_json AS pointsJson FROM patrol_report_detail_cache
    WHERE owner_user_id = ? AND contour_id = ? AND assignment_id = ?`, [scope.ownerUserId, scope.contourId, assignmentId]);
  if (cached) {
    const parsed = (() => {
      try { return pointsSchema.safeParse(JSON.parse(cached.pointsJson)); }
      catch { return null; }
    })();
    if (parsed?.success) {
      await assertScope(scope);
      return { points: parsed.data, cached: true };
    }
  }
  const points = await mobileRequest(`/api/v1/mobile/patrol-reports/${assignmentId}/points`, pointsSchema);
  await assertScope(scope);
  await withSqliteBusyRetry(() => db.runAsync(`INSERT INTO patrol_report_detail_cache (owner_user_id, contour_id, assignment_id, points_json, cached_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, contour_id, assignment_id) DO UPDATE SET points_json = excluded.points_json, cached_at = excluded.cached_at`,
  [scope.ownerUserId, scope.contourId, assignmentId, JSON.stringify(points), new Date().toISOString()]));
  return { points, cached: false };
}
