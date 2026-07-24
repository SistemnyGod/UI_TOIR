import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InventoryPpeHistoryScreen } from "../features/inventory/InventoryPpeHistoryScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

describe("InventoryPpeHistoryScreen", () => {
  it("filters by final state and keeps the event drawer keyboard-accessible", async () => {
    const user = userEvent.setup();
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        get length() { return storage.size; },
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    const repository = createMockInventoryRepository();
    const getPpeHistory = vi.spyOn(repository, "getPpeHistory");

    render(
      <InventoryRepositoryProvider value={repository}>
        <InventoryPpeHistoryScreen onNavigate={vi.fn()} />
      </InventoryRepositoryProvider>,
    );

    const detailsButton = await screen.findByRole("button", { name: /Открыть детали операции/ });
    expect(screen.getByText("Операции с СИЗ")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Выдано1на странице/ }));
    await waitFor(() => expect(getPpeHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: "issued" })));

    const filteredDetailsButton = screen.getByRole("button", { name: /Открыть детали операции/ });
    await user.click(filteredDetailsButton);
    expect(screen.getByRole("dialog", { name: "Детали события" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Закрыть" })).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Детали события" })).not.toBeInTheDocument();
    await waitFor(() => expect(filteredDetailsButton).toHaveFocus());
  });
});
