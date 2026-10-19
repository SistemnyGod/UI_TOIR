import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InventoryIssueScreen } from "../features/inventory/InventoryIssueScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

it("a retry after a lost response keeps operation ids for every line", async () => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: () => null, setItem: () => {}, removeItem: () => {},
  } });
  const repository = createMockInventoryRepository();
  const options = await repository.getIssueOptions();
  const item = options.items[0]; const employee = options.employees[0];
  expect(item).toBeTruthy(); expect(employee).toBeTruthy();
  const realCreate = repository.createOperation.bind(repository);
  const create = vi.spyOn(repository, "createOperation").mockRejectedValueOnce(new Error("Response lost"))
    .mockImplementation(realCreate);
  const notify = vi.fn();
  render(<InventoryRepositoryProvider value={repository}><InventoryIssueScreen onNotify={notify} /></InventoryRepositoryProvider>);
  fireEvent.click(await screen.findByRole("button", { name: `Выбрать позицию: ${item.name}` }));
  fireEvent.change(screen.getByRole("combobox", { name: "Сотрудник" }), { target: { value: employee.id } });
  fireEvent.click(screen.getByRole("button", { name: "Провести выдачу" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Response lost"));
  const originalId = create.mock.calls[0][0].clientOperationId;
  expect(originalId).toMatch(/^[a-f0-9-]{36}$/);
  fireEvent.click(screen.getByRole("button", { name: "Провести выдачу" }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Выдача проведена"));
  expect(create.mock.calls[1][0].clientOperationId).toBe(originalId);
});
