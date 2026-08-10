import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PpeCatalogPicker } from "../features/inventory/ppe/PpeCatalogPicker";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

describe("PPE catalog picker", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() });
  });

  it("selects several items and keeps editable price and article in one confirmation", async () => {
    const user = userEvent.setup();
    const repository = createMockInventoryRepository();
    const onConfirm = vi.fn();

    render(
      <InventoryRepositoryProvider value={repository}>
        <PpeCatalogPicker onClose={vi.fn()} onConfirm={onConfirm} />
      </InventoryRepositoryProvider>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Выбрать спецодежду из номенклатуры" });
    await waitFor(() => expect(dialog.querySelectorAll(".ppe-catalog-item-card").length).toBeGreaterThanOrEqual(2));

    const cards = dialog.querySelectorAll<HTMLButtonElement>(".ppe-catalog-item-card");
    await user.click(cards[0]);
    await user.click(cards[1]);

    const price = screen.getByRole("textbox", { name: /Цена / });
    const article = screen.getByRole("textbox", { name: /Артикул или модель / });
    await user.clear(price);
    await user.type(price, "1250,50");
    await user.clear(article);
    await user.type(article, "ЗИМ-TEST-001");

    await user.click(screen.getByRole("button", { name: "Добавить выбранные (2)" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    const selections = onConfirm.mock.calls[0][0];
    expect(selections).toHaveLength(2);
    expect(selections[1]).toEqual(expect.objectContaining({ brandModelArticle: "ЗИМ-TEST-001", unitPriceMinor: 125050 }));
  });

  it("keeps replacement mode single-select", async () => {
    const user = userEvent.setup();
    const repository = createMockInventoryRepository();
    const onConfirm = vi.fn();

    render(
      <InventoryRepositoryProvider value={repository}>
        <PpeCatalogPicker onClose={vi.fn()} onConfirm={onConfirm} singleSelection />
      </InventoryRepositoryProvider>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Выбрать спецодежду из номенклатуры" });
    await waitFor(() => expect(dialog.querySelectorAll(".ppe-catalog-item-card").length).toBeGreaterThanOrEqual(2));
    const cards = dialog.querySelectorAll<HTMLButtonElement>(".ppe-catalog-item-card");
    await user.click(cards[0]);
    await user.click(cards[1]);
    await user.click(screen.getByRole("button", { name: "Заменить товар" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm.mock.calls[0][0]).toHaveLength(1);
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
