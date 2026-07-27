import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/repositories/outboxRepository", () => ({
  getNextOutboxRetryAt: vi.fn()
}));

import { createOutboxRetryScheduler } from "@/sync/outboxRetryScheduler";

describe("outbox retry scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs sync when the SQLite retry deadline is reached and schedules the next read", async () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-27T10:00:00.000Z");
    const getNextRetryAt = vi
      .fn<(ownerUserId: string) => Promise<string | null>>()
      .mockResolvedValueOnce(new Date(now + 30_000).toISOString())
      .mockResolvedValueOnce(null);
    const runSync = vi.fn<() => Promise<void>>().mockResolvedValue();
    const scheduler = createOutboxRetryScheduler({
      getNextRetryAt,
      runSync,
      now: () => now
    });

    await scheduler.schedule("operator-1");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(runSync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(getNextRetryAt).toHaveBeenCalledTimes(2);
  });
});