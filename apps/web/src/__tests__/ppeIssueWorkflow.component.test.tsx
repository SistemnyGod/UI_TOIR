import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PpeIssueWorkflowScreen } from "../features/inventory/ppe/PpeIssueWorkflowScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

describe("PPE issue workflow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs employee → norm → composition → atomic save", async () => {
    const user = userEvent.setup();
    let uuidSeed = 1;
    vi.stubGlobal("crypto", {
      getRandomValues: (values: Uint8Array) => {
        values.fill(uuidSeed);
        uuidSeed += 1;
        return values;
      },
    });
    const repository = createMockInventoryRepository();
    const employees = await repository.getEmployees({ pageSize: 100 });
    const employee = employees.rows[0];
    expect(employee).toBeTruthy();
    window.localStorage.setItem("patrol360.inventory.ppe.employee", employee!.id);
    const createBatchImplementation = repository.createPpeIssueBatch.bind(repository);
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
    await waitFor(() => expect(dialog.querySelectorAll(".ppe-catalog-item-card").length).toBeGreaterThanOrEqual(2));
    const catalogItems = dialog.querySelectorAll<HTMLButtonElement>(".ppe-catalog-item-card");
    await user.click(catalogItems[0]);
    await user.click(catalogItems[1]);
    const selectedQuantity = screen.getByLabelText(/Количество/);
    await user.clear(selectedQuantity);
    await user.type(selectedQuantity, "2");
    await user.click(screen.getByRole("button", { name: "Добавить выбранные (2)" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /К составу/ }));

    expect(await screen.findByRole("heading", { name: "Состав и проверка" })).toBeInTheDocument();
    const quantities = screen.getAllByLabelText(/Количество/);
    const quantity = quantities[0];
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(screen.getByRole("button", { name: /Предпросмотр печати/ }));

    expect(await screen.findByRole("heading", { name: "Печать и предпросмотр" })).toBeInTheDocument();
    let releaseBatch!: () => void;
    const batchGate = new Promise<void>((resolve) => { releaseBatch = resolve; });
    createBatch.mockImplementation(async (cardId, payload) => {
      await batchGate;
      return createBatchImplementation(cardId, payload);
    });
    await user.click(screen.getByRole("button", { name: /Сохранить документ выдачи/ }));
    await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Состав/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "К карточкам" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /Личная карточка/ })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /Лист выдачи/ })).toBeDisabled();
    releaseBatch();
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining("Документ выдачи сохранён")));
    await user.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(printPpeCard).toHaveBeenCalledWith(expect.any(String), "sheet", "pdf"));
    const batchPayload = createBatch.mock.calls[0][1];
    expect(batchPayload.lines).toHaveLength(2);
    expect(batchPayload.lines.some((line) => line.quantity === 2)).toBe(true);
  });

  it("показывает ошибку загрузки наборов и позволяет повторить запрос", async () => {
    const user = userEvent.setup();
    const repository = createMockInventoryRepository();
    const settings = await repository.getSettings();
    const getSettings = vi.spyOn(repository, "getSettings")
      .mockRejectedValueOnce(new Error("Настройки временно недоступны"))
      .mockResolvedValue(settings);

    render(
      <InventoryRepositoryProvider value={repository}>
        <PpeIssueWorkflowScreen onNavigate={vi.fn()} onNotify={vi.fn()} />
      </InventoryRepositoryProvider>,
    );

    await screen.findByRole("heading", { name: "Сотрудник" });
    await user.type(screen.getByLabelText(/Ответственный/), "Иванов И.И.");
    await user.click(screen.getByRole("button", { name: /Пустой документ/ }));
    const continueButton = screen.getByRole("button", { name: /Продолжить к подбору/ });
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);
    await user.click(screen.getByRole("tab", { name: "Наборы" }));

    expect(await screen.findByText("Наборы недоступны")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Наборы недоступны")).not.toBeInTheDocument();
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
