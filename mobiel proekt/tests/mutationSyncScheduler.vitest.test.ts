import { describe, expect, it, vi } from "vitest";

import { createMutationSyncScheduler } from "@/sync/mutationSyncScheduler";

describe("mutation sync scheduler", () => {
  it("coalesces local mutations and schedules one follow-up pass", async () => {
    vi.useFakeTimers();
    try {
      let resolveFirst: (() => void) | undefined;
      let resolveSecond: (() => void) | undefined;
      const runSync = vi.fn()
        .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }))
        .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSecond = resolve; }));
      const scheduler = createMutationSyncScheduler(runSync);

      scheduler.request();
      scheduler.request();
      scheduler.request();
      await vi.advanceTimersByTimeAsync(0);
      expect(runSync).toHaveBeenCalledTimes(1);

      scheduler.request();
      resolveFirst?.();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(runSync).toHaveBeenCalledTimes(2);

      resolveSecond?.();
      await vi.runAllTimersAsync();
      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
