import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryItemsScreen } from "../features/inventory/InventoryItemsScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe("Inventory nomenclature catalog", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
  });
  it("validates a new PPE item and saves it through the existing repository", async () => {
    const user = userEvent.setup();
    const repository = createMockInventoryRepository();
    const settings = await repository.getSettings();
    const existing = (await repository.getItems({ page: 1, pageSize: 1 })).rows[0];
    expect(existing).toBeTruthy();
    const createItem = vi.spyOn(repository, "createItem").mockResolvedValue({
      ...existing!,
      id: "item-new-ppe",
      name: "Костюм защитный Профессионал",
    });
    const notify = vi.fn();

    render(
      <InventoryRepositoryProvider value={repository}>
        <InventoryItemsScreen initialSettings={settings} onNavigate={vi.fn()} onNotify={notify} />
      </InventoryRepositoryProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Номенклатура" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Создать позицию" }));
    expect(await screen.findByRole("dialog", { name: "Создать позицию номенклатуры" })).toBeInTheDocument();

    const name = screen.getByLabelText(/Название/);
    await waitFor(() => expect(name).toHaveFocus());
    await user.type(name, "Костюм защитный Профессионал");
    const invalidPrice = screen.getByLabelText("Цена, ₽");
    await user.click(invalidPrice);
    await user.type(invalidPrice, "-1");
    await user.click(screen.getByRole("button", { name: "Сохранить позицию" }));

    expect(createItem).not.toHaveBeenCalled();
    expect(screen.getByText("Цена должна быть неотрицательным числом")).toBeInTheDocument();

    await user.clear(invalidPrice);
    await user.type(invalidPrice, "3100");
    await user.type(screen.getByLabelText("Нормативное название"), "Костюм для защиты от ОПЗ");
    await user.type(screen.getByLabelText("Фактическое название"), "Костюм Профессионал");
    await user.click(screen.getByRole("button", { name: "Сохранить позицию" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({
      actualItemName: "Костюм Профессионал",
      defaultUnitPriceMinor: 310000,
      name: "Костюм защитный Профессионал",
      normItemName: "Костюм для защиты от ОПЗ",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Создать позицию номенклатуры" })).not.toBeInTheDocument());
  });
});
