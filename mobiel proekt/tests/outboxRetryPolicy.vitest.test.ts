import { describe, expect, it } from "vitest";

import { filterReadyOutboxCommands } from "@/sync/outboxRetryPolicy";

describe("outbox retry schedule", () => {
  it("does not return retryLater before next_attempt_at and returns it after the time has passed", () => {
    const now = "2026-07-25T10:00:00.000Z";
    const futureCommand = {
      clientOperationId: "operation-1",
      status: "retryLater",
      nextAttemptAt: "2026-07-25T10:00:30.000Z"
    };

    expect(filterReadyOutboxCommands([futureCommand], now)).toEqual([]);
    expect(filterReadyOutboxCommands([
      { ...futureCommand, nextAttemptAt: "2026-07-25T09:59:59.000Z" }
    ], now)).toEqual([
      { ...futureCommand, nextAttemptAt: "2026-07-25T09:59:59.000Z" }
    ]);
  });
});