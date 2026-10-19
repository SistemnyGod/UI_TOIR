import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryPpeScreen } from "../features/inventory/InventoryPpeScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

beforeEach(() => { const values = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture() {
  const repository = createMockInventoryRepository(), base = await repository.getPpeWorkspace("emp-1");
  const employees = [base.employee, { ...base.employee, id: "second", fullName: "Другой сотрудник" }];
  vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: employees, page: 1, pageSize: 50, pageCount: 1, total: 2 });
  vi.spyOn(repository, "getEmployee").mockImplementation(async id => employees.find(row => row.id === id)!);
  const load = vi.spyOn(repository, "getPpeWorkspace").mockImplementation(async id => ({ ...base, employee: employees.find(row => row.id === id)!, card: { ...base.card!, employeeId: id, employeeName: employees.find(row => row.id === id)!.fullName } }));
  const view = (owner: string) => <InventoryRepositoryProvider value={repository}><InventoryPpeScreen currentUserId={owner} canExport onNotify={vi.fn()} /></InventoryRepositoryProvider>;
  return { repository, employees, load, view };
}
describe("legacy PPE workspace session ownership", () => {
  it("does not collapse the employee pane when initial results arrive after the user opened it", async () => {
    const { view, employees } = await fixture(); render(view("initial-open-owner"));
    const toggle = screen.getByRole("button", { name: "Скрыть список сотрудников" });
    fireEvent.click(toggle); fireEvent.click(screen.getByRole("button", { name: "Показать список сотрудников" }));
    await screen.findByRole("heading", { name: employees[0].fullName }); expect(toggle).toHaveAttribute("aria-expanded", "true"); expect(screen.getByRole("textbox", { name: "Поиск сотрудников" })).toBeVisible();
  });
  it("restores only the current owner's selection and clears an opened print editor on account change", async () => {
    const { view, employees } = await fixture(); localStorage.setItem("patrol360.inventory.ppe.employee.owner-a", employees[0].id); localStorage.setItem("patrol360.inventory.ppe.employee.owner-b", "second");
    const { rerender } = render(view("owner-a")); await screen.findByRole("heading", { name: employees[0].fullName }); fireEvent.click(screen.getByRole("tab", { name: /^Печать/ })); fireEvent.click(screen.getAllByRole("button", { name: "Предпросмотр" })[0]); fireEvent.click(screen.getByRole("button", { name: "Правки для печати" }));
    rerender(view("owner-b")); await screen.findByRole("heading", { name: "Другой сотрудник" }); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(localStorage.getItem("patrol360.inventory.ppe.employee.owner-a")).toBe(employees[0].id); expect(localStorage.getItem("patrol360.inventory.ppe.employee.owner-b")).toBe("second");
  });
  it("keeps the unowned legacy key intact without assigning it to the current account", async () => {
    const { view, employees, load } = await fixture(); localStorage.setItem("patrol360.inventory.ppe.employee", "second"); render(view("new-owner")); await screen.findByRole("heading", { name: employees[0].fullName }); expect(load).toHaveBeenCalledWith(employees[0].id); expect(localStorage.getItem("patrol360.inventory.ppe.employee")).toBe("second"); expect(localStorage.getItem("patrol360.inventory.ppe.employee.new-owner")).toBe(employees[0].id);
  });
  it("allows selection when browser storage is unavailable", async () => {
    const { view, employees } = await fixture(); vi.stubGlobal("localStorage", { getItem: () => { throw new Error("Storage denied"); }, setItem: () => { throw new Error("Storage denied"); }, removeItem: vi.fn() }); render(view("storage-failure-owner")); await screen.findByRole("heading", { name: employees[0].fullName }); fireEvent.click(screen.getByRole("button", { name: /Другой сотрудник/ })); await waitFor(() => expect(screen.getByRole("heading", { name: "Другой сотрудник" })).toBeInTheDocument());
  });
});
