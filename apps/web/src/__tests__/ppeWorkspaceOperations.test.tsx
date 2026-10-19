import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryPpeScreen } from "../features/inventory/InventoryPpeScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import type { InventoryPpeWorkspaceDto } from "../api/contracts";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { const data = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }); localStorage.setItem("patrol360.inventory.ppe.employee", "emp-1"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture() {
  const repository = createMockInventoryRepository(), data = await repository.getPpeWorkspace("emp-1");
  const workspace = { ...data, card: { ...data.card!, version: 7, lines: [{ ...data.card!.lines[0], quantity: 2, status: "issued" }] } };
  vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: [data.employee], page: 1, pageSize: 40, pageCount: 1, total: 1 });
  const load = vi.spyOn(repository, "getPpeWorkspace").mockResolvedValue(workspace), apply = vi.spyOn(repository, "applyPpeLineAction").mockResolvedValue(workspace.card.lines[0]);
  const notify = vi.fn(), view = (repo = repository) => <InventoryRepositoryProvider value={repo}><InventoryPpeScreen canManage onNavigate={vi.fn()} onNotify={notify} /></InventoryRepositoryProvider>;
  const result = render(view()); await screen.findByRole("tab", { name: /^Фактическая выдача/ }); fireEvent.click(screen.getByRole("tab", { name: /^Фактическая выдача/ }));
  fireEvent.click(screen.getByLabelText(/^Действия:/)); fireEvent.click(screen.getByRole("button", { name: "Оформить возврат" }));
  return { ...result, repository, workspace, load, apply, notify, view };
}
describe("PPE workspace operation and refresh boundaries", () => {
  it("keeps a successful operation successful when the following refresh fails, and prevents a duplicate", async () => {
    const { workspace, load, apply, notify } = await fixture(); load.mockRejectedValueOnce(new Error("Связь прервана"));
    fireEvent.change(screen.getByLabelText(/Количество возврата/), { target: { value: "1" } }); fireEvent.click(screen.getByRole("button", { name: "Оформить возврат" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Оформить возврат" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/Операция сохранена.*повторять операцию не нужно/); expect(screen.getByRole("heading", { name: "Что сотрудник получил" })).toBeInTheDocument();
    expect(apply).toHaveBeenCalledExactlyOnceWith(workspace.card.id, workspace.card.lines[0].id, expect.objectContaining({ quantity: 1, expectedVersion: 7 })); expect(notify).toHaveBeenCalledWith(expect.stringContaining("Операция сохранена")); expect(screen.getByRole("button", { name: "Оформить возврат" })).toBeDisabled();
    const gate = deferred<InventoryPpeWorkspaceDto>(); load.mockReturnValueOnce(gate.promise); fireEvent.click(screen.getByRole("button", { name: "Обновить карточку" }));
    expect(screen.getByRole("heading", { name: "Что сотрудник получил" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Оформить возврат" })).toBeDisabled();
    await act(async () => gate.resolve({ ...workspace, card: { ...workspace.card, version: 8, lines: [{ ...workspace.card.lines[0], quantity: 1 }] } }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Оформить возврат" })).toBeEnabled(); fireEvent.click(screen.getByRole("button", { name: "Оформить возврат" })); expect(screen.getByLabelText(/Количество возврата/)).toHaveValue("1"); expect(apply).toHaveBeenCalledOnce();
  });
  it("keeps a rejected operation's input and opened card version until a deliberate retry", async () => {
    const { apply } = await fixture(); apply.mockRejectedValueOnce(new Error("Версия карточки изменилась"));
    fireEvent.change(screen.getByLabelText(/Количество возврата/), { target: { value: "1,5" } }); fireEvent.change(screen.getByRole("textbox", { name: /Причина/ }), { target: { value: "Комментарий возврата" } });
    fireEvent.click(screen.getByRole("button", { name: "Оформить возврат" })); await screen.findByText("Версия карточки изменилась");
    const dialog = screen.getByRole("dialog", { name: "Оформить возврат" }); expect(within(dialog).getByLabelText(/Количество возврата/)).toHaveValue("1,5"); expect(within(dialog).getByRole("textbox", { name: /Причина/ })).toHaveValue("Комментарий возврата");
    fireEvent.click(within(dialog).getByRole("button", { name: "Оформить возврат" })); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(apply).toHaveBeenCalledTimes(2); expect(apply.mock.calls[1][2]).toMatchObject({ quantity: 1.5, comment: "Комментарий возврата", expectedVersion: 7 });
  });
  it("ignores a response from a previous repository session", async () => {
    const { apply, repository, rerender, view, notify, workspace } = await fixture(), gate = deferred<typeof workspace.card.lines[number]>(); apply.mockReturnValueOnce(gate.promise);
    fireEvent.click(screen.getByRole("button", { name: "Оформить возврат" })); const nextRepository = createMockInventoryRepository(); vi.spyOn(nextRepository, "getEmployees").mockResolvedValue({ rows: [], page: 1, pageSize: 40, pageCount: 0, total: 0 }); vi.spyOn(nextRepository, "getPpeWorkspace").mockResolvedValue(workspace);
    rerender(view(nextRepository)); await act(async () => gate.resolve(workspace.card.lines[0])); expect(notify).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(repository.applyPpeLineAction).toHaveBeenCalledOnce();
  });
});

