import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const list = vi.fn();

vi.mock("../repositories/systemNotificationsRepository", () => ({
  createSystemNotificationsRepository: () => ({ list }),
}));

import { useSystemNotifications } from "../hooks/useSystemNotifications";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.useFakeTimers();
});

it("keeps notification polling while hidden without overlapping requests", async () => {
  let resolveFirst: ((value: []) => void) | undefined;
  const first = new Promise<[]>(resolve => { resolveFirst = resolve; });
  list.mockReturnValueOnce(first).mockResolvedValue([]);

  const { unmount } = renderHook(() => useSystemNotifications({
    dataSourceMode: "api",
    enabled: true,
    sessionKey: "user-a",
    showToast: vi.fn(),
  }));

  expect(list).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(list).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveFirst?.([]);
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(list).toHaveBeenCalledTimes(2);

  unmount();
});

it("ignores an answer from the previous session", async () => {
  let resolveFirst: ((value: [{ id: string }]) => void) | undefined;
  const first = new Promise<[{ id: string }]>(resolve => { resolveFirst = resolve; });
  list.mockReturnValueOnce(first).mockResolvedValue([]);
  const showToast = vi.fn();

  const { result, rerender } = renderHook(
    ({ sessionKey }) => useSystemNotifications({
      dataSourceMode: "api",
      enabled: true,
      sessionKey,
      showToast,
    }),
    { initialProps: { sessionKey: "user-a" } },
  );

  rerender({ sessionKey: "user-b" });
  await act(async () => { await Promise.resolve(); });
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => {
    resolveFirst?.([{ id: "from-user-a" }]);
    await Promise.resolve();
  });

  expect(result.current.items).toEqual([]);
});
