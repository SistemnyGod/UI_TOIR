import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustodyActionDialog, type CustodyRecordAction } from "../features/inventory/custody/CustodyActionDialog";
import { CustodyIssueDialog } from "../features/inventory/custody/CustodyIssueDialog";
import { CustodyItemDialog } from "../features/inventory/custody/CustodyItemDialog";
import { CustodyDetailDrawer } from "../features/inventory/custody/custodyDrawer";
import { useCustodyRepositoryActions } from "../features/inventory/custody/useCustodyRepositoryActions";
import { InventoryCustodyScreen } from "../features/inventory/InventoryCustodyScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import type { InventoryCustodyRecordDto, InventoryEmployeeDto, InventoryItemDto } from "../api/contracts";

function deferred<T = void>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const employee = { id: "e1", fullName: "Иванов Иван", personnelNo: "T-1", position: "Слесарь", department: "Участок", employeeGroup: "Атом", status: "active", hiredAt: null, birthDate: null } satisfies InventoryEmployeeDto;
const item = { id: "i1", name: "Шуруповёрт", sku: "IT-1", unit: "шт", isActive: true, category: "Инструменты" } as InventoryItemDto;
const record = { id: "r1", itemId: item.id, itemName: item.name, employeeName: employee.fullName, status: "in_use", quantity: 1, unit: "шт", comment: "Для работы", issuedAt: "2026-10-16", documentId: "d1" } as InventoryCustodyRecordDto;
const action = { row: record, kind: "status", status: "written_off", title: "Списать предмет", confirmLabel: "Провести списание", commentRequired: true, commentLabel: "Причина списания" } satisfies CustodyRecordAction;
function submitForm(button: HTMLElement) { fireEvent.submit(document.getElementById(button.getAttribute("form")!)!); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("custody form ownership", () => {
  it("allows closing a read-only view during a refresh but blocks it while a write is pending", () => {
    const close = vi.fn(), repository = {};
    const ui = (pending: boolean) => <InventoryRepositoryProvider value={repository as never}><CustodyDetailDrawer busyAction="history-r1" pending={pending} drawer={{ type: "history", title: "История предмета", rows: [] }} employees={[]} onClose={close} onArchiveRecord={vi.fn()} onDownload={vi.fn()} onOpenRecordHistory={vi.fn()} onTransferRecord={vi.fn()} onUpdateDocumentState={vi.fn()} onUpdateRecordStatus={vi.fn()} /></InventoryRepositoryProvider>;
    const view = render(ui(false)); fireEvent.keyDown(window, { key: "Escape" }); expect(close).toHaveBeenCalledOnce();
    close.mockClear(); view.rerender(ui(true)); fireEvent.keyDown(window, { key: "Escape" }); expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Закрыть просмотр" })).toBeDisabled();
  });

  it("protects the reason, prevents repeated writes and retains failed input", async () => {
    const pending = deferred(), save = vi.fn(() => pending.promise), close = vi.fn();
    render(<CustodyActionDialog action={action} employees={[employee]} onSubmit={save} onClose={close} />);
    fireEvent.change(screen.getByLabelText("Причина списания"), { target: { value: "Повреждён корпус" } });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    const button = screen.getByRole("button", { name: "Провести списание" });
    act(() => { submitForm(button); submitForm(button); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeDisabled();
    fireEvent.mouseDown(document.querySelector(".modal-backdrop")!); fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error("Строка изменена другим пользователем")));
    expect(screen.getByRole("alert")).toHaveTextContent("Строка изменена другим пользователем");
    expect(screen.getByLabelText("Причина списания")).toHaveValue("Повреждён корпус");
  });

  it("does not replace an unavailable transfer recipient with the first employee", () => {
    const other = { ...employee, id: "e2", fullName: "Петров Пётр" }, save = vi.fn();
    const props = { action: { ...action, kind: "transfer" as const, commentRequired: false }, onSubmit: save, onClose: vi.fn() };
    const view = render(<CustodyActionDialog {...props} employees={[employee, other]} />);
    fireEvent.change(screen.getByLabelText("Новый сотрудник"), { target: { value: "e2" } });
    view.rerender(<CustodyActionDialog {...props} employees={[employee]} />);
    expect(screen.getByLabelText("Новый сотрудник")).toHaveValue("e2");
    submitForm(screen.getByRole("button", { name: "Провести списание" }));
    expect(save).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toHaveTextContent("доступного нового сотрудника");
  });

  it("reaches employees and items after the previous truncation and keeps a failed issue", async () => {
    const employees = Array.from({ length: 120 }, (_, index) => ({ ...employee, id: `e${index}`, fullName: `Сотрудник ${index}` }));
    const items = Array.from({ length: 120 }, (_, index) => ({ ...item, id: `i${index}`, name: `Предмет ${index}` }));
    const save = vi.fn().mockRejectedValue(new Error("Связь прервалась"));
    render(<CustodyIssueDialog employees={employees} items={items} onClose={vi.fn()} onSave={save} />);
    const employeePages = screen.getByRole("navigation", { name: "Страницы сотрудников" }), itemPages = screen.getByRole("navigation", { name: "Страницы предметов" });
    for (let index = 0; index < 4; index++) { fireEvent.click(within(employeePages).getByRole("button", { name: "Вперёд" })); fireEvent.click(within(itemPages).getByRole("button", { name: "Вперёд" })); }
    fireEvent.click(screen.getByRole("button", { name: "Выбрать сотрудника: Сотрудник 119" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать предмет: Предмет 119" }));
    fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: "Выдать для ремонта" } });
    fireEvent.click(screen.getByRole("button", { name: "Выдать под запись" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Связь прервалась");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ employeeId: "e119", itemId: "i119", quantity: 1, warehouseId: null, comment: "Состояние: Исправен. Выдать для ремонта" }));
    expect(screen.getByLabelText("Комментарий")).toHaveValue("Выдать для ремонта");
  });

  it("keeps issue selections explicit when a reference disappears", () => {
    const save = vi.fn(), props = { employees: [employee], onSave: save, onClose: vi.fn() };
    const view = render(<CustodyIssueDialog {...props} items={[item]} />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать сотрудника: Иванов Иван" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать предмет: Шуруповёрт" }));
    view.rerender(<CustodyIssueDialog {...props} items={[]} />);
    const button = screen.getByRole("button", { name: "Выдать под запись" });
    expect(button).toBeDisabled(); submitForm(button);
    expect(save).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toHaveTextContent("Ранее выбранная запись могла измениться");
  });

  it("validates a catalog price, guards dirty input and sends no unused quantity", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Нет доступа")), close = vi.fn();
    render(<CustodyItemDialog onSave={save} onClose={close} />);
    fireEvent.change(screen.getByLabelText("Название предмета"), { target: { value: "Мультиметр" } });
    fireEvent.change(screen.getByLabelText("Идентификатор / инвентарный номер"), { target: { value: "INV-1" } });
    fireEvent.change(screen.getByLabelText("Цена"), { target: { value: "не число" } });
    expect(screen.queryByLabelText("Количество")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Добавить предмет" }));
    expect(save).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toHaveTextContent("неотрицательную цену");
    fireEvent.change(screen.getByLabelText("Цена"), { target: { value: "1 250,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить предмет" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет доступа");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Мультиметр", defaultUnitPriceMinor: 125050, trackingType: "custody" }));
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.getByRole("dialog", { name: "Несохранённые изменения" })).toBeInTheDocument(); expect(close).not.toHaveBeenCalled();
  });

  it("retains the open composer and comment when the workspace refreshes or fails", () => {
    const props = { employees: [employee], items: [item], onNotify: vi.fn(), onReload: vi.fn(), documents: { rows: [], page: 1, pageSize: 25, pageCount: 1, total: 0 } };
    const repository = {};
    const ui = (loading = false, error?: string) => <InventoryRepositoryProvider value={repository as never}><InventoryCustodyScreen {...props} loading={loading} error={error} /></InventoryRepositoryProvider>;
    const view = render(ui());
    fireEvent.click(screen.getByRole("button", { name: "Новая выдача" }));
    const comment = screen.getByLabelText("Комментарий"); fireEvent.change(comment, { target: { value: "Не терять при обновлении" } });
    view.rerender(ui(true)); expect(screen.getByLabelText("Комментарий")).toBe(comment);
    view.rerender(ui(false, "API не ответил")); expect(comment).toHaveValue("Не терять при обновлении");
  });
});

describe("custody request ownership", () => {
  function setup(repository: object, reload = vi.fn().mockResolvedValue(undefined)) {
    const notify = vi.fn(), drawer = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <InventoryRepositoryProvider value={repository as never}>{children}</InventoryRepositoryProvider>;
    const hook = renderHook(() => useCustodyRepositoryActions({ onNotify: notify, onReload: reload, setDrawer: drawer }), { wrapper });
    return { ...hook, notify, drawer, reload };
  }
  it("propagates a rejected record write so the dialog cannot close as a success", async () => {
    const repository = { updateCustodyRecordStatus: vi.fn().mockRejectedValue(new Error("Конфликт версии")) };
    const { result, notify, reload } = setup(repository);
    await act(async () => { await expect(result.current.updateRecordStatus(record, "returned")).rejects.toThrow("Конфликт версии"); });
    expect(notify).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
  });
  it("does not repeat an accepted write when only the follow-up reload fails", async () => {
    const pending = deferred();
    const repository = { updateCustodyRecordStatus: vi.fn(() => pending.promise) };
    const { result } = setup(repository, vi.fn().mockRejectedValue(new Error("Обновление недоступно")));
    let first!: Promise<boolean>;
    act(() => { first = result.current.updateRecordStatus(record, "returned"); });
    await act(async () => { expect(await result.current.updateRecordStatus(record, "returned")).toBe(false); });
    await act(async () => { pending.resolve(); expect(await first).toBe(true); });
    expect(repository.updateCustodyRecordStatus).toHaveBeenCalledOnce(); expect(result.current.actionError).toContain("Операция сохранена");
  });
  it("applies only the latest document read and ignores a response after closing", async () => {
    const old = deferred<any>(), last = deferred<any>();
    const repository = { getCustodyDocument: vi.fn().mockImplementation((id: string) => id === "old" ? old.promise : last.promise), getCustodyDocumentHistory: vi.fn().mockResolvedValue({ rows: [] }) };
    const { result, drawer } = setup(repository);
    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = result.current.openDocument("old"); second = result.current.openDocument("new"); });
    await act(async () => { last.resolve({ id: "new" }); await second; });
    await act(async () => { old.resolve({ id: "old" }); await first; });
    expect(drawer).toHaveBeenCalledTimes(1); expect(drawer).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ id: "new" }) }));
    const late = deferred<any>(); repository.getCustodyDocument.mockImplementation(() => late.promise);
    let third!: Promise<void>; act(() => { third = result.current.openDocument("late"); result.current.closeDrawer(); });
    await act(async () => { late.resolve({ id: "late" }); await third; });
    expect(drawer).toHaveBeenLastCalledWith(null);
  });
  it("ignores a completed mutation after leaving the owner workspace", async () => {
    const pending = deferred(), repository = { archiveCustodyRecord: vi.fn(() => pending.promise) };
    const { result, unmount, notify, reload } = setup(repository);
    let operation!: Promise<boolean>; act(() => { operation = result.current.archiveRecord(record); });
    unmount(); await act(async () => { pending.resolve(); await operation; });
    expect(notify).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
  });
});
