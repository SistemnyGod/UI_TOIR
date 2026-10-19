import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../repositories/systemNotificationsRepository", () => ({ createSystemNotificationsRepository: () => ({ list: mocks.list }) }));
import { useSystemNotifications } from "../hooks/useSystemNotifications";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); mocks.list.mockReset(); });

it("stops polling in a hidden tab and refreshes when it becomes visible", async () => {
  vi.useFakeTimers(); let visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility as DocumentVisibilityState);
  mocks.list.mockResolvedValue([]);
  const hook = renderHook(() => useSystemNotifications({ dataSourceMode: "api", enabled: true, sessionKey: "a", showToast: vi.fn() }));
  await act(async () => {});
  expect(mocks.list).toHaveBeenCalledOnce();
  visibility = "hidden";
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(mocks.list).toHaveBeenCalledOnce();
  visibility = "visible";
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(mocks.list).toHaveBeenCalledTimes(2);
  hook.unmount();
});

it("clears the previous user's notifications while the next user loads", async () => {
  mocks.list.mockResolvedValueOnce([{ id: "previous" }]).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(({ sessionKey }) => useSystemNotifications({ dataSourceMode: "api", enabled: true, sessionKey, showToast: vi.fn() }), { initialProps: { sessionKey: "a" } });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  rerender({ sessionKey: "b" });
  expect(result.current.items).toEqual([]);
});
