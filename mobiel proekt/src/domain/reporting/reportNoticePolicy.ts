import type { ReportDeliveryState } from "@/domain/reporting/reportDeliveryState";

export type ReportNoticeKind = "savedOffline" | "loginRequired" | "needsDecision";

export type UndeliveredReport = {
  assignmentId: string;
  clientOperationId: string;
  routeName: string | null;
  delivery: ReportDeliveryState["status"];
};

export type ReportNotice = UndeliveredReport & { kind: ReportNoticeKind };

/** Which lock-screen notice a report delivery state deserves, if any. */
export function noticeKindForDelivery(delivery: ReportDeliveryState["status"]): ReportNoticeKind | null {
  switch (delivery) {
    case "waitingNetwork":
      return "savedOffline";
    case "waitingAuth":
      return "loginRequired";
    case "repairRequired":
    case "conflict":
    case "wrongContour":
    case "blockedByDependency":
      return "needsDecision";
    default:
      return null;
  }
}

/**
 * Each report gets each kind of notice once. A report that flaps between
 * "no network" and "retry scheduled" is not announced again; records of
 * reports that left the queue are dropped.
 */
export function decideReportNotices(
  reports: readonly UndeliveredReport[],
  alreadySent: Readonly<Record<string, ReportNoticeKind>>
): { notices: ReportNotice[]; sent: Record<string, ReportNoticeKind> } {
  const notices: ReportNotice[] = [];
  const sent: Record<string, ReportNoticeKind> = {};
  for (const report of reports) {
    const kind = noticeKindForDelivery(report.delivery);
    const previous = alreadySent[report.clientOperationId];
    if (kind && previous !== kind) {
      notices.push({ ...report, kind });
      sent[report.clientOperationId] = kind;
    } else if (previous) {
      sent[report.clientOperationId] = previous;
    }
  }
  return { notices, sent };
}
