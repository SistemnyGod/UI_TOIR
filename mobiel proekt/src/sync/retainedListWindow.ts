/** Match SQLite's binary text order, including NULL before text in ASC order. */
function textOrder(a: string | null | undefined, b: string | null | undefined) {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareWorkRows(a: { plannedAt: string | null; createdAtLocal: string; itemId: string }, b: typeof a) {
  return textOrder(a.plannedAt, b.plannedAt) || -textOrder(a.createdAtLocal ?? '', b.createdAtLocal ?? '') || textOrder(a.itemId, b.itemId);
}

export function compareRemarkRows(a: { createdAtLocal: string; remarkId: string }, b: typeof a) {
  return -textOrder(a.createdAtLocal, b.createdAtLocal) || -textOrder(a.remarkId, b.remarkId);
}

export function compareReportRows(a: { completedAt: string | null; assignmentId: string }, b: typeof a) {
  if (a.completedAt === null && b.completedAt !== null) return 1;
  if (b.completedAt === null && a.completedAt !== null) return -1;
  const time = (value: string | null) => { const parsed = Date.parse(value ?? ''); return Number.isFinite(parsed) ? parsed : -Infinity; };
  const left = time(a.completedAt), right = time(b.completedAt);
  return (left > right ? -1 : left < right ? 1 : 0) || textOrder(a.assignmentId, b.assignmentId);
}

/** Retain the previously exposed boundary even when new rows precede it.
 * A removed boundary is passed by sort position, so it cannot force a full scan.
 */
export function needsRetainedPage<T>(rows: readonly T[], minimum: number, boundary: T | undefined, compare: (a: T, b: T) => number) {
  return rows.length < minimum || Boolean(boundary && (!rows.length || compare(rows[rows.length - 1], boundary) < 0));
}
