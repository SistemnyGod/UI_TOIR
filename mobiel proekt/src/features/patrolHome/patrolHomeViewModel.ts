import type { RequestBoardItem } from "@/db/repositories/patrolRepository";

const activeRequestStatuses = new Set(["accepted", "inProgress", "paused"]);
const unsentRequestStatuses = new Set([
  "completedLocal",
  "syncing",
  "retryLater",
  "syncError",
  "authRequired",
  "needsDispatcherDecision"
]);
const visibleRequestStatuses = new Set(["available", "assigned", "accepted"]);

export function buildPatrolHomeSummary(requests: RequestBoardItem[]) {
  return requests.reduce(
    (summary, request) => {
      if (request.status === "available" || request.status === "assigned") {
        summary.available += 1;
      }
      if (activeRequestStatuses.has(request.status)) {
        summary.mine += 1;
      }
      if (unsentRequestStatuses.has(request.status)) {
        summary.unsent += 1;
      }
      return summary;
    },
    { available: 0, mine: 0, unsent: 0 }
  );
}

export function selectVisiblePatrolRequests(
  requests: RequestBoardItem[],
  activeRequestId: string | null,
  limit = 5
) {
  return requests
    .filter((request) => visibleRequestStatuses.has(request.status))
    .filter((request) => request.requestId !== activeRequestId)
    .slice(0, limit);
}