import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryEmployeeDto } from "../api/contracts";
import { usePpeEmployeeSearch } from "../features/inventory/ppe/usePpeEmployeeSearch";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

function employee(id: string): InventoryEmployeeDto { return { id, fullName: "Сотрудник " + id, personnelNo: id, position: "Слесарь", department: "Цех", status: "active", employeeGroup: "", hiredAt: null, birthDate: null }; }
function result(ids: string[], page = 1, pageCount = 3) { return { rows: ids.map(employee), page, pageSize: 50, pageCount, total: 121 }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function debounce() { await act(async () => vi.advanceTimersByTimeAsync(300)); }
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("PPE server employee search", () => {
  it("debounces typing, requests 50 active employees, and restores the selected ID outside the result page", async () => {
    const repository = createMockInventoryRepository(), list = vi.spyOn(repository, "getEmployees").mockResolvedValue(result(["one"]));
    vi.spyOn(repository, "getEmployee").mockResolvedValue(employee("selected"));
    const { result: hook } = renderHook(() => usePpeEmployeeSearch(repository, "owner", "selected"));
    act(() => hook.current.search("И")); await act(async () => vi.advanceTimersByTimeAsync(200)); act(() => hook.current.search("Иванов"));
    expect(list).not.toHaveBeenCalled(); await debounce();
    expect(list).toHaveBeenCalledExactlyOnceWith({ query: "Иванов", page: 1, pageSize: 50, status: "active" }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(hook.current.employees.map(row => row.id)).toEqual(["selected", "one"]); expect(hook.current.rows.map(row => row.id)).toEqual(["one"]);
  });
  it("retries a failed page instead of skipping it and locks duplicate load-more actions", async () => {
    const repository = createMockInventoryRepository(), list = vi.spyOn(repository, "getEmployees").mockResolvedValueOnce(result(["one"])).mockRejectedValueOnce(new Error("Связь прервана")).mockResolvedValueOnce(result(["one", "two"], 2));
    const { result: hook } = renderHook(() => usePpeEmployeeSearch(repository, "owner", "")); await debounce();
    act(() => { hook.current.more(); hook.current.more(); }); await debounce(); expect(hook.current.error).toContain("Связь прервана"); expect(hook.current.rows.map(row => row.id)).toEqual(["one"]);
    act(() => { hook.current.more(); hook.current.more(); }); await debounce();
    expect(list.mock.calls.map(([query]) => query?.page)).toEqual([1, 2, 2]); expect(hook.current.rows.map(row => row.id)).toEqual(["one", "two"]); expect(hook.current.error).toBe("");
  });
  it("replaces a retried page without mixing it with an older revision of the same page", async () => {
    const repository = createMockInventoryRepository(), list = vi.spyOn(repository, "getEmployees").mockResolvedValueOnce(result(["one"])).mockResolvedValueOnce(result(["old"], 2)).mockResolvedValueOnce(result(["new"], 2));
    const { result: hook } = renderHook(() => usePpeEmployeeSearch(repository, "owner", "")); await debounce(); act(() => hook.current.more()); await debounce(); act(() => hook.current.retry()); await debounce();
    expect(list).toHaveBeenCalledTimes(3); expect(hook.current.rows.map(row => row.id)).toEqual(["one", "new"]);
  });
  it("ignores a late old query and retains a selected-employee error after list success", async () => {
    const repository = createMockInventoryRepository(), gate = deferred<ReturnType<typeof result>>();
    vi.spyOn(repository, "getEmployees").mockReturnValueOnce(gate.promise).mockResolvedValueOnce(result(["new"], 1, 1));
    vi.spyOn(repository, "getEmployee").mockRejectedValue(new Error("Выбранный сотрудник недоступен"));
    const { result: hook } = renderHook(() => usePpeEmployeeSearch(repository, "owner", "selected")); await debounce(); act(() => hook.current.search("новый")); await debounce();
    await act(async () => gate.resolve(result(["old"]))); expect(hook.current.rows.map(row => row.id)).toEqual(["new"]); expect(hook.current.error).toContain("Выбранный сотрудник недоступен");
  });
  it("does not use a mismatched employee response and retries its own ID", async () => {
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "getEmployees").mockResolvedValue(result([])); const selected = vi.spyOn(repository, "getEmployee").mockResolvedValueOnce(employee("wrong")).mockResolvedValueOnce(employee("selected"));
    const { result: hook } = renderHook(() => usePpeEmployeeSearch(repository, "owner", "selected")); await debounce(); expect(hook.current.error).toContain("другого сотрудника"); expect(hook.current.employees).toEqual([]);
    act(() => hook.current.retry()); await debounce(); expect(selected.mock.calls.map(([id]) => id)).toEqual(["selected", "selected"]); expect(hook.current.employees[0].id).toBe("selected"); expect(hook.current.error).toBe("");
  });
  it("clears the previous session and ignores its pending list and selected-employee responses", async () => {
    const repository = createMockInventoryRepository(), listGate = deferred<ReturnType<typeof result>>(), selectedGate = deferred<InventoryEmployeeDto>();
    vi.spyOn(repository, "getEmployees").mockReturnValueOnce(listGate.promise).mockResolvedValue(result(["new"])); vi.spyOn(repository, "getEmployee").mockReturnValueOnce(selectedGate.promise);
    const { result: hook, rerender } = renderHook(({ owner, id }) => usePpeEmployeeSearch(repository, owner, id), { initialProps: { owner: "old-owner", id: "old" } }); await debounce();
    rerender({ owner: "new-owner", id: "" }); await debounce(); await act(async () => { listGate.resolve(result(["old"])); selectedGate.resolve(employee("old")); });
    expect(hook.current.employees.map(row => row.id)).toEqual(["new"]); expect(hook.current.query).toBe("");
  });
});
