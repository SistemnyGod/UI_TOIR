import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssignmentsWorkspace } from "../hooks/useAssignmentsWorkspace";
import { AssignmentScreen } from "../features/patrol/AssignmentScreen";
import type { ActivePatrol, CreateAssignmentPayload, EmployeeDirectoryItem, RouteDirectoryItem, ServiceRequest } from "../types";

const repo = vi.hoisted(() => ({ getAssignments: vi.fn(), getEmployees: vi.fn(), getRoutes: vi.fn(), getSettings: vi.fn(), updateSettings: vi.fn(), createAssignment: vi.fn(), startAssignment: vi.fn(), completeAssignment: vi.fn(), cancelAssignment: vi.fn() }));
vi.mock("../repositories/assignmentsRepository", async importOriginal => ({ ...await importOriginal<object>(), createApiAssignmentsRepository: () => repo }));
const initial = { id: "a1", employee: "Иванов", employeeId: "e1", routeId: "r1", route: "Маршрут", status: "В пути", progress: 10 } as ActivePatrol;
const settings = { favoriteEmployeeIds: ["e1"], shiftSettings: { dayStart: "06:00", dayEnd: "14:00", nightStart: "22:00", nightEnd: "06:00" } };
const payload = { employeeId: "e1", employeeName: "Иванов", routeId: "r1", routeName: "Маршрут", priority: "high", plannedAt: "2026-10-16T10:00:00Z", shift: "День", notifyEmployee: true, notificationText: "", comment: "" } as CreateAssignmentPayload;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.getAssignments.mockResolvedValue([initial]); repo.getEmployees.mockResolvedValue([]); repo.getRoutes.mockResolvedValue([]); repo.getSettings.mockResolvedValue(settings);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("assignment data ownership", () => {
  it("retains existing rows after a failed refresh", async () => {
    const view = renderHook(() => useAssignmentsWorkspace({ dataSourceMode: "api", refreshPatrolData: vi.fn(), showToast: vi.fn() }));
    await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    repo.getAssignments.mockRejectedValueOnce(new Error("Нет связи"));
    await act(async () => { await view.result.current.refreshAssignments(); });
    expect(view.result.current.activePatrols).toEqual([initial]);
    expect(view.result.current.errorMessage).toBe("Нет связи");
  });
  it("coalesces silent updates and ignores a superseded response", async () => {
    const view = renderHook(() => useAssignmentsWorkspace({ dataSourceMode: "api", refreshPatrolData: vi.fn(), showToast: vi.fn() }));
    await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    const old = deferred<ActivePatrol[]>(); repo.getAssignments.mockReturnValueOnce(old.promise);
    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = view.result.current.refreshAssignments({ silent: true }); second = view.result.current.refreshAssignments({ silent: true }); });
    expect(first).toBe(second);
    expect(repo.getAssignments).toHaveBeenCalledTimes(2);
    const newer = { ...initial, progress: 90 };
    repo.getAssignments.mockResolvedValueOnce([newer]);
    await act(async () => { await view.result.current.refreshAssignments(); });
    await act(async () => { old.resolve([initial]); await first; });
    expect(view.result.current.activePatrols).toEqual([newer]);
  });
  it("returns a successful write even when a subsequent list refresh fails", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("Список недоступен"));
    const view = renderHook(() => useAssignmentsWorkspace({ dataSourceMode: "api", refreshPatrolData: refresh, showToast: vi.fn() }));
    await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    const completed = { ...initial, status: "Завершено", progress: 100 };
    repo.completeAssignment.mockResolvedValue({ assignment: completed, changed: true });
    repo.getAssignments.mockRejectedValueOnce(new Error("Нет связи"));
    let result: unknown;
    await act(async () => { result = await view.result.current.runCommand(initial.id, "complete"); });
    expect(result).toEqual({ succeeded: true });
    expect(view.result.current.activePatrols).toEqual([completed]);
  });
  it("ignores mutation side effects after unmount and prevents duplicate API commands", async () => {
    const refresh = vi.fn(), toast = vi.fn(), pending = deferred<unknown>();
    const view = renderHook(() => useAssignmentsWorkspace({ dataSourceMode: "api", refreshPatrolData: refresh, showToast: toast }));
    await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    repo.completeAssignment.mockReturnValue(pending.promise);
    let first!: Promise<unknown>, second!: Promise<unknown>;
    act(() => { first = view.result.current.runCommand("a1", "complete"); second = view.result.current.runCommand("a1", "complete"); });
    expect(repo.completeAssignment).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => { pending.resolve({ assignment: initial, changed: true }); await first; await second; });
    expect(refresh).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
  it("does not apply an old creation response after an A to B to A session change", async () => {
    const pending = deferred<ActivePatrol>(), toast = vi.fn();
    const view = renderHook(({ owner }) => useAssignmentsWorkspace({ dataSourceMode: "api", sessionKey: owner, refreshPatrolData: vi.fn(), showToast: toast }), { initialProps: { owner: "A" } });
    await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    repo.createAssignment.mockReturnValue(pending.promise);
    let create!: Promise<unknown>;
    act(() => { create = view.result.current.createAssignment(payload); });
    view.rerender({ owner: "B" }); await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    view.rerender({ owner: "A" }); await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    await act(async () => { pending.resolve({ ...initial, id: "old-creation" }); await create; });
    expect(view.result.current.activePatrols).toEqual([initial]);
    expect(toast).not.toHaveBeenCalled();
  });
  it("reports a rejected creation to the editor instead of pretending it succeeded", async () => {
    const view = renderHook(() => useAssignmentsWorkspace({ dataSourceMode: "api", refreshPatrolData: vi.fn(), showToast: vi.fn() }));
    await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    repo.createAssignment.mockRejectedValue(new Error("Создание отклонено"));
    let result: unknown;
    await act(async () => { result = await view.result.current.createAssignment(payload); });
    expect(result).toEqual({ succeeded: false });
    expect(view.result.current.fieldErrors.form).toEqual(["Создание отклонено"]);
  });
  it("lets a new session start an operation while the previous session's request is pending", async () => {
    const old = deferred<ActivePatrol>(), current = deferred<ActivePatrol>();
    const view = renderHook(({ owner }) => useAssignmentsWorkspace({ dataSourceMode: "api", sessionKey: owner, refreshPatrolData: vi.fn(), showToast: vi.fn() }), { initialProps: { owner: "A" } });
    await waitFor(() => expect(view.result.current.listStatus).toBe("ready"));
    repo.createAssignment.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    let first!: Promise<unknown>, second!: Promise<unknown>;
    act(() => { first = view.result.current.createAssignment(payload); });
    view.rerender({ owner: "B" }); await waitFor(() => expect(view.result.current.isCreating).toBe(false));
    act(() => { second = view.result.current.createAssignment(payload); });
    expect(repo.createAssignment).toHaveBeenCalledTimes(2);
    await act(async () => { old.resolve({ ...initial, id: "old" }); await first; });
    expect(view.result.current.isCreating).toBe(true);
    await act(async () => { current.resolve(initial); await second; });
    expect(view.result.current.isCreating).toBe(false);
  });
});

function screenProps() {
  return { activePatrols: [], assignmentCreateIntent: 1, dataSourceMode: "mock" as const,
    employeeDirectory: [{ id: "e1", fullName: "Иванов Иван", position: "Обходчик", department: "Участок", shift: "День", status: "Активен" } as EmployeeDirectoryItem],
    refreshPatrolData: vi.fn().mockResolvedValue(undefined), requestListStatus: "ready" as const, requests: [],
    routeDirectory: [{ id: "r1", name: "Маршрут", status: "Активен", territory: "Участок", points: [] } as unknown as RouteDirectoryItem],
    selectedEmployeeId: "e1", selectedRouteId: "r1", onOpenRequestById: vi.fn(), onRefreshRequests: vi.fn(), onNavigate: vi.fn(), onNotify: vi.fn(),
    onCreatePatrolRequest: vi.fn(), onSelectEmployee: vi.fn(), onSelectRoute: vi.fn() };
}
describe("assignment request form", () => {
  it("retries a lost response with the same client ID and retains the comment", async () => {
    const props = screenProps(); props.onCreatePatrolRequest.mockRejectedValueOnce(new Error("Ответ потерян")).mockResolvedValue({ id: "request-1" } as ServiceRequest);
    render(<AssignmentScreen {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Особенности обхода и зоны внимания…"), { target: { value: "Проверить ограждение" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ответ потерян");
    expect(screen.getByPlaceholderText("Особенности обхода и зоны внимания…")).toHaveValue("Проверить ограждение");
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    await waitFor(() => expect(props.onCreatePatrolRequest).toHaveBeenCalledTimes(2));
    expect(props.onCreatePatrolRequest.mock.calls[1][0].clientRequestId).toBe(props.onCreatePatrolRequest.mock.calls[0][0].clientRequestId);
    expect(props.onCreatePatrolRequest.mock.calls[0][0].clientRequestId).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("keeps the form when browser storage refuses to save a draft", async () => {
    render(<AssignmentScreen {...screenProps()} />);
    fireEvent.change(screen.getByPlaceholderText("Особенности обхода и зоны внимания…"), { target: { value: "Не потерять комментарий" } });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new DOMException("Storage denied", "SecurityError"); });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить как черновик" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить черновик");
    expect(screen.getByPlaceholderText("Особенности обхода и зоны внимания…")).toHaveValue("Не потерять комментарий");
    expect(screen.getByRole("dialog", { name: "Создание заявки на обход" })).toBeInTheDocument();
  });
});
