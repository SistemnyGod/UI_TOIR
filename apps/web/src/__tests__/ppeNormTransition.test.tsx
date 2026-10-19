import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryPpeNormRowDto, InventoryPpeNormSetDto, InventoryPpeNormSetDetailDto, PpeIssueDocumentDto, SavePpeIssueDocumentDto } from "../api/contracts";
import { PpeIssueDocumentConstructor } from "../features/inventory/PpeIssueDocumentConstructor";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

const employee = { id: "employee", fullName: "Иванов Иван Иванович", personnelNo: "UI-001", position: "Электромонтёр", department: "Цех", status: "active" as const, employeeGroup: "", hiredAt: null, birthDate: null };
const sizes = { gender: "", height: "", clothingSize: "", shoeSize: "", headSize: "", respiratorSize: "", handProtectionSize: "" };
function norm(id: string): InventoryPpeNormSetDto { return { id, positionName: employee.position, versionName: id, effectiveFrom: "2026-01-01", effectiveTo: null, sourceName: "Проверка", status: "active", version: 1, requiresReview: false, rowsCount: 2 }; }
function row(id: string): InventoryPpeNormRowDto & { unitSymbol: string; periodMonths: number; requirementKey: string; alternativeGroup: string } { return { id, parentRowId: null, rowType: "item", sortOrder: 1, normItemName: `Норма ${id}`, normPoint: "п. 1", issuePeriodText: "12 месяцев", quantity: 2, quantityText: "2 шт.", lifeMonths: 12, unitSymbol: "шт.", periodMonths: 12, requirementKey: id, alternativeGroup: "", mappings: [{ id: `mapping-${id}`, normRowId: id, itemId: `item-${id}`, itemName: `СИЗ ${id}`, itemSku: id, itemUnitSymbol: "шт.", brandModelArticle: "", isApproved: true, isDefault: true, normUnitsPerItem: 1, defaultUnitPriceMinor: 100, comment: "" }] }; }
const rowsA = [row("common"), row("obsolete")], rowsB = [row("common"), row("new")];
const details: Record<string, InventoryPpeNormSetDetailDto> = Object.fromEntries(["A", "B", "C"].map(id => [id, { normSet: norm(id), rows: id === "B" ? rowsB : rowsA, itemRowsCount: 2, mappedItemRowsCount: 2, unmappedItemRowsCount: 0 }]));
const source: PpeIssueDocumentDto = { id: "document", version: 1, status: "draft", createdAt: "2026-10-16T08:00:00Z", confirmedAt: null, content: { employee: { ...employee, details: sizes }, normSetId: "A", normSetVersion: 1, normVersionName: "A", normSourceName: "Проверка", documentDate: "2026-10-16", responsibleName: "Оператор", basis: "Приказ", normRows: rowsA, lines: rowsA.map(value => ({ id: `line-${value.id}`, normRowId: value.id, itemId: `item-${value.id}`, itemName: `СИЗ ${value.id}`, unitSymbol: "шт.", brandModelArticle: "", normUnitsPerItem: 1, totalMinor: 300, issueDate: "2026-10-16", lifeMonths: 12, quantity: 3, unitPriceMinor: 100, sizeText: "XL", exceptionReason: "Проверено", manualControlConfirmed: true })) }, validation: { errors: [], warnings: [], entitlements: [], totalMinor: 600 } };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (value: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { for (const storage of ["localStorage", "sessionStorage"]) { const data = new Map<string, string>(); vi.stubGlobal(storage, { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }); } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(options: { initialDetail?: InventoryPpeNormSetDetailDto; waitReady?: boolean } = {}) {
  localStorage.setItem("patrol360.inventory.ppe.issue-document.owner", source.id);
  const repository = createMockInventoryRepository(); let stored = source;
  vi.spyOn(repository, "getEmployee").mockResolvedValue(employee);
  vi.spyOn(repository, "getEmployees").mockResolvedValue({ rows: [employee], total: 1, page: 1, pageSize: 50, pageCount: 1 });
  const list = vi.spyOn(repository, "getPpeIssueDocumentNorms").mockResolvedValue([norm("A"), norm("B"), norm("C")]);
  const normDetails: Record<string, InventoryPpeNormSetDetailDto> = { ...details, A: options.initialDetail ?? details.A };
  const detail = vi.spyOn(repository, "getPpeNormSet").mockImplementation(async id => normDetails[id]);
  vi.spyOn(repository, "getPpeIssueDocument").mockImplementation(async () => stored);
  vi.spyOn(repository, "getPpeIssueDocuments").mockResolvedValue([]);
  const update = vi.spyOn(repository, "updatePpeIssueDocument").mockImplementation(async (_id, payload) => { stored = saved(payload, stored.version + 1, normDetails); return stored; });
  const view = (owner = "owner") => <StrictMode><InventoryRepositoryProvider value={repository}><PpeIssueDocumentConstructor currentUserId={owner} canManage onNavigate={vi.fn()} onNotify={vi.fn()} /></InventoryRepositoryProvider></StrictMode>;
  const rendered = render(view()); await screen.findByRole("heading", { name: "Проверка данных" });
  if (options.waitReady !== false) { await waitFor(() => expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Уточнить характеристики" })); }
  return { repository, list, detail, update, view, ...rendered };
}
function saved(payload: SavePpeIssueDocumentDto, version: number, normDetails = details): PpeIssueDocumentDto {
  return { ...source, version, content: { ...source.content, normSetId: payload.normSetId, normRows: normDetails[payload.normSetId].rows as typeof source.content.normRows, documentDate: payload.documentDate, responsibleName: payload.responsibleName, basis: payload.basis, employee: { ...source.content.employee, details: payload.employeeDetails ?? sizes }, lines: payload.lines.map(line => ({ ...source.content.lines[0], ...line, itemName: `СИЗ ${line.normRowId}`, unitSymbol: "шт." })) } };
}
describe("PPE norm transitions in the document constructor", () => {
  it("keeps the saved snapshot until a changed server composition is explicitly accepted", async () => {
    const { update } = await setup({ initialDetail: { ...details.B, normSet: norm("A") }, waitReady: false });
    await screen.findByRole("dialog", { name: "Изменить нормативный набор?" }); fireEvent.click(screen.getByRole("button", { name: "Вернуться" }));
    expect(screen.getByText("Норма obsolete")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled(); expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Проверить актуальный состав" })); await screen.findByRole("dialog", { name: "Изменить нормативный набор?" }); fireEvent.click(screen.getByRole("button", { name: "Применить норму" }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce()); expect(update.mock.calls[0][1].lines.map(line => line.normRowId)).toEqual(["common"]);
  });
  it("requires acknowledgement before clearing a selected norm and its positions", async () => {
    const { update } = await setup(), user = userEvent.setup(), select = screen.getByRole("combobox", { name: "Нормативный набор" });
    await user.selectOptions(select, ""); await screen.findByRole("dialog", { name: "Изменить нормативный набор?" }); fireEvent.click(screen.getByRole("button", { name: "Вернуться" })); expect(select).toHaveValue("A");
    await user.selectOptions(select, ""); fireEvent.click(await screen.findByRole("button", { name: "Снять норму" })); expect(select).toHaveValue(""); expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled(); expect(update).not.toHaveBeenCalled();
  });
  it("rejects a response belonging to a different norm", async () => {
    const { detail, update } = await setup(), user = userEvent.setup(); detail.mockResolvedValueOnce(details.C);
    await user.selectOptions(screen.getByRole("combobox", { name: "Нормативный набор" }), "B"); await screen.findByText(/Сервер вернул состав другой нормы/);
    expect(screen.getByRole("combobox", { name: "Нормативный набор" })).toHaveValue("A"); expect(update).not.toHaveBeenCalled();
  });
  it("does not save a candidate ID before its contents are accepted and keeps input on cancellation", async () => {
    const { detail, update } = await setup(), gate = deferred<InventoryPpeNormSetDetailDto>(), user = userEvent.setup();
    detail.mockImplementation(id => id === "B" ? gate.promise : Promise.resolve(details[id]));
    await user.selectOptions(screen.getByRole("combobox", { name: "Нормативный набор" }), "B");
    fireEvent.change(screen.getByLabelText("Основание"), { target: { value: "Введено во время загрузки" } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); }); expect(update).not.toHaveBeenCalled();
    await act(async () => gate.resolve(details.B)); expect(screen.getByRole("dialog", { name: "Изменить нормативный набор?" })).toBeInTheDocument(); expect(screen.getByText("СИЗ obsolete")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Вернуться" }));
    expect(screen.getByRole("combobox", { name: "Нормативный набор" })).toHaveValue("A"); expect(screen.getByLabelText("Основание")).toHaveValue("Введено во время загрузки");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" })); await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toMatchObject({ normSetId: "A", lines: expect.arrayContaining([expect.objectContaining({ normRowId: "obsolete", quantity: 3, sizeText: "XL" })]) });
  });
  it("applies the accepted composition atomically and retains quantities, sizes and comments of surviving lines", async () => {
    const { update } = await setup(), user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "Нормативный набор" }), "B");
    await screen.findByRole("dialog", { name: "Изменить нормативный набор?" }); fireEvent.click(screen.getByRole("button", { name: "Применить норму" }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    const payload = update.mock.calls[0][1]; expect(payload.normSetId).toBe("B"); expect(payload.acceptNormChange).toBe(true); expect(payload.lines.map(line => line.normRowId)).toEqual(["common", "new"]);
    expect(payload.lines[0]).toMatchObject({ quantity: 3, sizeText: "XL", exceptionReason: "Проверено", manualControlConfirmed: true }); expect(payload.lines[1]).toMatchObject({ itemId: "item-new", quantity: 2 });
    expect(screen.queryByText(/Смена нормы отменена/)).not.toBeInTheDocument();
  });
  it("restores the previous selection after a fetch error and allows a deliberate retry", async () => {
    const { detail } = await setup(), user = userEvent.setup();
    detail.mockRejectedValueOnce(new Error("Не удалось получить новую норму")); await user.selectOptions(screen.getByRole("combobox", { name: "Нормативный набор" }), "B");
    await screen.findByText("Не удалось получить новую норму"); expect(screen.getByRole("combobox", { name: "Нормативный набор" })).toHaveValue("A");
    fireEvent.click(screen.getByRole("button", { name: "Повторить состав нормы" }));
    const confirmation = await screen.findByRole("dialog", { name: "Изменить нормативный набор?" });
    await waitFor(() => expect(confirmation.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.getByRole("combobox", { name: "Нормативный набор" })).toHaveValue("A");
  });
  it("ignores a late B response after the user selects C and returns to A", async () => {
    const { detail } = await setup(), gate = deferred<InventoryPpeNormSetDetailDto>(), user = userEvent.setup();
    detail.mockImplementation(id => id === "B" ? gate.promise : Promise.resolve(details[id]));
    const select = screen.getByRole("combobox", { name: "Нормативный набор" }); await user.selectOptions(select, "B"); await user.selectOptions(select, "C"); await waitFor(() => expect(select).toHaveValue("C"));
    await user.selectOptions(select, "A"); await act(async () => gate.resolve(details.B)); expect(select).toHaveValue("A"); expect(screen.queryByRole("dialog", { name: "Изменить нормативный набор?" })).not.toBeInTheDocument();
  });
  it("keeps an unavailable norm and its lines visible instead of silently clearing them after a date change", async () => {
    const { list, update } = await setup(); list.mockResolvedValueOnce([]);
    fireEvent.change(screen.getByLabelText("Дата документа"), { target: { value: "2026-10-17" } }); await screen.findByText(/Текущая норма недоступна для сотрудника/);
    expect(screen.getByRole("combobox", { name: "Нормативный набор" })).toHaveValue("A"); expect(screen.getByRole("option", { name: /Текущий выбор:/ })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled(); expect(update).not.toHaveBeenCalled();
  });
  it("preserves the document when loading the applicable list fails, and recovers through retry", async () => {
    const { list } = await setup(); list.mockRejectedValueOnce(new Error("Список временно недоступен"));
    fireEvent.change(screen.getByLabelText("Дата документа"), { target: { value: "2026-10-17" } }); await screen.findByText("Список временно недоступен");
    expect(screen.getByRole("combobox", { name: "Нормативный набор" })).toHaveValue("A"); expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Повторить список норм" })); await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeEnabled());
  });
  it("does not apply a pending composition to another user", async () => {
    const { detail, rerender, view } = await setup(), gate = deferred<InventoryPpeNormSetDetailDto>(), user = userEvent.setup(); detail.mockImplementation(id => id === "B" ? gate.promise : Promise.resolve(details[id]));
    await user.selectOptions(screen.getByRole("combobox", { name: "Нормативный набор" }), "B"); rerender(view("other")); await act(async () => gate.resolve(details.B));
    expect(screen.queryByRole("dialog", { name: "Изменить нормативный набор?" })).not.toBeInTheDocument(); expect(screen.getByRole("combobox", { name: "Нормативный набор" })).toHaveValue("");
  });
});
