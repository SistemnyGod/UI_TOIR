import { act, render, renderHook, cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePatrolRequestFeed } from "../hooks/usePatrolRequestFeed";
import { PatrolRequestHistory } from "../features/patrol/results/PatrolRequestHistory";
const { list, page } = vi.hoisted(() => ({ list: vi.fn(), page: vi.fn() }));
vi.mock("../repositories/patrolRequestsRepository", () => ({ createApiPatrolRequestsRepository: () => ({ getPatrolRequests: list, getPatrolRequestPage: page }) }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
afterEach(() => { cleanup(); list.mockReset(); page.mockReset(); vi.useRealTimers(); vi.restoreAllMocks(); document.documentElement.scrollTop = 0; });
it("keeps history stable while scrolling or typing, then resumes polling at the top", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  page.mockResolvedValue({ rows: [], hasMore: false });
  await act(async () => { render(<PatrolRequestHistory dataSourceMode="api" requests={[]} status="idle" />); });
  expect(page).toHaveBeenCalledOnce();
  document.documentElement.scrollTop = 100;
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(page).toHaveBeenCalledOnce();
  document.documentElement.scrollTop = 0;
  act(() => screen.getByRole("textbox", { name: "Поиск заявок" }).focus());
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(page).toHaveBeenCalledOnce();
  act(() => (document.activeElement as HTMLElement).blur());
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(page).toHaveBeenCalledTimes(2);
});
it("ignores an earlier response after explicit refresh and shares overlapping background refresh", async () => {
  const first = deferred<any[]>(), second = deferred<any[]>();
  list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const view = renderHook(() => usePatrolRequestFeed({ dataSourceMode: "api", sessionKey: "a" }));
  let refresh!: Promise<void>;
  act(() => { refresh = view.result.current.refresh(); });
  act(() => { void view.result.current.refresh({ silent: true }); });
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => { second.resolve([{ id: "fresh" }]); await refresh; });
  await act(async () => { first.resolve([{ id: "stale" }]); });
  expect(view.result.current.rows[0].id).toBe("fresh");
});
it("clears another owner's rows immediately and rejects that owner's late response", async () => {
  const old = deferred<any[]>(), next = deferred<any[]>();
  list.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const view = renderHook(({ owner }) => usePatrolRequestFeed({ dataSourceMode: "api", sessionKey: owner }), { initialProps: { owner: "a" } });
  view.rerender({ owner: "b" });
  await act(async () => { old.resolve([{ id: "private-a" }]); });
  expect(view.result.current.rows).toEqual([]);
  await act(async () => { next.resolve([{ id: "private-b" }]); });
  expect(view.result.current.rows[0].id).toBe("private-b");
});
it("keeps the table after a background failure and requests only the selected history page", async () => {
  page.mockResolvedValueOnce({ rows: [{ id: "row" }], hasMore: true }).mockRejectedValueOnce(new Error("offline"));
  const view = renderHook(() => usePatrolRequestFeed({ dataSourceMode: "api", page: 3, filters: { query: "route" } }));
  await act(async () => {});
  await act(async () => { await view.result.current.refresh({ silent: true }); });
  expect(list).not.toHaveBeenCalled();
  expect(page).toHaveBeenCalledWith({ query: "route" }, { page: 3, pageSize: 50 }, expect.any(Object));
  expect(view.result.current.rows[0].id).toBe("row");
  expect(view.result.current.error).toBe("offline");
  expect(view.result.current.status).toBe("ready");
});
