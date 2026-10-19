import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RequestCreateModal } from "../features/patrol/components/requests/RequestCreateModal";
import { RequestModals } from "../features/patrol/components/requests/RequestModals";
import { useEmuWorkspace } from "../hooks/useEmuWorkspace";
import { workAccountingSettings, workAccountingSessions } from "../../e2e/fixtures/workAccounting";
const repo = vi.hoisted(() => ({ getSettings: vi.fn(), getDashboard: vi.fn(), getWorkSessions: vi.fn(), getShiftRemarks: vi.fn(), getPlanTasks: vi.fn(), getDecisions: vi.fn(), getWorkSessionChanges: vi.fn(), getPlanTaskChanges: vi.fn(), resolveDecision: vi.fn(), updateEmployeeShift: vi.fn(), createSection: vi.fn(), updateSection: vi.fn(), createWaitReason: vi.fn(), updateWaitReason: vi.fn(), createNotCompletedReason: vi.fn(), updateNotCompletedReason: vi.fn(), createWorkTemplate: vi.fn(), updateWorkTemplate: vi.fn(), addFavoriteEmployee: vi.fn(), removeFavoriteEmployee: vi.fn(), createWorkSession: vi.fn(), createPlanTask: vi.fn(), updatePlanTask: vi.fn(), reschedulePlanTask: vi.fn(), approvePlanTask: vi.fn(), approveWeek: vi.fn() }));
vi.mock("../repositories/emuRepository", () => ({ createEmuRepository: () => repo }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  repo.getSettings.mockResolvedValue(workAccountingSettings);
  repo.getDashboard.mockResolvedValue({ metrics: [], recentEvents: [] });
  repo.getWorkSessions.mockResolvedValue({ rows: [{ ...workAccountingSessions[0], completedAt: null }], total: 1, pageCount: 1, pageSize: 500, page: 1 });
  repo.getShiftRemarks.mockResolvedValue({ rows: [], total: 0 });
  repo.getPlanTasks.mockResolvedValue({ rows: [], total: 0 });
  repo.getDecisions.mockResolvedValue([]);
});
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
const employeeOptions = [{ id: "emp", fullName: "Test Employee", shift: "Day", position: "Test" }] as any;
const routeOptions = [{ id: "route", name: "Test Route", points: [] }] as any;
const currentUser = { id: "alice", login: "alice", displayName: "Alice", roles: ["admin"], permissions: [] };
it("retains an accepted decision when refreshing decisions fails", async () => {
  const decision = { id: "decision-1", rowVersion: 7 }; repo.getDecisions.mockResolvedValue([decision]); repo.resolveDecision.mockResolvedValue({ ...decision, rowVersion: 8, status: "resolved" });
  const { result } = renderHook(() => useEmuWorkspace({ currentUser, dataSourceMode: "api", employeeDirectory: [] })); await waitFor(() => expect(result.current.loading).toBe(false)); repo.getDecisions.mockRejectedValueOnce(new Error("Refresh failed"));
  await act(async () => { const saved = await result.current.actions.resolveDecision(decision.id, { resolution: "fixed_manually", comment: "Проверено", rowVersion: 7 }); expect(saved.rowVersion).toBe(8); });
  expect(result.current.decisions).toEqual([]); expect(result.current.error).toContain("Решение сохранено"); expect(repo.resolveDecision).toHaveBeenCalledOnce();
});
it("does not let an old owner's accepted decision refresh the next owner's decisions", async () => {
  const gate = deferred<any>(); repo.resolveDecision.mockReturnValue(gate.promise);
  const { result, rerender } = renderHook(({ user }) => useEmuWorkspace({ currentUser: user, dataSourceMode: "api", employeeDirectory: [] }), { initialProps: { user: currentUser } }); await waitFor(() => expect(result.current.loading).toBe(false));
  let pending!: ReturnType<typeof result.current.actions.resolveDecision>; act(() => { pending = result.current.actions.resolveDecision("old", { resolution: "fixed_manually", comment: "Проверено", rowVersion: 7 }); });
  rerender({ user: { ...currentUser, id: "bob" } }); await waitFor(() => expect(result.current.loading).toBe(false)); const reads = repo.getDecisions.mock.calls.length;
  await act(async () => { gate.resolve({ id: "old", rowVersion: 8 }); await pending; }); expect(repo.getDecisions).toHaveBeenCalledTimes(reads); expect(result.current.decisions).toEqual([]);
});
function fillTime() { fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: "09:00" } }); }
it.each(["createSection", "updateSection", "createWaitReason", "updateWaitReason", "createNotCompletedReason", "updateNotCompletedReason", "createWorkTemplate", "updateWorkTemplate", "addFavoriteEmployee", "removeFavoriteEmployee", "createWorkSession", "createPlanTask", "updatePlanTask", "reschedulePlanTask", "approvePlanTask", "approveWeek"] as const)("does not reload another owner's settings after %s", async method => {
  const gate = deferred<any>(); repo[method].mockReturnValue(gate.promise);
  const { result, rerender } = renderHook(({ user }) => useEmuWorkspace({ currentUser: user, dataSourceMode: "api", employeeDirectory: [] }), { initialProps: { user: currentUser } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let pending!: Promise<unknown>;
  act(() => { const action = result.current.actions[method] as (...args: any[]) => Promise<unknown>; pending = action("old-id", { name: "Old owner" }); });
  rerender({ user: { ...currentUser, id: "bob" } }); await waitFor(() => expect(result.current.loading).toBe(false));
  const reads = repo.getSettings.mock.calls.length;
  await act(async () => { gate.resolve({ id: "old-id" }); await pending; });
  expect(repo.getSettings).toHaveBeenCalledTimes(reads);
});
it("requires start time before submitting", async () => {
  const submit = vi.fn();
  render(<RequestCreateModal employeeOptions={employeeOptions} routeOptions={routeOptions} onClose={() => {}} onDirtyChange={() => {}} onSubmitCreate={submit} />);
  fireEvent.submit(document.querySelector("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Укажите дату и время");
  expect(submit).not.toHaveBeenCalled();
});
it("prevents duplicate submits and closing while the POST is pending", async () => {
  const pending = deferred<void>(); const submit = vi.fn(() => pending.promise); const close = vi.fn();
  render(<RequestModals modal={{ kind: "create" }} employeeOptions={employeeOptions} routeOptions={routeOptions} onClose={close} onCreateRelated={() => {}} onSubmitCreate={submit} />);
  fillTime();
  fireEvent.change(screen.getByRole("textbox", { name: "Комментарий к заявке" }), { target: { value: "Keep my input" } });
  fireEvent.submit(document.querySelector("form")!); fireEvent.submit(document.querySelector("form")!);
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(submit).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Отправляем…" })).toBeDisabled();
  await act(async () => { pending.reject(new Error("Connection lost")); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByRole("textbox", { name: "Комментарий к заявке" })).toHaveValue("Keep my input");
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(screen.getByRole("button", { name: "Закрыть без сохранения" })).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
});
it("uses the same operation ID when retrying unchanged input after a lost response", async () => {
  const submit = vi.fn().mockRejectedValueOnce(new Error("Response lost")).mockResolvedValue(undefined);
  render(<RequestCreateModal employeeOptions={employeeOptions} routeOptions={routeOptions} onClose={() => {}} onDirtyChange={() => {}} onSubmitCreate={submit} />);
  fillTime(); fireEvent.submit(document.querySelector("form")!);
  await screen.findByRole("alert"); fireEvent.submit(document.querySelector("form")!);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[0][0].clientRequestId).toBeTruthy();
  expect(submit.mock.calls[1][0].clientRequestId).toBe(submit.mock.calls[0][0].clientRequestId);
});
it("loads the work board without fetching historical pages", async () => {
  repo.getWorkSessions.mockImplementation((params) => Promise.resolve(params.boardOnly
    ? { rows: [workAccountingSessions[0]], total: 1, pageCount: 1 }
    : { rows: Array(500).fill(workAccountingSessions[0]), total: 100000, pageCount: 200 }));
  const { result } = renderHook(() => useEmuWorkspace({ currentUser, dataSourceMode: "api", employeeDirectory: [] }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.workSessions.rows).toHaveLength(1);
  expect(repo.getWorkSessions).toHaveBeenCalledTimes(1);
  expect(repo.getWorkSessions).toHaveBeenCalledWith({ boardOnly: true, page: 1, pageSize: 500 });
});
it("coalesces refreshes and never replaces a newer row with an older version", async () => {
  const { result } = renderHook(() => useEmuWorkspace({ currentUser, dataSourceMode: "api", employeeDirectory: [] }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const pending = deferred<any>(); repo.getWorkSessionChanges.mockReturnValueOnce(pending.promise);
  let first!: Promise<void>; let second!: Promise<void>;
  act(() => { first = result.current.refreshWorkBoard(); second = result.current.refreshWorkBoard(); });
  expect(first).toBe(second); expect(repo.getWorkSessionChanges).toHaveBeenCalledTimes(1);
  const row = { ...workAccountingSessions[0], completedAt: null, taskDescription: "New", rowVersion: 30 };
  await act(async () => { pending.resolve({ serverTime: "2030-01-01T10:00:00Z", changedSessions: [row], deletedSessionIds: [] }); await first; });
  repo.getWorkSessionChanges.mockResolvedValue({ serverTime: "2030-01-01T10:01:00Z", changedSessions: [{ ...row, rowVersion: 2, taskDescription: "Old" }], deletedSessionIds: [] });
  await act(async () => { await result.current.refreshWorkBoard(); });
  expect(result.current.workSessions.rows[0].taskDescription).toBe("New");
  repo.getWorkSessionChanges.mockResolvedValue({ serverTime: "2029-01-01T10:00:00Z", changedSessions: [], deletedSessionIds: [row.id] });
  await act(async () => { await result.current.refreshWorkBoard(); });
  expect(result.current.workSessions.rows).toHaveLength(1);
  await act(async () => { await result.current.refreshWorkBoard(); });
  expect(repo.getWorkSessionChanges).toHaveBeenLastCalledWith("2030-01-01T10:01:00Z");
});
it("discards a delta after a full reload, including its deletion list", async () => {
  const { result } = renderHook(() => useEmuWorkspace({ currentUser, dataSourceMode: "api", employeeDirectory: [] }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const pending = deferred<any>(); repo.getWorkSessionChanges.mockReturnValueOnce(pending.promise);
  let flight!: Promise<void>; act(() => { flight = result.current.refreshWorkBoard(); });
  await act(async () => { await result.current.reload(); });
  await waitFor(() => expect(repo.getWorkSessions).toHaveBeenCalledTimes(2));
  await act(async () => { pending.resolve({ serverTime: "2030-01-01", changedSessions: [], deletedSessionIds: [workAccountingSessions[0].id] }); await flight; });
  expect(result.current.workSessions.rows).toHaveLength(1);
});
it("clears previous-owner data and ignores their late response", async () => {
  const { result, rerender } = renderHook(({ user }) => useEmuWorkspace({ currentUser: user, dataSourceMode: "api", employeeDirectory: [] }), { initialProps: { user: currentUser } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const pending = deferred<any>(); repo.getWorkSessionChanges.mockReturnValueOnce(pending.promise);
  let flight!: Promise<void>; act(() => { flight = result.current.refreshWorkBoard(); });
  repo.getWorkSessions.mockResolvedValue({ rows: [], total: 0, pageCount: 1 });
  rerender({ user: { ...currentUser, id: "bob" } });
  expect(result.current.workSessions.rows).toEqual([]);
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { pending.resolve({ serverTime: "2030-01-01", changedSessions: [workAccountingSessions[0]], deletedSessionIds: [] }); await flight; });
  expect(result.current.workSessions.rows).toEqual([]);
});

it("uses server time rather than an incorrect browser clock as the delta cursor", async () => {
  repo.getWorkSessions.mockResolvedValue({ rows: [], total: 0, pageCount: 1, serverTime: "2026-01-01T00:00:00Z" });
  repo.getWorkSessionChanges.mockResolvedValue({ serverTime: "2026-01-01T00:01:00Z", changedSessions: [], deletedSessionIds: [] });
  const { result } = renderHook(() => useEmuWorkspace({ currentUser, dataSourceMode: "api", employeeDirectory: [] }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.refreshWorkBoard(); });
  expect(repo.getWorkSessionChanges).toHaveBeenCalledWith("2026-01-01T00:00:00Z");
});

it("coalesces plan refreshes and ignores responses after the owner changes", async () => {
  const { result, rerender } = renderHook(({ user }) => useEmuWorkspace({ currentUser: user, dataSourceMode: "api", employeeDirectory: [] }), { initialProps: { user: currentUser } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const pending = deferred<any>(); repo.getPlanTaskChanges.mockReturnValueOnce(pending.promise);
  let first!: Promise<void>; let second!: Promise<void>;
  act(() => { first = result.current.refreshPlanBoard(); second = result.current.refreshPlanBoard(); });
  expect(first).toBe(second); expect(repo.getPlanTaskChanges).toHaveBeenCalledTimes(1);
  rerender({ user: { ...currentUser, id: "bob" } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { pending.resolve({ serverTime: "2030-01-01", changedTasks: [{ id: "old-owner", rowVersion: 10 }], deletedTaskIds: [] }); await first; });
  expect(result.current.planTasks).toEqual([]);
});

it("sends the opened plan revision instead of the workspace's newer revision", async () => {
  const task = { id: "plan", rowVersion: 19 };
  repo.getPlanTasks.mockResolvedValue({ rows: [task], total: 1 });
  repo.approvePlanTask.mockResolvedValue({ ...task, rowVersion: 20 });
  const { result } = renderHook(() => useEmuWorkspace({ currentUser, dataSourceMode: "api", employeeDirectory: [] }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.actions.approvePlanTask(task.id, false, "Мой комментарий", 7); });
  expect(repo.approvePlanTask).toHaveBeenCalledWith(task.id, { approved: false, comment: "Мой комментарий", rowVersion: 7 });
});
