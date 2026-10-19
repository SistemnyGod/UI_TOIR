import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DocumentActions } from "../features/inventory/ppe/DocumentActions";
import { DocumentReview } from "../features/inventory/ppe/DocumentReview";
import { PpeIssueDocumentConstructor } from "../features/inventory/PpeIssueDocumentConstructor";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import type { InventoryPpeNormSetDto, PpeIssueDocumentDto, SavePpeIssueDocumentDto } from "../api/contracts";

const employee = { id: "employee", fullName: "Иванов Иван Иванович", personnelNo: "UI-001", department: "Цех", position: "Электромонтёр", status: "active" };
const details = { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" };
const norm: InventoryPpeNormSetDto = { id: "norm", positionName: employee.position, versionName: "2026", effectiveFrom: "2026-01-01", effectiveTo: null, sourceName: "Проверка", requiresReview: false, version: 1, status: "active", rowsCount: 1 };
const row = { id: "row", parentRowId: null, rowType: "item" as const, sortOrder: 1, normItemName: "Каска", normPoint: "п. 1", issuePeriodText: "12 месяцев", quantity: 1, quantityText: "1 шт.", lifeMonths: 12, unitSymbol: "шт.", periodMonths: 12, requirementKey: "requirement", alternativeGroup: "", mappings: [] };
const document: PpeIssueDocumentDto = { id: "document", version: 1, status: "draft", createdAt: "2026-10-16T08:00:00Z", confirmedAt: null, content: { employee: { ...employee, details }, normSetId: "norm", normSetVersion: 1, normVersionName: "2026", normSourceName: "Проверка", documentDate: "2026-10-16", responsibleName: "Оператор", basis: "Приказ", normRows: [row], lines: [{ id: "line", normRowId: "row", itemId: "item", itemName: "Каска", unitSymbol: "шт.", brandModelArticle: "", normUnitsPerItem: 1, totalMinor: 100, issueDate: "2026-10-16", lifeMonths: 12, quantity: 1, unitPriceMinor: 100, sizeText: "", exceptionReason: "", manualControlConfirmed: false }] }, validation: { errors: [], warnings: [], entitlements: [], totalMinor: 100 } } as PpeIssueDocumentDto;
function deferred<T>() { let resolve!: (value: T) => void, reject!: (value: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => {
  for (const storage of ["localStorage", "sessionStorage"]) {
    const values = new Map<string, string>();
    vi.stubGlobal(storage, { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function constructor() {
  localStorage.setItem("patrol360.inventory.ppe.issue-document.owner", document.id);
  const repository = createMockInventoryRepository(), notify = vi.fn(), navigate = vi.fn();
  vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: [employee], total: 1, page: 1, pageSize: 50, pageCount: 1 } as never);
  vi.spyOn(repository, "getPpeIssueDocument").mockResolvedValue(document);
  vi.spyOn(repository, "getPpeIssueDocumentNorms").mockResolvedValue([norm] as never);
  vi.spyOn(repository, "getPpeNormSet").mockResolvedValue({ normSet: norm, rows: [row] } as never);
  vi.spyOn(repository, "getPpeIssueDocuments").mockResolvedValue([]);
  const view = (owner = "owner") => <InventoryRepositoryProvider value={repository}><PpeIssueDocumentConstructor currentUserId={owner} canManage canExport onNavigate={navigate} onNotify={notify} /></InventoryRepositoryProvider>;
  return { repository, notify, navigate, view };
}
describe("PPE draft persistence and document commands", () => {
  it("keeps an in-flight norm list when a new issue retains the same employee", async () => {
    const { repository, view } = constructor(), norms = deferred<typeof norm[]>(), user = userEvent.setup();
    vi.mocked(repository.getPpeIssueDocumentNorms).mockImplementation(() => norms.promise);
    render(view("new-owner"));
    await user.click(screen.getByRole("combobox", { name: "Сотрудник" })); await user.click(await screen.findByRole("option", { name: /Иванов Иван Иванович/ }));
    await user.click(screen.getByRole("button", { name: "Действия" })); await user.click(screen.getByRole("button", { name: "Новая выдача" })); await user.click(screen.getByRole("button", { name: "Начать новую выдачу" }));
    await act(async () => norms.resolve([norm]));
    expect(screen.getByRole("option", { name: "Электромонтёр · 2026" })).toBeInTheDocument();
  });
  it("protects unsaved input when returning to the journal", async () => {
    const { view, navigate } = constructor(); render(view());
    await screen.findByRole("heading", { name: "Проверка данных" }); await waitFor(() => expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    const price = await screen.findByLabelText("Цена, руб."); fireEvent.change(price, { target: { value: "12,,50" } });
    fireEvent.click(screen.getByRole("button", { name: "К журналу" })); fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    expect(price).toHaveValue("12,,50"); expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "К журналу" })); fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" })); await waitFor(() => expect(navigate).toHaveBeenCalledWith("inventory-ppe"));
  });
  it("keeps the employee and typed basis when changing employee is cancelled", async () => {
    const { repository, view } = constructor(), user = userEvent.setup();
    vi.mocked(repository.getEmployees).mockResolvedValue({ rows: [employee, { ...employee, id: "other-employee", fullName: "Петров Пётр Петрович", personnelNo: "UI-002" }], total: 2, page: 1, pageSize: 50, pageCount: 1 } as never);
    render(view()); await screen.findByRole("heading", { name: "Проверка данных" }); await user.click(screen.getByRole("button", { name: "Уточнить характеристики" }));
    fireEvent.change(screen.getByLabelText("Основание"), { target: { value: "Несохранённое основание" } });
    await user.click(screen.getByRole("combobox", { name: "Сотрудник" })); await user.click(await screen.findByRole("option", { name: /Петров Пётр Петрович/ }));
    expect(screen.getByRole("dialog", { name: "Сменить сотрудника?" })).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Вернуться" }));
    expect(screen.getByLabelText("Основание")).toHaveValue("Несохранённое основание"); expect(screen.getByRole("combobox", { name: "Сотрудник" })).toHaveValue("Иванов Иван Иванович · UI-001");
  });
  it("keeps typing during a slow save and validates the latest input with the new version", async () => {
    const { repository, view } = constructor(), first = deferred<PpeIssueDocumentDto>();
    let stored = document;
    const update = vi.spyOn(repository, "updatePpeIssueDocument").mockImplementationOnce(() => first.promise).mockImplementation(async (_id, payload) => { stored = saved(payload, 3); return stored; });
    const validate = vi.spyOn(repository, "validatePpeIssueDocument").mockImplementation(async () => stored);
    render(view()); await screen.findByRole("heading", { name: "Проверка данных" }); await waitFor(() => expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    const quantity = await screen.findByLabelText("Количество"); quantity.focus(); fireEvent.change(quantity, { target: { value: "2" } });
    await waitFor(() => expect(update).toHaveBeenCalledOnce()); expect(quantity).toBeEnabled(); expect(quantity).toHaveFocus();
    fireEvent.change(quantity, { target: { value: "3" } });
    await act(async () => first.resolve(saved(update.mock.calls[0][1], 2)));
    expect(quantity).toHaveValue(3);
    fireEvent.click(screen.getByRole("button", { name: "Предпросмотр документов" }));
    await screen.findByRole("heading", { name: "Предпросмотр и печать" });
    expect(update).toHaveBeenCalledTimes(2); expect(update.mock.calls[1][1]).toMatchObject({ expectedVersion: 2, lines: [expect.objectContaining({ quantity: 3 })] }); expect(validate).toHaveBeenCalledOnce();
  });
  it("recovers a cancelled document after a lost response without sending another cancel", async () => {
    const { repository, view } = constructor(); const cancelled = { ...document, status: "cancelled", version: 2 };
    const cancel = vi.spyOn(repository, "cancelPpeIssueDocument").mockImplementation(async () => { vi.mocked(repository.getPpeIssueDocument).mockResolvedValue(cancelled); throw new Error("Потерян ответ"); });
    render(view()); await screen.findByRole("heading", { name: "Проверка данных" }); fireEvent.click(screen.getByRole("button", { name: "Действия" }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить черновик" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Отменить черновик выдачи?" })).getByRole("button", { name: "Отменить черновик" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByText(/Черновик отменён/).length).toBeGreaterThan(0); expect(cancel).toHaveBeenCalledOnce();
  });
  it("ignores confirmation completion after another user opens the workspace", async () => {
    const { repository, view, notify } = constructor(), request = deferred<PpeIssueDocumentDto>();
    vi.spyOn(repository, "validatePpeIssueDocument").mockResolvedValue(document);
    vi.spyOn(repository, "confirmPpeIssueDocument").mockImplementation(() => request.promise);
    const { rerender } = render(view()); await screen.findByRole("heading", { name: "Проверка данных" }); await waitFor(() => expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(await screen.findByRole("button", { name: "Предпросмотр документов" })); await screen.findByRole("heading", { name: "Предпросмотр и печать" });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить выдачу" })); fireEvent.click(within(screen.getByRole("dialog", { name: "Подтвердить выдачу СИЗ?" })).getByRole("button", { name: "Подтвердить выдачу" }));
    rerender(view("other")); await act(async () => request.resolve({ ...document, version: 2, status: "confirmed" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.getByRole("combobox", { name: "Сотрудник" })).toHaveValue(""); expect(notify).not.toHaveBeenCalledWith("Документ выдачи подтверждён");
  });
});
describe("PPE action dialogs", () => {
  function actions(overrides: Partial<Parameters<typeof DocumentActions>[0]> = {}) {
    const props = { contextKey: "document", busy: false, draft: true, hasUnsavedChanges: true, onNew: vi.fn(() => true), onCancel: vi.fn(async () => true), onMigrate: vi.fn(async () => true), ...overrides };
    const result = render(<DocumentActions {...props} />); fireEvent.click(screen.getByRole("button", { name: "Действия" })); return { ...result, props };
  }
  it("protects a typed migration ID and restores the same input after cancelled dismissal", () => {
    actions(); fireEvent.click(screen.getByText("Перенести старый черновик")); fireEvent.change(screen.getByLabelText("Идентификатор карточки"), { target: { value: "card-42" } });
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" })); expect(screen.getByLabelText("Идентификатор карточки")).toHaveValue("card-42");
  });
  it("retains a migration error inside the confirmation, blocks duplicates and permits a retry", async () => {
    const request = deferred<boolean>(), migrate = vi.fn().mockImplementationOnce(() => request.promise).mockResolvedValue(true);
    actions({ onMigrate: migrate }); fireEvent.click(screen.getByText("Перенести старый черновик")); fireEvent.change(screen.getByLabelText("Идентификатор карточки"), { target: { value: "card-42" } }); fireEvent.click(screen.getByRole("button", { name: "Перенести черновик" }));
    const confirm = screen.getByRole("dialog", { name: "Перенести старый черновик?" }), button = within(confirm).getByRole("button", { name: "Перенести черновик" }); fireEvent.click(button); fireEvent.click(button); fireEvent.keyDown(window, { key: "Escape" });
    expect(migrate).toHaveBeenCalledOnce(); expect(within(confirm).getByRole("button", { name: "Закрыть" })).toBeDisabled();
    await act(async () => request.reject(new Error("Карточка изменена другим пользователем")));
    expect(within(confirm).getByRole("alert")).toHaveTextContent("Карточка изменена"); fireEvent.click(within(confirm).getByRole("button", { name: "Вернуться" }));
    expect(screen.getByLabelText("Идентификатор карточки")).toHaveValue("card-42");
    fireEvent.click(screen.getByRole("button", { name: "Перенести черновик" })); fireEvent.click(within(screen.getByRole("dialog", { name: "Перенести старый черновик?" })).getByRole("button", { name: "Перенести черновик" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(migrate).toHaveBeenLastCalledWith("card-42");
  });
  it("starts a new issue only after explicit acknowledgement of unsaved changes", async () => {
    const { props } = actions(); fireEvent.click(screen.getByRole("button", { name: "Новая выдача" })); expect(props.onNew).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Вернуться" })); fireEvent.click(screen.getByRole("button", { name: "Новая выдача" })); fireEvent.click(screen.getByRole("button", { name: "Начать новую выдачу" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(props.onNew).toHaveBeenCalledOnce();
  });
});
describe("PPE review confirmation", () => {
  it("keeps the confirmation on a server error and permits a deliberate retry", async () => {
    const request = deferred<boolean>(), confirm = vi.fn().mockImplementationOnce(() => request.promise).mockResolvedValue(true);
    render(<DocumentReview document={document} busy={false} canExport canManage hasErrors={false} previewType="norms" previewUrl="" onConfirm={confirm} onPreview={vi.fn()} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить выдачу" }));
    const dialog = screen.getByRole("dialog", { name: "Подтвердить выдачу СИЗ?" }), submit = within(dialog).getByRole("button", { name: "Подтвердить выдачу" }); fireEvent.click(submit); fireEvent.click(submit); fireEvent.keyDown(window, { key: "Escape" });
    expect(confirm).toHaveBeenCalledOnce(); await act(async () => request.reject(new Error("Версия документа устарела")));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Версия документа устарела"); fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить выдачу" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(confirm).toHaveBeenCalledTimes(2);
  });
});
function saved(payload: SavePpeIssueDocumentDto, version: number): PpeIssueDocumentDto {
  return { ...document, version, content: { ...document.content, documentDate: payload.documentDate, responsibleName: payload.responsibleName, basis: payload.basis, employee: { ...document.content.employee, details: payload.employeeDetails ?? details }, lines: payload.lines.map(line => ({ ...document.content.lines[0], ...line, itemName: "Каска", unitSymbol: "шт." })) } };
}
