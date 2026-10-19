import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patrolResultsFallback } from "../repositories/resultsRepository";
import type { ResultPage } from "../repositories/resultsRepository";
import type { ActivePatrol, PatrolResult, ServiceRequest } from "../types";
import { buildDashboardPlan, buildDashboardSummary, dashboardRange, isDashboardPatrolInProgress } from "../features/dashboard/dashboardSummary";
import { loadDashboardResults } from "../features/dashboard/dashboardResultsLoader";
import { DashboardView, type DashboardViewProps } from "../features/dashboard/DashboardScreen";
import { useDashboardOverview } from "../features/dashboard/useDashboardOverview";
import { AssignmentScreen } from "../features/patrol/AssignmentScreen";
import { ResultsWorkspace } from "../features/patrol/results/ResultsWorkspace";
import { dashboardPreviewNow, dashboardPreviewResults } from "../../ui-preview/dashboardData";

const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock("../repositories/resultsRepository", async (importOriginal) => ({ ...await importOriginal<typeof import("../repositories/resultsRepository")>(), createApiResultsRepository: () => ({ getResultPage: readPage }) }));
const now = new Date(2026, 9, 2, 10, 24);
function result(id: string, patch: Partial<PatrolResult> = {}): PatrolResult {
  return { ...patrolResultsFallback[0], id, assignmentId: `assignment-${id}`, pointId: "point-a", point: "К-10", routeId: "route-a", route: "Помол", employee: "Хорьков Семен Николаевич", status: "Подтверждено", issueType: "нет", comment: "без комментария", actualAt: "02.10.2026, 10:00", ...patch };
}
function page(results: PatrolResult[], number = 1, more = false): ResultPage {
  return { results, page: number, pageSize: 100, total: more || number > 1 ? 2 : 1, totalPages: more || number > 1 ? 2 : 1, hasMore: more };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  } });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); readPage.mockReset(); });

describe("dashboard period aggregation", () => {
  it("keeps synthetic week and partial-month counts consistent with full patrol records", () => {
    const week = buildDashboardSummary(dashboardPreviewResults, dashboardRange("week", dashboardPreviewNow));
    const month = buildDashboardSummary(dashboardPreviewResults, dashboardRange("month", dashboardPreviewNow));
    expect(week.completed).toBe(64);
    expect(week.withIssues).toBe(14);
    expect(week.problemPoints.map((point) => point.count)).toEqual([8, 5, 3, 2, 1]);
    expect(month.completed).toBe(22);
    expect(month.withIssues).toBe(5);
    expect(month.problemPoints.reduce((sum, point) => sum + point.count, 0)).toBe(7);
    expect(week.latestReports[0].results.length).toBeGreaterThan(1);
  });
  it("uses a calendar week/month and excludes future recordings and duplicates", () => {
    const range = dashboardRange("week", now);
    expect(range.dateFrom).toBe("2026-09-28");
    expect(range.dateTo).toBe("2026-10-02");
    expect(range.end.getDate()).toBe(4);
    expect(dashboardRange("month", now).dateFrom).toBe("2026-10-01");
    const issue = result("issue", { status: "Замечание", issueType: "Неисправность" });
    const summary = buildDashboardSummary([result("ok", { assignmentId: issue.assignmentId }), issue, issue, result("old", { actualAt: "27.09.2026, 23:59" }), result("future", { actualAt: "02.10.2026, 10:25" }), result("next", { actualAt: "03.10.2026, 07:00" })], range);
    expect(summary.completed).toBe(1);
    expect(summary.withIssues).toBe(1);
    expect(summary.problemPoints[0].count).toBe(1);
    expect(summary.problemPoints[0].results).toHaveLength(2);
  });
  it("does not merge equal point names with distinct IDs/routes and ranks by issue frequency", () => {
    const summary = buildDashboardSummary([
      result("a", { status: "Замечание" }), result("b", { status: "Замечание" }),
      result("c", { pointId: "other-id", status: "Замечание" }),
      result("d", { pointId: "", routeId: "legacy-a", status: "Замечание" }),
      result("e", { pointId: "", routeId: "legacy-b", status: "Замечание" }),
    ], dashboardRange("week", now));
    expect(summary.problemPoints).toHaveLength(4);
    expect(summary.problemPoints[0]).toMatchObject({ key: "point:point-a", count: 2 });
    expect(summary.latestReports).toHaveLength(3);
  });
  it("keeps a report's issue status when its latest point is healthy", () => {
    const summary = buildDashboardSummary([result("issue", { assignmentId: "one", status: "Замечание" }), result("healthy", { assignmentId: "one", pointId: "b", actualAt: "02.10.2026, 10:10" })], dashboardRange("week", now));
    expect(summary.latestReports[0]).toMatchObject({ latest: { id: "healthy" }, hasIssue: true });
  });
  it("builds today's open plan in time order, deduplicates request/assignment and counts only started patrols", () => {
    const request = { id: "r", status: "Назначена", scheduledDate: "2026-10-02", scheduledTime: "11:00", route: "Помол", employee: "Сотрудник" } as ServiceRequest;
    const patrol = { id: "p", patrolRequestId: "r", status: "Запланирован", plannedAt: "02.10.2026, 11:00" } as ActivePatrol;
    expect(buildDashboardPlan([request, { ...request, id: "cancel", status: "Отменена" }, { ...request, id: "closed", status: "Закрыта" }, { ...request, id: "tomorrow", scheduledDate: "2026-10-03" }], [patrol], now)).toHaveLength(1);
    expect(isDashboardPatrolInProgress(patrol)).toBe(false);
    expect(isDashboardPatrolInProgress({ ...patrol, status: "Нет связи" })).toBe(true);
  });
  it("keeps the complete today count and distinguishes missing names from missing assignments", () => {
    const base = { status: "Назначена", scheduledDate: "2026-10-02", route: "Помол", employee: "" } as ServiceRequest;
    const plan = buildDashboardPlan([
      { ...base, id: "4", scheduledTime: "14:00" },
      { ...base, id: "2", scheduledTime: "12:00", employeeId: "known-employee" },
      { ...base, id: "3", scheduledTime: "13:00" },
      { ...base, id: "1", scheduledTime: "11:00", employee: "  " },
    ], [], now);
    expect(plan.map((item) => item.requestId)).toEqual(["1", "2", "3", "4"]);
    expect(plan[0]).toMatchObject({ assigned: false, employee: "Не назначен" });
    expect(plan[1]).toMatchObject({ assigned: true, employee: "Сотрудник не указан", status: "Назначена" });
  });
});

describe("complete dashboard loading", () => {
  it("loads all pages with identical date filters and deduplicates overlapping rows", async () => {
    const reader = vi.fn().mockResolvedValueOnce(page([result("a")], 1, true)).mockResolvedValueOnce(page([result("a"), result("b")], 2));
    const filters = { dateFrom: "2026-09-28", dateTo: "2026-10-02" };
    expect((await loadDashboardResults(reader, filters, new AbortController().signal)).map((r) => r.id)).toEqual(["a", "b"]);
    expect(reader).toHaveBeenNthCalledWith(2, filters, expect.objectContaining({ page: 2 }));
  });
  it("rejects incomplete or changing pagination rather than presenting a partial ranking", async () => {
    const reader = vi.fn().mockResolvedValueOnce(page([result("a")], 1, true)).mockResolvedValueOnce({ ...page([result("b")], 2), total: 3 });
    await expect(loadDashboardResults(reader, {}, new AbortController().signal)).rejects.toThrow("изменился");
    reader.mockReset().mockResolvedValue({ ...page([result("a")]), totalPages: 2 });
    await expect(loadDashboardResults(reader, {}, new AbortController().signal)).rejects.toThrow("неполный");
  });
  it("discards an obsolete week response after switching to month", async () => {
    const old = deferred<ResultPage>();
    readPage.mockReturnValueOnce(old.promise).mockResolvedValue(page([result("month")]));
    const { result: hook, rerender } = renderHook(({ period }) => useDashboardOverview({ dataSourceMode: "api", ownerId: "user", period }), { initialProps: { period: "week" as "week" | "month" } });
    rerender({ period: "month" });
    await waitFor(() => expect(hook.current.results?.[0].id).toBe("month"));
    await act(async () => { old.resolve(page([result("old-week")])); await old.promise; });
    expect(hook.current.results?.[0].id).toBe("month");
  });
  it("retains the complete cached summary after a refresh fails and merges concurrent refreshes", async () => {
    readPage.mockResolvedValueOnce(page([result("cached")]));
    const { result: hook } = renderHook(() => useDashboardOverview({ dataSourceMode: "api", period: "week" }));
    await waitFor(() => expect(hook.current.results?.[0].id).toBe("cached"));
    const next = deferred<ResultPage>();
    readPage.mockReturnValueOnce(next.promise).mockRejectedValueOnce(new Error("second page failed"));
    let refresh!: Promise<void>;
    act(() => { refresh = hook.current.refresh(); void hook.current.refresh(); });
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(hook.current.results?.[0].id).toBe("cached");
    await act(async () => { next.resolve(page([result("partial")], 1, true)); await refresh; });
    expect(hook.current.error).toBe("second page failed");
    expect(hook.current.results?.[0].id).toBe("cached");
  });
  it("does not fetch without result access and clears data when the owner changes", async () => {
    readPage.mockResolvedValueOnce(page([result("owner-a")]));
    const { result: hook, rerender } = renderHook(({ ownerId, enabled }) => useDashboardOverview({ dataSourceMode: "api", ownerId, enabled, period: "week" }), { initialProps: { ownerId: "a", enabled: false } });
    expect(readPage).not.toHaveBeenCalled();
    rerender({ ownerId: "a", enabled: true });
    await waitFor(() => expect(hook.current.results?.[0].id).toBe("owner-a"));
    const pending = deferred<ResultPage>();
    readPage.mockReturnValue(pending.promise);
    rerender({ ownerId: "b", enabled: true });
    expect(hook.current.results).toBeUndefined();
  });
});

describe("dashboard actions and states", () => {
  it("consumes a quick assignment intent so ordinary reentry does not reopen the form", async () => {
    const handled = vi.fn();
    const callbacks = { activePatrols: [], employeeDirectory: [], routeDirectory: [], requests: [], selectedEmployeeId: "", selectedRouteId: "", requestListStatus: "ready" as const, dataSourceMode: "mock" as const, refreshPatrolData: vi.fn().mockResolvedValue(undefined), onOpenRequestById: vi.fn(), onRefreshRequests: vi.fn(), onNavigate: vi.fn(), onNotify: vi.fn(), onCreatePatrolRequest: vi.fn(), onSelectEmployee: vi.fn(), onSelectRoute: vi.fn(), onAssignmentCreateIntentHandled: handled };
    const view = render(<AssignmentScreen {...callbacks} assignmentCreateIntent={1} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    expect(handled).toHaveBeenCalledOnce();
    view.rerender(<AssignmentScreen {...callbacks} assignmentCreateIntent={0} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Отмена" }));
    view.unmount();
    render(<AssignmentScreen {...callbacks} assignmentCreateIntent={0} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  function props(patch: Partial<DashboardViewProps> = {}): DashboardViewProps {
    const range = dashboardRange("week", now);
    return { dataSourceMode: "mock", requests: [], requestListStatus: "ready", selectedResultId: "", period: "week", range, summary: buildDashboardSummary([result("issue", { status: "Замечание" })], range), hasResults: true, resultsLoading: false, onPeriodChange: vi.fn(), onCreateRequest: vi.fn(), onNavigate: vi.fn(), onNotify: vi.fn(), onOpenResult: vi.fn(), onOpenRequestById: vi.fn(), onRetryRequests: vi.fn(), onSelectResult: vi.fn(), onRefreshResults: vi.fn().mockResolvedValue(undefined), ...patch };
  }
  it("opens the latest affected report via the shared results flow", () => {
    const callbacks = props(); render(<DashboardView {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Результаты точки К-10" }));
    expect(callbacks.onOpenResult).toHaveBeenCalledWith("issue");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("focuses the requested point in the same report dialog used by Results", async () => {
    const affected = result("affected", { assignmentId: "report", point: "К-10", status: "Замечание", issueType: "Неисправность" });
    const healthy = result("healthy", { assignmentId: "report", pointId: "other", point: "Галерея 2", actualAt: "02.10.2026, 10:01" });
    render(<ResultsWorkspace dataSourceMode="mock" mockResults={[affected, healthy]} selectedResultId="affected" openResultId="affected" onSelectResult={vi.fn()} onOpenResultHandled={vi.fn()} />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Обход «Помол»")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /К-10/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("heading", { name: "К-10" })).toBeVisible();
  });
  it("routes navigation and quick assignment independently of a selected report", () => {
    const quick = vi.fn(); const callbacks = props({ onQuickAssign: quick, selectedResultId: "unrelated" });
    render(<DashboardView {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Быстрое назначение" }));
    expect(quick).toHaveBeenCalledOnce(); expect(callbacks.onCreateRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Все результаты" }));
    expect(callbacks.onNavigate).toHaveBeenCalledWith("results");
    fireEvent.click(screen.getByRole("button", { name: "Открыть плановый обход" }));
    expect(callbacks.onNavigate).toHaveBeenCalledWith("schedule");
  });
  it("opens the clicked plan request", () => {
    const callbacks = props({ requests: [{ id: "plan", status: "Назначена", route: "Помол", scheduledDate: "2026-10-02", scheduledTime: "12:00", employee: "" } as ServiceRequest] });
    render(<DashboardView {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть план: Помол, 12:00" }));
    expect(callbacks.onOpenRequestById).toHaveBeenCalledWith("plan");
  });
  it("shows three plan rows with the full count and a real issue percentage", () => {
    const requests = Array.from({ length: 5 }, (_, index) => ({ id: `plan-${index}`, status: "Назначена", route: "Помол", scheduledDate: "2026-10-02", scheduledTime: `${11 + index}:00`, employee: "" } as ServiceRequest));
    const range = dashboardRange("month", dashboardPreviewNow);
    render(<DashboardView {...props({ requests, period: "month", range, summary: buildDashboardSummary(dashboardPreviewResults, range) })} />);
    expect(screen.getByText(/показаны 3 из 5/)).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^Открыть план:/ })).toHaveLength(3);
    expect(screen.getAllByText("Не назначен")).toHaveLength(3);
    expect(screen.getByText("23% от завершённых")).toBeVisible();
  });
  it("hides actions without permission and distinguishes missing data from zero", () => {
    render(<DashboardView {...props({ canCreateRequest: false, canViewResults: false, canViewSchedule: false, hasResults: false })} />);
    expect(screen.queryByRole("button", { name: "Быстрое назначение" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Все результаты" })).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
  it("keeps cached table rows during background refresh or error and sends a period change", () => {
    const callbacks = props({ resultsLoading: true, resultsError: "Нет связи" }); render(<DashboardView {...callbacks} />);
    expect(screen.getByRole("button", { name: "Результаты точки К-10" })).toBeEnabled();
    expect(screen.getByText(/Показаны ранее загруженные результаты/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Месяц" }));
    expect(callbacks.onPeriodChange).toHaveBeenCalledWith("month");
  });
});
