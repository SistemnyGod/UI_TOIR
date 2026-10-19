import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryPpeNormSetDto, InventoryPpeNormSetDetailDto, PpeKitTemplateDto } from "../api/contracts";
import { LegacyTemplatesAdmin } from "../features/inventory/ppe/LegacyTemplatesAdmin";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

const norm = (id: string): InventoryPpeNormSetDto => ({ id, positionName: "Испытатель", versionName: id, sourceName: "Тестовый источник", status: "draft", version: 7, requiresReview: true, rowsCount: 1, departmentName: "Цех", effectiveFrom: "2026-01-01", effectiveTo: null });
function detail(id: string): InventoryPpeNormSetDetailDto { return { normSet: norm(id), rows: [{ id: "row-" + id, parentRowId: null, rowType: "item", sortOrder: 1, normItemName: "Каска защитная " + id, normPoint: "п. 1", issuePeriodText: "12 месяцев", quantity: 1, quantityText: "1 шт.", lifeMonths: 12, unitSymbol: "шт.", mappings: [{ id: "mapping-" + id, normRowId: "row-" + id, itemId: "item-" + id, itemName: "Каска " + id, itemSku: id, itemUnitSymbol: "шт.", brandModelArticle: "", defaultUnitPriceMinor: 100000, isDefault: true, comment: "", isApproved: false, normUnitsPerItem: .5 }] }], itemRowsCount: 1, mappedItemRowsCount: 1, unmappedItemRowsCount: 0 }; }
const template: PpeKitTemplateDto = { id: "legacy", name: "Старый комплект", normSetId: "", ownerUserId: "", ownerName: "", isShared: false, version: 2, updatedAt: "2026-10-16T08:00:00Z", lines: [{ normRowId: "old-row", itemId: "old-item", itemName: "Исходный предмет", unitSymbol: "шт.", quantity: 3, lifeMonths: 12, unitPriceMinor: 100000 }] };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function setup() {
  const repository = createMockInventoryRepository(), list = vi.spyOn(repository, "getLegacyPpeKitTemplates").mockResolvedValue([template]), load = vi.spyOn(repository, "getPpeNormSet").mockImplementation(async id => detail(id));
  const bind = vi.spyOn(repository, "bindLegacyPpeKitTemplate").mockImplementation(async (_id, value) => ({ ...template, ...value, ownerUserId: "owner", ownerName: "Оператор", version: 3 })), notify = vi.fn();
  const view = (repo = repository) => <StrictMode><InventoryRepositoryProvider value={repo}><LegacyTemplatesAdmin norms={[norm("A"), norm("B")]} onNotify={notify} /></InventoryRepositoryProvider></StrictMode>;
  const rendered = render(view()); await screen.findByRole("button", { name: "Проверить и привязать" }); fireEvent.click(screen.getByText(/Наследованные шаблоны/));
  async function open() { fireEvent.click(screen.getByRole("button", { name: "Проверить и привязать" })); const user = userEvent.setup(); await user.selectOptions(screen.getByRole("combobox", { name: /Нормативный набор/ }), "A"); await screen.findByRole("combobox", { name: "Товар: Каска защитная A" }); await user.selectOptions(screen.getByRole("combobox", { name: "Товар: Каска защитная A" }), "item-A"); }
  return { ...rendered, repository, list, load, bind, notify, view, open };
}
describe("legacy PPE template binding dialog", () => {
  it("protects selected goods, quantity and sharing when closing or cancelling a norm change", async () => {
    const { open, bind } = await setup(); await open(); const user = userEvent.setup(), quantity = screen.getByRole("textbox", { name: "Количество: Каска защитная A" });
    fireEvent.change(quantity, { target: { value: "1,2345" } }); fireEvent.click(screen.getByRole("checkbox", { name: "Общий шаблон" })); fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" })); expect(quantity).toHaveValue("1,2345");
    await user.selectOptions(screen.getByRole("combobox", { name: /Нормативный набор/ }), "B"); await screen.findByRole("dialog", { name: "Изменить нормативный набор?" }); expect(screen.getByText("1,2345 шт.")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Вернуться" }));
    expect(screen.getByRole("combobox", { name: /Нормативный набор/ })).toHaveValue("A"); expect(quantity).toHaveValue("1,2345"); expect(screen.getByRole("checkbox", { name: "Общий шаблон" })).toBeChecked(); expect(bind).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Привязать шаблон" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: /Нормативный набор/ }), "B"); fireEvent.click(await screen.findByRole("button", { name: "Применить норму" })); await screen.findByRole("combobox", { name: "Товар: Каска защитная B" }); expect(screen.queryByRole("textbox", { name: /^Количество:/ })).not.toBeInTheDocument(); expect(bind).not.toHaveBeenCalled();
  });
  it("preserves input after a rejected binding, blocks duplicates and submits the opening version", async () => {
    const { open, bind } = await setup(); await open(); const gate = deferred<PpeKitTemplateDto>(); bind.mockReturnValueOnce(gate.promise);
    fireEvent.change(screen.getByRole("textbox", { name: /^Количество:/ }), { target: { value: "1,5" } }); const submit = screen.getByRole("button", { name: "Привязать шаблон" }); fireEvent.click(submit); fireEvent.click(submit); expect(bind).toHaveBeenCalledOnce(); expect(screen.getByRole("textbox", { name: /^Количество:/ })).toBeDisabled(); fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).not.toBeInTheDocument();
    await act(async () => gate.reject(new Error("Шаблон уже изменён"))); expect(screen.getByRole("alert")).toHaveTextContent("Шаблон уже изменён"); expect(screen.getByRole("textbox", { name: /^Количество:/ })).toHaveValue("1,5"); fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(bind.mock.calls[1]).toEqual([template.id, expect.objectContaining({ expectedVersion: 2, normSetId: "A", lines: [expect.objectContaining({ normRowId: "row-A", itemId: "item-A", quantity: 1.5 })] })]); expect(bind.mock.calls[1][1].lines[0]).not.toHaveProperty("quantityInput");
  });
  it("does not invent a conversion coefficient and allows an explicit quantity for a prepared mapping", async () => {
    const { load, open, bind } = await setup(); const value = detail("A"); value.rows[0].mappings[0].normUnitsPerItem = undefined; load.mockResolvedValue(value); await open();
    expect(screen.getByRole("textbox", { name: /^Количество:/ })).toHaveValue(""); expect(screen.getByRole("button", { name: "Привязать шаблон" })).toBeDisabled(); fireEvent.change(screen.getByRole("textbox", { name: /^Количество:/ }), { target: { value: "2" } }); fireEvent.click(screen.getByRole("button", { name: "Привязать шаблон" })); await waitFor(() => expect(bind).toHaveBeenCalledOnce()); expect(bind.mock.calls[0][1].lines[0].quantity).toBe(2);
  });
  it("retains the old norm and quantity after a failed candidate fetch and retries deliberately", async () => {
    const { open, load } = await setup(); await open(); load.mockRejectedValueOnce(new Error("Состав недоступен")); await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: /Нормативный набор/ }), "B"); await screen.findByText("Состав недоступен"); expect(screen.getByRole("combobox", { name: /Нормативный набор/ })).toHaveValue("A"); expect(screen.getByRole("textbox", { name: /^Количество:/ })).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Повторить состав нормы" })); await screen.findByRole("dialog", { name: "Изменить нормативный набор?" });
  });
  it("does not resurrect a successfully bound template from a delayed old list", async () => {
    const { list, open, notify } = await setup(); const gate = deferred<PpeKitTemplateDto[]>(); list.mockReturnValueOnce(gate.promise); fireEvent.click(screen.getByRole("button", { name: "Обновить шаблоны" })); await open(); fireEvent.click(screen.getByRole("button", { name: "Привязать шаблон" })); await waitFor(() => expect(notify).toHaveBeenCalledOnce());
    await act(async () => gate.resolve([template])); expect(screen.queryByRole("button", { name: "Проверить и привязать" })).not.toBeInTheDocument(); expect(screen.getByText("Наследованных шаблонов для привязки нет.")).toBeInTheDocument();
  });
  it("does not notify or remove another session's template after an old binding completes", async () => {
    const { repository, open, bind, rerender, view, notify } = await setup(); await open(); const gate = deferred<PpeKitTemplateDto>(); bind.mockReturnValueOnce(gate.promise); fireEvent.click(screen.getByRole("button", { name: "Привязать шаблон" }));
    const next = createMockInventoryRepository(); vi.spyOn(next, "getLegacyPpeKitTemplates").mockResolvedValue([{ ...template, name: "Другой сеанс" }]); rerender(view(next)); await act(async () => gate.resolve({ ...template, version: 3, ownerUserId: "owner" })); expect(notify).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(await screen.findByText("Другой сеанс")).toBeInTheDocument(); expect(repository.bindLegacyPpeKitTemplate).toHaveBeenCalledOnce();
  });
});
