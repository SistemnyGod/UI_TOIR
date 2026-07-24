import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PpeIssueWorkflowScreen } from "../features/inventory/ppe/PpeIssueWorkflowScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

describe("PPE issue workflow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() });
  });

  it("runs employee → norm → composition → atomic save", async () => {
    const user = userEvent.setup();
    const repository = createMockInventoryRepository();
    const employees = await repository.getEmployees({ pageSize: 100 });
    const employee = employees.rows[0];
    expect(employee).toBeTruthy();
    window.localStorage.setItem("patrol360.inventory.ppe.employee", employee!.id);
    const createBatch = vi.spyOn(repository, "createPpeIssueBatch");
    const printPpeCard = vi.spyOn(repository, "printPpeCard");
    const notify = vi.fn();

    render(
      <InventoryRepositoryProvider value={repository}>
        <PpeIssueWorkflowScreen onNavigate={vi.fn()} onNotify={notify} />
      </InventoryRepositoryProvider>,
    );

    await screen.findByText(employee!.fullName);
    await user.type(screen.getByLabelText(/Ответственный/), "Иванов И.И.");
    await user.click(screen.getByRole("button", { name: /Пустой документ/ }));
    const continueButton = screen.getByRole("button", { name: /Продолжить к подбору/ });
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);

    expect(await screen.findByRole("heading", { name: "Подбор СИЗ" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Добавить из каталога/ }));
    const dialog = await screen.findByRole("dialog", { name: "Сопоставить норму с номенклатурой" });
    await waitFor(() => expect(dialog.querySelector(".ppe-v2-catalog-list > button")).toBeTruthy());
    await user.click(dialog.querySelector(".ppe-v2-catalog-list > button") as HTMLButtonElement);
    await user.click(screen.getByRole("button", { name: "Сохранить и выбрать" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /К составу/ }));

    expect(await screen.findByRole("heading", { name: "Состав и проверка" })).toBeInTheDocument();
    const quantity = screen.getAllByLabelText(/Количество/)[0];
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(screen.getByRole("button", { name: /Предпросмотр печати/ }));

    expect(await screen.findByRole("heading", { name: "Печать и предпросмотр" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Сохранить документ выдачи/ }));
    await user.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(printPpeCard).toHaveBeenCalledWith(expect.any(String), "sheet", "pdf"));
    await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Документ выдачи сохранён"));
  });
});
function createMemoryStorage(): Storage {
  const rows = new Map<string, string>();
  return {
    clear: () => rows.clear(),
    getItem: (key: string) => rows.get(key) ?? null,
    key: (index: number) => Array.from(rows.keys())[index] ?? null,
    get length() { return rows.size; },
    removeItem: (key: string) => { rows.delete(key); },
    setItem: (key: string, value: string) => { rows.set(key, value); },
  };
}