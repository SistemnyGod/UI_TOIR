import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryPpeHistoryScreen } from "../features/inventory/InventoryPpeHistoryScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { readDocumentStorage } from "../features/inventory/ppe/documentStorage";

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const event = { id: "event-1", employeeId: "employee-in-history", employeeName: "Сотрудник из истории", itemName: "Каска", normItemName: "Защита головы", quantity: 1, unit: "шт", action: "issued", actionLabel: "Выдача", fromStatus: "", toStatus: "issued", actor: "Кладовщик", createdAt: "2026-10-16T08:00:00Z", comment: "Сохранённый комментарий" };
const list = { rows: [event], total: 1, page: 1, pageSize: 30, pageCount: 1 };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PPE history refresh", () => {
  it("retains the table on failure and does not replace an open event or reset focus", async () => {
    const pending = deferred<typeof list>();
    const repository = { getPpeHistory: vi.fn().mockResolvedValueOnce(list).mockImplementation(() => pending.promise) };
    render(<InventoryRepositoryProvider value={repository as never}><InventoryPpeHistoryScreen onNavigate={vi.fn()} /></InventoryRepositoryProvider>);
    await screen.findByRole("table"); const table = screen.getByRole("table");
    fireEvent.change(screen.getByLabelText("Итоговое состояние"), { target: { value: "issued" } });
    expect(table).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /Открыть детали операции/ }); trigger.focus(); fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Закрыть" }); close.focus();
    await act(async () => pending.reject(new Error("Связь потеряна")));
    expect(table).toBeInTheDocument(); expect(screen.getByText("Сохранённый комментарий")).toBeInTheDocument(); expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveFocus(); expect(screen.getByRole("alert")).toHaveTextContent("Связь потеряна");
  });

  it("opens the intended employee using the memory fallback when browser storage fails", async () => {
    const repository = { getPpeHistory: vi.fn().mockResolvedValue(list) }, navigate = vi.fn();
    const brokenStorage = { setItem: () => { throw new Error("Storage unavailable"); } };
    Object.defineProperty(window, "localStorage", { configurable: true, value: brokenStorage });
    render(<InventoryRepositoryProvider value={repository as never}><InventoryPpeHistoryScreen onNavigate={navigate} /></InventoryRepositoryProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Открыть детали операции/ }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть карточку сотрудника" }));
    expect(navigate).toHaveBeenCalledWith("inventory-ppe");
    expect(readDocumentStorage("localStorage", "patrol360.inventory.ppe.employee")).toBe(event.employeeId);
  });

  it("keeps existing rows while an invalid date range is corrected and makes no invalid request", async () => {
    const repository = { getPpeHistory: vi.fn().mockResolvedValue(list) };
    render(<InventoryRepositoryProvider value={repository as never}><InventoryPpeHistoryScreen onNavigate={vi.fn()} /></InventoryRepositoryProvider>);
    await screen.findByRole("table"); const table = screen.getByRole("table");
    fireEvent.change(screen.getByLabelText("Период с"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Период по"), { target: { value: "2026-10-10" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Дата начала"));
    expect(table).toBeInTheDocument();
    expect(repository.getPpeHistory.mock.calls.some(([params]) => params.dateFrom && params.dateTo && params.dateFrom > params.dateTo)).toBe(false);
  });
});
