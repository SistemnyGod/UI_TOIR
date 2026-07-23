import assert from "node:assert/strict";
import test from "node:test";

import { buildPatrolHomeSummary, selectVisiblePatrolRequests } from "../src/features/patrolHome/patrolHomeViewModel.ts";

const baseRequest = {
  displayNumber: "1",
  routeId: "route-1",
  routeName: "Маршрут",
  plannedStartAt: "2026-07-23T08:00:00.000Z",
  assignedFullName: null,
  revision: 1
};

test("patrol dashboard summary and visible requests reflect current work only", () => {
  const requests = [
    { ...baseRequest, requestId: "available", status: "available" as const },
    { ...baseRequest, requestId: "active", status: "inProgress" as const },
    { ...baseRequest, requestId: "unsent", status: "completedLocal" as const },
    { ...baseRequest, requestId: "accepted", status: "accepted" as const },
    { ...baseRequest, requestId: "completed", status: "completed" as const }
  ];

  assert.deepEqual(buildPatrolHomeSummary(requests), { available: 1, mine: 2, unsent: 1 });
  assert.deepEqual(
    selectVisiblePatrolRequests(requests, "accepted").map((request) => request.requestId),
    ["available"]
  );
});