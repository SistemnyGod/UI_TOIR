import { describe, expect, it } from "vitest";

import { getPointResultSyncUpdate } from "@/domain/patrol/pointResultSyncPolicy";

describe("синхронизация результата точки", () => {
  it("markPatrolPointOk accepted переводит point_results в synced", () => {
    expect(getPointResultSyncUpdate(
      "markPatrolPointOk",
      "accepted",
      14,
      "operation-1",
      "2026-07-25T20:00:00.000Z"
    )).toEqual({
      syncStatus: "synced",
      serverRevision: 14,
      acceptedOperationId: "operation-1",
      lastSyncedAt: "2026-07-25T20:00:00.000Z"
    });
  });
});