import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryPpeCardLineDto } from "../api/contracts";
import { PpeLineActionModal } from "../features/inventory/ppe/PpeLineActionModal";
const line = { id: "line", itemName: "Каска защитная", quantity: 2, unit: "шт.", issuedAt: "2026-01-01T00:00:00Z" } as InventoryPpeCardLineDto;
function deferred() { let resolve!: () => void, reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("current PPE return modal", () => {
  it("rejects future dates and excess return quantities, then submits the valid partial return", async () => {
    // Calendar dates follow the operator's local day, including hours before UTC midnight.
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 16, 0, 30));
    const onSubmit = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const line = { id: "line", itemName: "Каска защитная", quantity: 2, unit: "шт.", issuedAt: "2026-01-01T00:00:00Z" } as InventoryPpeCardLineDto;
    render(<PpeLineActionModal action="returned" line={line} onClose={onClose} onSubmit={onSubmit} />);
    const date = screen.getByLabelText(/Дата операции/);
    const quantity = screen.getByLabelText(/Количество возврата/);
    const confirm = screen.getByRole("button", { name: "Оформить возврат" });
    const today = "2026-10-16", tomorrow = "2026-10-17";
    fireEvent.change(date, { target: { value: tomorrow } });
    expect(confirm).toBeDisabled();
    fireEvent.change(date, { target: { value: today } });
    fireEvent.change(quantity, { target: { value: "3" } });
    expect(confirm).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(quantity, { target: { value: "1" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: "returned", quantity: 1 })));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
  it.each(["Escape", "close", "backdrop", "cancel"])("protects a comment from dismissal through %s", async method => {
    const onClose = vi.fn(); render(<PpeLineActionModal action="returned" line={line} onClose={onClose} onSubmit={vi.fn()} />);
    const editor = screen.getByRole("dialog", { name: "Оформить возврат" });
    fireEvent.change(within(editor).getByRole("textbox", { name: /Причина/ }), { target: { value: "Сохранить этот комментарий" } });
    if (method === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else if (method === "close") fireEvent.click(within(editor).getByRole("button", { name: "Закрыть" }));
    else if (method === "backdrop") fireEvent.mouseDown(editor.parentElement!);
    else fireEvent.click(within(editor).getByRole("button", { name: "Отмена" }));
    const guard = await screen.findByRole("dialog", { name: "Несохранённые изменения" });
    expect(onClose).not.toHaveBeenCalled(); fireEvent.click(within(guard).getByRole("button", { name: "Продолжить редактирование" }));
    expect(within(editor).getByRole("textbox", { name: /Причина/ })).toHaveValue("Сохранить этот комментарий");
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" })); expect(onClose).toHaveBeenCalledOnce();
  });
  it("blocks duplicate submits and closing while pending, then keeps input on failure", async () => {
    const gate = deferred(), onClose = vi.fn(), submit = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(undefined);
    render(<StrictMode><PpeLineActionModal action="returned" line={line} onClose={onClose} onSubmit={submit} /></StrictMode>);
    const quantity = screen.getByLabelText(/Количество возврата/), button = screen.getByRole("button", { name: "Оформить возврат" });
    fireEvent.change(quantity, { target: { value: "1,5" } }); fireEvent.click(button); fireEvent.click(button);
    expect(submit).toHaveBeenCalledOnce(); expect(quantity).toBeDisabled(); fireEvent.keyDown(window, { key: "Escape" }); fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).not.toBeInTheDocument();
    await act(async () => gate.reject(new Error("Версия карточки изменена"))); expect(screen.getByRole("alert")).toHaveTextContent("Версия карточки изменена"); expect(quantity).toHaveValue("1,5"); expect(quantity).toBeEnabled();
    fireEvent.click(button); await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: 1.5 }));
  });
  it("does not let an old line's response close or overwrite a newly opened line", async () => {
    const gate = deferred(), onClose = vi.fn(), submit = vi.fn().mockReturnValue(gate.promise);
    const view = render(<PpeLineActionModal action="returned" line={line} onClose={onClose} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Оформить возврат" }));
    view.rerender(<PpeLineActionModal action="returned" line={{ ...line, id: "other", itemName: "Другой предмет", quantity: 7 }} onClose={onClose} onSubmit={submit} />);
    await act(async () => gate.resolve()); expect(onClose).not.toHaveBeenCalled(); expect(screen.getByLabelText(/Количество возврата/)).toHaveValue("7"); expect(screen.getByText("Другой предмет")).toBeInTheDocument();
  });
  it.each(["defective", "written_off"] as const)("requires a reason for %s and preserves the operation contract", async action => {
    const onSubmit = vi.fn(async () => undefined), onClose = vi.fn(); render(<PpeLineActionModal action={action} line={line} onClose={onClose} onSubmit={onSubmit} />);
    const button = screen.getByRole("button", { name: action === "defective" ? "Отметить неисправным" : "Оформить списание" }); expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Причина/ }), { target: { value: "  Причина операции  " } });
    if (action === "written_off") fireEvent.change(screen.getByLabelText("Номер акта"), { target: { value: " ACT-1 " } });
    fireEvent.click(button); await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ action, quantity: null, comment: "Причина операции", writeOffActNumber: action === "written_off" ? "ACT-1" : null, writeOffActDate: action === "written_off" ? expect.any(String) : null }));
  });
  it("uses the user's local calendar date instead of the UTC date", () => {
    vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026); vi.spyOn(Date.prototype, "getMonth").mockReturnValue(9); vi.spyOn(Date.prototype, "getDate").mockReturnValue(17);
    render(<PpeLineActionModal action="returned" line={line} onClose={vi.fn()} onSubmit={vi.fn()} />); expect(screen.getByLabelText(/Дата операции/)).toHaveValue("2026-10-17"); expect(screen.getByLabelText(/Дата операции/)).toHaveAttribute("max", "2026-10-17");
  });
});
