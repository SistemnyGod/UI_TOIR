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
describe("outbox retry scheduler generations", () => {
  it("does not create a second timer when an older SQLite read finishes after a newer schedule", async () => {
    let resolveFirstRead: ((value: string | null) => void) | null = null;
    const getNextRetryAt = vi.fn<(ownerUserId: string) => Promise<string | null>>()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRead = resolve;
      }))
      .mockResolvedValueOnce("2026-07-27T10:01:00.000Z");
    const timers: { delayMs: number; callback: () => void }[] = [];
    const scheduler = createOutboxRetryScheduler({
      getNextRetryAt,
      runSync: vi.fn<() => Promise<void>>().mockResolvedValue(),
      now: () => Date.parse("2026-07-27T10:00:00.000Z"),
      setTimer: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: vi.fn()
    });

    const firstSchedule = scheduler.schedule("operator-1");
    await Promise.resolve();
    await scheduler.schedule("operator-1");
    resolveFirstRead?.("2026-07-27T10:02:00.000Z");
    await firstSchedule;

    expect(timers).toHaveLength(1);
    expect(timers[0]?.delayMs).toBe(60_000);
  });
});