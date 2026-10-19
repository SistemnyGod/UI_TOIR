import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NormEditorDialog } from "../features/inventory/ppe/norms/NormEditorDialog";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import type { NormEditorSelection } from "../features/inventory/ppe/norms/normEditorModel";
import type { InventoryPpeNormRowDto, InventoryPpeNormSetDto } from "../api/contracts";

const norm: InventoryPpeNormSetDto = { id: "norm", positionName: "Испытатель", versionName: "Контрольный источник", sourceName: "Проверка", status: "draft", version: 7, rowsCount: 1, requiresReview: true, effectiveFrom: "2026-01-01", effectiveTo: null, departmentName: "Цех", positionAliases: ["Испытатель"] };
const row: InventoryPpeNormRowDto = { id: "row", rowType: "item", parentRowId: null, sortOrder: 1, normItemName: "Каска защитная", normPoint: "п. 1", issuePeriodText: "12 месяцев", quantity: 1, quantityText: "1 шт.", unitSymbol: "шт.", periodMonths: 12, lifeMonths: 12, alternativeGroup: "", previousRequirementRowId: null, mappings: [{ id: "mapping", normRowId: "row", itemId: "item", itemName: "Каска промышленная", itemSku: "UI-001", itemUnitSymbol: "шт.", brandModelArticle: "Модель", defaultUnitPriceMinor: 125050, isDefault: true, comment: "", isApproved: false, normUnitsPerItem: 1, approvalEvidence: "" }] };
const selections = { scope: { kind: "scope", normSet: norm }, rules: { kind: "rules", normSetId: norm.id, version: 7, row }, approval: { kind: "approval", normSetId: norm.id, version: 7, row, mapping: row.mappings[0] } } satisfies Record<string, NormEditorSelection>;
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(selection: NormEditorSelection, canManage = true) {
  const repository = createMockInventoryRepository(), onClose = vi.fn(), onSaved = vi.fn(async () => undefined), onNotify = vi.fn();
  const scope = vi.spyOn(repository, "updatePpeNormSetScope").mockResolvedValue(norm), rules = vi.spyOn(repository, "updatePpeNormRowRules").mockResolvedValue(row), approve = vi.spyOn(repository, "approvePpeNormMapping").mockResolvedValue(row.mappings[0]);
  const result = render(<StrictMode><InventoryRepositoryProvider value={repository}><NormEditorDialog selection={selection} canManage={canManage} onClose={onClose} onSaved={onSaved} onNotify={onNotify} /></InventoryRepositoryProvider></StrictMode>);
  return { ...result, repository, scope, rules, approve, onClose, onSaved, onNotify };
}
describe("PPE norm editor dialogs", () => {
  it.each(["Escape", "close", "backdrop", "cancel"])("protects a changed rule through %s and resumes editing", async method => {
    const { onClose } = setup(selections.rules), editor = screen.getByRole("dialog", { name: "Правила строки нормы" });
    fireEvent.change(screen.getByLabelText("Пункт нормы"), { target: { value: "Несохранённое основание" } });
    if (method === "Escape") fireEvent.keyDown(window, { key: "Escape" }); else if (method === "close") fireEvent.click(within(editor).getByRole("button", { name: "Закрыть" })); else if (method === "backdrop") fireEvent.mouseDown(editor.parentElement!); else fireEvent.click(within(editor).getByRole("button", { name: "Отмена" }));
    const guard = await screen.findByRole("dialog", { name: "Несохранённые изменения" }); expect(onClose).not.toHaveBeenCalled(); fireEvent.click(within(guard).getByRole("button", { name: "Продолжить редактирование" })); expect(screen.getByLabelText("Пункт нормы")).toHaveValue("Несохранённое основание");
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" })); expect(onClose).toHaveBeenCalledOnce();
  });
  it("blocks invalid scope dates and sends only explicit positions with the opening version", async () => {
    const { scope, onClose } = setup(selections.scope), submit = screen.getByRole("button", { name: "Подтвердить область" });
    fireEvent.change(screen.getByLabelText(/^Действует до/), { target: { value: "2025-12-31" } }); expect(submit).toBeDisabled(); expect(screen.getByText(/окончание не может быть раньше/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Действует до/), { target: { value: "2026-12-31" } }); fireEvent.change(screen.getByLabelText(/Применимые должности/), { target: { value: " Испытатель\n\n  Старший испытатель " } }); fireEvent.click(submit);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(scope).toHaveBeenCalledExactlyOnceWith("norm", expect.objectContaining({ expectedVersion: 7, positionAliases: ["Испытатель", "Старший испытатель"], effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", updateDates: true }));
  });
  it("retains decimal input and rejects invalid quantities, periods and historic identifiers", async () => {
    const { rules, onClose } = setup(selections.rules), submit = screen.getByRole("button", { name: "Сохранить правила" });
    const quantity = screen.getByLabelText(/Количество по норме/), period = screen.getByLabelText("Период, мес.");
    for (const invalid of ["0", "-1", "1.2345", "Infinity", "1000000000"]) { fireEvent.change(quantity, { target: { value: invalid } }); expect(submit).toBeDisabled(); expect(quantity).toHaveValue(invalid); }
    fireEvent.change(quantity, { target: { value: "1,5" } }); for (const invalid of ["0", "1.5", "1201"]) { fireEvent.change(period, { target: { value: invalid } }); expect(submit).toBeDisabled(); }
    fireEvent.change(period, { target: { value: "" } }); fireEvent.change(screen.getByLabelText(/Предыдущее требование/), { target: { value: "wrong-id" } }); expect(submit).toBeDisabled(); fireEvent.change(screen.getByLabelText(/Предыдущее требование/), { target: { value: "" } }); fireEvent.click(submit);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(rules).toHaveBeenCalledExactlyOnceWith("row", expect.objectContaining({ expectedVersion: 7, quantity: 1.5, periodMonths: null, lifeMonths: 12, previousRequirementRowId: null }));
  });
  it("requires a deliberate mapping approval with evidence and a positive conversion", async () => {
    const { approve, onClose } = setup(selections.approval), submit = screen.getByRole("button", { name: "Подтвердить товар" }); expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Основание проверки/), { target: { value: " Проверено по паспорту и сертификату " } });
    for (const invalid of ["0", "1.1234567", "1000001", "NaN"]) { fireEvent.change(screen.getByLabelText(/Коэффициент пересчёта/), { target: { value: invalid } }); expect(submit).toBeDisabled(); }
    fireEvent.change(screen.getByLabelText(/Коэффициент пересчёта/), { target: { value: "0,125" } }); fireEvent.click(submit); await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(approve).toHaveBeenCalledExactlyOnceWith("row", expect.objectContaining({ expectedNormVersion: 7, itemId: "item", normUnitsPerItem: 0.125, evidence: "Проверено по паспорту и сертификату", brandModelArticle: "Модель", defaultUnitPriceMinor: 125050 }));
  });
  it("blocks duplicate saving and closing, then keeps all values and the old version on rejection", async () => {
    const { scope, onClose } = setup(selections.scope), gate = deferred<typeof norm>(); scope.mockReturnValueOnce(gate.promise);
    const department = screen.getByLabelText("Подразделение"), submit = screen.getByRole("button", { name: "Подтвердить область" }); fireEvent.change(department, { target: { value: "Мой ввод" } }); fireEvent.click(submit); fireEvent.click(submit);
    expect(scope).toHaveBeenCalledOnce(); expect(department).toBeDisabled(); fireEvent.keyDown(window, { key: "Escape" }); expect(onClose).not.toHaveBeenCalled();
    await act(async () => gate.reject(new Error("Норма изменена другим пользователем"))); expect(screen.getByRole("alert")).toHaveTextContent("Норма изменена другим пользователем"); expect(department).toHaveValue("Мой ввод"); expect(department).toBeEnabled();
    fireEvent.click(submit); await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(scope.mock.calls[1][1]).toMatchObject({ expectedVersion: 7, departmentName: "Мой ввод" });
  });
  it("separates an accepted write from a failed refresh and does not repeat it", async () => {
    const { scope, onSaved, onClose, onNotify } = setup(selections.scope); onSaved.mockRejectedValueOnce(new Error("Сбой обновления")); fireEvent.click(screen.getByRole("button", { name: "Подтвердить область" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(scope).toHaveBeenCalledOnce(); expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("Изменения сохранены")); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("preserves mapping details when explicitly making it primary and explains the approval reset", async () => {
    const mapping = { ...row.mappings[0], brandModelArticle: "Сохранённая модель", comment: "Сохранённое основание", defaultUnitPriceMinor: 77777, isApproved: true }, selection = { ...selections.approval, kind: "primary" as const, mapping };
    const { repository, onClose } = setup(selection); vi.spyOn(repository, "getPpeNormSet").mockResolvedValue({ normSet: norm, rows: [{ ...row, mappings: [mapping] }], itemRowsCount: 1, mappedItemRowsCount: 1, unmappedItemRowsCount: 0 }); const save = vi.spyOn(repository, "upsertPpeNormRowMapping").mockResolvedValue(mapping);
    expect(screen.getByText(/сервер снимет утверждение/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Сделать основным" })); await waitFor(() => expect(onClose).toHaveBeenCalledOnce()); expect(save).toHaveBeenCalledExactlyOnceWith(row.id, { itemId: mapping.itemId, isDefault: true, brandModelArticle: mapping.brandModelArticle, defaultUnitPriceMinor: 77777, comment: mapping.comment });
  });
  it("does not overwrite a primary mapping changed after opening", async () => {
    const { repository, onClose } = setup({ ...selections.approval, kind: "primary" }); vi.spyOn(repository, "getPpeNormSet").mockResolvedValue({ normSet: { ...norm, version: 8 }, rows: [row], itemRowsCount: 1, mappedItemRowsCount: 1, unmappedItemRowsCount: 0 }); const save = vi.spyOn(repository, "upsertPpeNormRowMapping"); fireEvent.click(screen.getByRole("button", { name: "Сделать основным" })); await screen.findByText(/Соответствие изменилось после открытия/); expect(save).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });
  it("does not start a write if the primary-mapping preflight belongs to an unmounted editor", async () => {
    const { repository, unmount, onNotify } = setup({ ...selections.approval, kind: "primary" }), gate = deferred<Awaited<ReturnType<typeof repository.getPpeNormSet>>>(); vi.spyOn(repository, "getPpeNormSet").mockReturnValue(gate.promise); const save = vi.spyOn(repository, "upsertPpeNormRowMapping"); fireEvent.click(screen.getByRole("button", { name: "Сделать основным" })); unmount(); await act(async () => gate.resolve({ normSet: norm, rows: [row], itemRowsCount: 1, mappedItemRowsCount: 1, unmappedItemRowsCount: 0 })); expect(save).not.toHaveBeenCalled(); expect(onNotify).not.toHaveBeenCalled();
  });
  it.each([selections.scope, selections.rules, selections.approval])("shows a readonly editor without write actions: $kind", selection => {
    const { scope, rules, approve } = setup(selection, false); expect(screen.queryByRole("button", { name: /Подтвердить|Сохранить/ })).not.toBeInTheDocument();
    for (const input of screen.getAllByRole("textbox")) expect(input).toBeDisabled(); expect(scope).not.toHaveBeenCalled(); expect(rules).not.toHaveBeenCalled(); expect(approve).not.toHaveBeenCalled();
  });
});
