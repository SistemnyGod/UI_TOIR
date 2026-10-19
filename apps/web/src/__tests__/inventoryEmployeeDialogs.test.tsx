import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeeFormDialog } from "../features/inventory/employees/EmployeeFormDialog";
import { ConfirmDialog, ImportPreviewDialog, ImportResultDialog } from "../features/inventory/employees/EmployeeImportDialogs";
import { InventoryEmployeesScreen } from "../features/inventory/InventoryEmployeesScreen";
import { PpeMovementHistoryPanel } from "../features/inventory/PpeMovementHistoryPanel";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import type { InventoryEmployeeDto, InventoryEmployeeImportPreviewDto } from "../api/contracts";

function deferred<T = void>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const employee: InventoryEmployeeDto = { id: "employee-1", fullName: "Иванов Иван Иванович", personnelNo: "100", position: "Слесарь", department: "Участок", employeeGroup: "Атом", status: "active", hiredAt: null, birthDate: null };
const options = { departments: ["Участок"], employeeGroups: ["Атом"], positions: ["Слесарь"] };
const list = { rows: [employee], total: 1, page: 1, pageCount: 1, pageSize: 25 };
const preview: InventoryEmployeeImportPreviewDto = { rowsRead: 120, newRows: 120, updateRows: 0, skippedRows: 0, newPositions: [], newDepartments: [], newGroups: [], errors: [], previewToken: "preview-1", rows: Array.from({ length: 120 }, (_, index) => ({ ...employee, rowNumber: index + 1, fullName: `Сотрудник ${index + 1}`, changeType: "create", error: "" })) };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("inventory employee windows", () => {
  it("protects employee input, submits once and retains it after failure", async () => {
    const pending = deferred(), submit = vi.fn(() => pending.promise), close = vi.fn();
    const view = render(<EmployeeFormDialog busy={false} employee={employee} mode="edit" referenceOptions={options} onCancel={close} onConfirm={submit} />);
    fireEvent.change(screen.getByLabelText("ФИО"), { target: { value: "Обновлённое имя" } });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    view.rerender(<EmployeeFormDialog busy={false} employee={{ ...employee, fullName: "Поздний ответ" }} mode="edit" referenceOptions={{ ...options, departments: ["Другое"] }} onCancel={close} onConfirm={submit} />);
    expect(screen.getByLabelText("ФИО")).toHaveValue("Обновлённое имя");
    const button = screen.getByRole("button", { name: "Сохранить изменения" });
    const form = document.getElementById(button.getAttribute("form")!)!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error("Не удалось сохранить карточку")));
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось сохранить карточку");
    expect(screen.getByLabelText("ФИО")).toHaveValue("Обновлённое имя");
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("reaches every import row and keeps the preview after a failed confirmation", async () => {
    const pending = deferred(), submit = vi.fn(() => pending.promise), close = vi.fn();
    render(<ImportPreviewDialog busy={false} fileName="employees.csv" preview={preview} onCancel={close} onConfirm={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Вперед" }));
    expect(screen.getByText("Сотрудник 81")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Вперед" }));
    expect(screen.getByText("Сотрудник 120")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Импортировать" });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    fireEvent.mouseDown(document.querySelector(".modal-backdrop")!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(submit).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error("Нет связи")));
    expect(screen.getByRole("alert")).toHaveTextContent("Нет связи");
    expect(screen.getByText("Сотрудник 120")).toBeInTheDocument();
  });

  it("shows all import errors and prevents importing an invalid preview", () => {
    const errors = ["Неверное имя", "Неверная дата", "Не найдена группа", "Ошибка последней строки"];
    const view = render(<ImportPreviewDialog busy={false} fileName="invalid.csv" preview={{ ...preview, errors }} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Импортировать" })).toBeDisabled();
    fireEvent.click(screen.getByText("Ошибки: 4"));
    expect(screen.getByText("Ошибка последней строки")).toBeVisible();
    view.unmount();
    render(<ImportResultDialog result={{ rowsRead: 4, insertedRows: 0, updatedRows: 0, skippedRows: 4, errors }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Ошибки: 4"));
    expect(screen.getByText("Ошибка последней строки")).toBeVisible();
  });

  it("blocks dismissal and duplicate archive, then displays the actual failure", async () => {
    const pending = deferred(), submit = vi.fn(() => pending.promise), close = vi.fn();
    render(<ConfirmDialog busy={false} confirmLabel="Архивировать" title="Архивировать сотрудника?" message="История сохраняется" onCancel={close} onConfirm={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled(); expect(submit).toHaveBeenCalledOnce();
    await act(async () => pending.reject(new Error("Архив недоступен")));
    expect(screen.getByRole("alert")).toHaveTextContent("Архив недоступен");
  });

  it("keeps the employee list and search input mounted while refreshing and after an error", async () => {
    const pending = deferred<typeof list>();
    const repository = { getEmployees: vi.fn().mockResolvedValueOnce(list).mockImplementation(() => pending.promise) };
    render(<InventoryRepositoryProvider value={repository as never}><InventoryEmployeesScreen onNotify={vi.fn()} onReload={vi.fn()} /></InventoryRepositoryProvider>);
    await screen.findByRole("table");
    const table = screen.getByRole("table"), input = screen.getByPlaceholderText("Поиск по ФИО, табельному, должности или подразделению");
    fireEvent.change(input, { target: { value: "Иванов" } });
    await waitFor(() => expect(repository.getEmployees).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("table")).toBe(table); expect(screen.getByPlaceholderText("Поиск по ФИО, табельному, должности или подразделению")).toBe(input);
    await act(async () => pending.reject(new Error("Сервер недоступен")));
    expect(within(table).getByText(employee.fullName)).toBeInTheDocument();
    expect(input).toHaveValue("Иванов"); expect(screen.getByRole("button", { name: "Повторить загрузку" })).toBeInTheDocument();
  });

  it("ignores a completed save after leaving the employee workspace", async () => {
    const pending = deferred();
    const notify = vi.fn(), repository = { getEmployees: vi.fn().mockResolvedValue(list), createEmployee: vi.fn(() => pending.promise) };
    const view = render(<InventoryRepositoryProvider value={repository as never}><InventoryEmployeesScreen onNotify={notify} onReload={vi.fn()} /></InventoryRepositoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Создать сотрудника" }));
    fireEvent.change(screen.getByLabelText("ФИО"), { target: { value: "Новый сотрудник" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    expect(repository.createEmployee).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => pending.resolve());
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("PPE movement pagination", () => {
  const movement = { lineId: "line-1", itemName: "Каска", employeeName: "Иванов", quantity: 1, unit: "шт", unitPriceMinor: 10000, amountMinor: 10000, status: "issued", createdAt: "2026-10-16" };
  it("loads further pages, retains history on failure and retries", async () => {
    const pending = deferred<any>();
    const repository = { getPpeMovements: vi.fn().mockResolvedValueOnce({ rows: [movement], page: 1, total: 24 }).mockImplementationOnce(() => pending.promise).mockResolvedValue({ rows: [{ ...movement, lineId: "line-2", itemName: "Перчатки" }], page: 2, total: 24 }) };
    render(<InventoryRepositoryProvider value={repository as never}><PpeMovementHistoryPanel title="История" employeeId="e1" pageSize={12} /></InventoryRepositoryProvider>);
    await screen.findByText("Каска");
    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    expect(repository.getPpeMovements).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 12, employeeId: "e1" }));
    expect(screen.getByText("Каска")).toBeInTheDocument();
    await act(async () => pending.reject(new Error("История недоступна")));
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await screen.findByText("Перчатки"); expect(screen.queryByText("Каска")).not.toBeInTheDocument();
  });
  it("clears the previous employee history and ignores its late response", async () => {
    const pending = deferred<any>();
    const repository = { getPpeMovements: vi.fn().mockResolvedValueOnce({ rows: [movement], page: 1, total: 1 }).mockImplementation(() => pending.promise) };
    const ui = (id: string) => <InventoryRepositoryProvider value={repository as never}><PpeMovementHistoryPanel title="История" employeeId={id} pageSize={12} /></InventoryRepositoryProvider>;
    const view = render(ui("e1")); await screen.findByText("Каска");
    view.rerender(ui("e2")); expect(screen.queryByText("Каска")).not.toBeInTheDocument();
    view.unmount(); await act(async () => pending.resolve({ rows: [movement], page: 1, total: 1 }));
    expect(screen.queryByText("Каска")).not.toBeInTheDocument();
  });
});
