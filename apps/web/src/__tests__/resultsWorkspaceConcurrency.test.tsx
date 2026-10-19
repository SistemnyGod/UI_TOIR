import { useMemo } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useResultsWorkspace } from "../hooks/useResultsWorkspace";
import { getResultPointMeta, resultHasIssue } from "../features/patrol/results/resultPresentation";
import type { PatrolResult } from "../types";
import type { ResultPage } from "../repositories/resultsRepository";

const { getPage, getResult, getResults } = vi.hoisted(() => ({ getPage: vi.fn(), getResult: vi.fn(), getResults: vi.fn() }));
vi.mock("../repositories/resultsRepository", async (original) => ({
  ...(await original()), createApiResultsRepository: () => ({ getResultPage: getPage, getResult, getResults, exportResults: vi.fn() }),
}));
const noop = () => {};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const row = (id: string, patch: Partial<PatrolResult> = {}): PatrolResult => ({
  id, point: id, pointId: id, comment: "без комментария", photos: 0, status: "Подтверждено", issueType: "нет", chronology: [],
  employee: "Тест", employeeId: "test-employee", route: "Помол", territory: "Цех", shift: "День", plannedAt: "2026-10-09T08:00:00",
  actualAt: "2026-10-09T08:10:00", severity: "-", deviation: "0", ...patch,
});
const page = (id: string, patch: Partial<ResultPage> = {}): ResultPage => ({ results: [row(id)], page: 1, pageSize: 100, total: 1, totalPages: 1, hasMore: false, ...patch });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["response", "error"])("ignores a manual refresh's late %s after changing filters", async (outcome) => {
  const old = deferred<ResultPage>();
  getPage.mockResolvedValueOnce(page("initial")).mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("fresh"));
  const notify = vi.fn();
  const hook = renderHook(({ query }) => {
    const filters = useMemo(() => ({ query }), [query]);
    return useResultsWorkspace({ dataSourceMode: "api", selectedResultId: "", onSelectResult: noop, showToast: notify, filters });
  }, { initialProps: { query: "old" } });
  await waitFor(() => expect(hook.result.current.results[0]?.id).toBe("initial"));
  let manual!: Promise<void>; act(() => { manual = hook.result.current.refreshResults(); });
  hook.rerender({ query: "new" });
  await waitFor(() => expect(hook.result.current.results[0]?.id).toBe("fresh"));
  await act(async () => { outcome === "error" ? old.reject(new Error("late failure")) : old.resolve(page("stale")); await manual; });
  expect(hook.result.current.results[0].id).toBe("fresh");
  expect(hook.result.current.errorMessage).toBeUndefined();
  expect(notify).not.toHaveBeenCalled();
  expect(getPage.mock.calls[1][1].signal.aborted).toBe(true);
});

it("invalidates old pagination when refreshing the same filter and keeps the new pages reachable", async () => {
  const more = deferred<ResultPage>();
  getPage.mockResolvedValueOnce(page("first-before", { hasMore: true, total: 200, totalPages: 2 }))
    .mockReturnValueOnce(more.promise).mockResolvedValueOnce(page("first-after", { hasMore: true, total: 300, totalPages: 3 }))
    .mockResolvedValueOnce(page("second-after", { page: 2, hasMore: true, total: 300, totalPages: 3 }));
  const filters = {};
  const hook = renderHook(() => useResultsWorkspace({ dataSourceMode: "api", selectedResultId: "", onSelectResult: noop, showToast: noop, filters }));
  await waitFor(() => expect(hook.result.current.hasMoreResults).toBe(true));
  let load!: Promise<void>; act(() => { load = hook.result.current.loadMoreResults(); });
  await act(async () => { await hook.result.current.refreshResults(); });
  await act(async () => { more.resolve(page("second-before", { page: 2, hasMore: false, total: 200 })); await load; });
  expect(hook.result.current.results.map(x => x.id)).toEqual(["first-after"]);
  expect(hook.result.current.hasMoreResults).toBe(true);
  expect(hook.result.current.totalResults).toBe(300);
  await act(async () => { await hook.result.current.loadMoreResults(); });
  expect(getPage.mock.calls[3][1].page).toBe(2);
  expect(hook.result.current.results.map(x => x.id)).toEqual(["first-after", "second-after"]);
});

it("keeps an out-of-filter selection and its related points separate from the journal", async () => {
  const selectedId = "11111111-1111-4111-8111-111111111111";
  const selected = row(selectedId, { assignmentId: "assignment", point: "Старый поиск" });
  getResult.mockResolvedValue(selected); getResults.mockResolvedValue([selected, row("related")]);
  getPage.mockResolvedValueOnce(page("unused", { results: [selected] })).mockResolvedValueOnce(page("new-search"));
  const hook = renderHook(({ query }) => {
    const filters = useMemo(() => ({ query }), [query]);
    return useResultsWorkspace({ dataSourceMode: "api", selectedResultId: selectedId, onSelectResult: noop, showToast: noop, filters });
  }, { initialProps: { query: "old" } });
  await waitFor(() => expect(hook.result.current.results.map(x => x.id)).toEqual([selectedId]));
  hook.rerender({ query: "new" });
  await waitFor(() => expect(hook.result.current.selectedResults).toHaveLength(2));
  expect(hook.result.current.results.map(x => x.id)).toEqual(["new-search"]);
  expect(hook.result.current.totalResults).toBe(1);
  expect(hook.result.current.selectedResult?.id).toBe(selectedId);
});

it("hides the previous owner's rows immediately and rejects its late response", async () => {
  const old = deferred<ResultPage>(); const fresh = deferred<ResultPage>();
  getPage.mockResolvedValueOnce(page("owner-a")).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const hook = renderHook(({ sessionKey }) => useResultsWorkspace({ dataSourceMode: "api", sessionKey, selectedResultId: "", onSelectResult: noop, showToast: noop }), { initialProps: { sessionKey: "a" } });
  await waitFor(() => expect(hook.result.current.results[0]?.id).toBe("owner-a"));
  let pending!: Promise<void>; act(() => { pending = hook.result.current.refreshResults(); });
  hook.rerender({ sessionKey: "b" });
  expect(hook.result.current.results).toEqual([]);
  await act(async () => { old.resolve(page("stale-owner")); await pending; });
  expect(hook.result.current.results).toEqual([]);
  await act(async () => { fresh.resolve(page("owner-b")); await fresh.promise; });
  expect(hook.result.current.results[0].id).toBe("owner-b");
});

it("keeps the opened report's snapshot while refreshing a list that no longer includes it", async () => {
  const selectedId = "11111111-1111-4111-8111-111111111111";
  const selected = row(selectedId, { assignmentId: "assignment" });
  const related = deferred<PatrolResult[]>();
  getResult.mockResolvedValue(selected); getResults.mockReturnValue(related.promise);
  getPage.mockResolvedValueOnce(page("unused", { results: [selected, row("same-patrol", { assignmentId: "assignment" })] }))
    .mockResolvedValueOnce(page("other-patrol"));
  const hook = renderHook(() => useResultsWorkspace({ dataSourceMode: "api", selectedResultId: selectedId, onSelectResult: noop, showToast: noop }));
  await waitFor(() => expect(hook.result.current.selectedResults).toHaveLength(2));
  await act(async () => { await hook.result.current.refreshResults(); });
  expect(hook.result.current.results.map(x => x.id)).toEqual(["other-patrol"]);
  expect(hook.result.current.selectedResults.map(x => x.id)).toEqual([selectedId, "same-patrol"]);
  await act(async () => { related.resolve([selected]); await related.promise; });
});

it("does not infer defect or unavailable status from prose in a comment", () => {
  expect(resultHasIssue(row("ok", { comment: "Неисправностей не обнаружено. Оборудование исправно." }))).toBe(false);
  expect(getResultPointMeta(row("issue", { status: "Замечание", issueType: "Повреждено крепление", comment: "Неисправно. Запасной ключ недоступен." })).key).toBe("issue");
  expect(getResultPointMeta(row("skip", { status: "skipped", comment: "Замечаний нет" })).key).toBe("unavailable");
});
