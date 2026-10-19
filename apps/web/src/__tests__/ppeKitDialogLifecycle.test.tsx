import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryPpeNormRowDto, PpeKitTemplateDto } from "../api/contracts";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import { KitPicker } from "../features/inventory/ppe/KitPicker";
import { KitTemplates } from "../features/inventory/ppe/KitTemplates";
import { KitLineActions } from "../features/inventory/ppe/KitLineActions";
import type { DraftLine } from "../features/inventory/ppe/documentWorkflow";
import { fingerprintOf, mergeServerLines, toLineInput } from "../features/inventory/ppe/documentDraft";
import { templateLineInputs } from "../features/inventory/ppe/kitTemplateModel";

const line: DraftLine = { id: "line", normRowId: "row", itemId: "item", itemName: "Каска", unitSymbol: "шт.", normName: "Защита головы", approved: true, quantity: 1, lifeMonths: 12, unitPriceMinor: 100, issueDate: "2026-10-01", sizeText: "", exceptionReason: "", manualControlConfirmed: false };
const template: PpeKitTemplateDto = { id: "template", name: "Комплект", normSetId: "norm", ownerUserId: "owner", ownerName: "Оператор", isShared: false, version: 1, updatedAt: "2026-10-01T00:00:00Z", lines: templateLineInputs([line]) };
function row(index = 0, approved = true): InventoryPpeNormRowDto {
  return { id: index ? `row-${index}` : "row", rowType: "item", normItemName: `Норма ${index}`, quantity: 1, lifeMonths: 12, mappings: [{ itemId: index ? `item-${index}` : "item", itemName: index ? `Каска ${String(index).padStart(2, "0")}` : "Каска", itemSku: `PPE-${index}`, itemUnitSymbol: "шт.", defaultUnitPriceMinor: 100, isApproved: approved, normUnitsPerItem: 1 }] } as InventoryPpeNormRowDto;
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; }
beforeEach(() => {
  for (const key of ["localStorage", "sessionStorage"]) {
    const values = new Map<string, string>();
    vi.stubGlobal(key, { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => values.set(name, value), removeItem: (name: string) => values.delete(name), clear: () => values.clear() });
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function picker(props: Partial<Parameters<typeof KitPicker>[0]> = {}) {
  const repository = createMockInventoryRepository(), close = vi.fn(), add = vi.fn();
  vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValue([template]);
  const defaults = { userId: "owner", canManageShared: false, normSetId: "norm", rows: [row()], groupNames: new Map<string, string>(), date: "2026-10-01", onClose: close, onAdd: add };
  const view = (overrides = {}) => <InventoryRepositoryProvider value={repository}><KitPicker {...defaults} {...props} {...overrides} /></InventoryRepositoryProvider>;
  return { ...render(view()), view, repository, close, add };
}
function templates(repository = createMockInventoryRepository(), props: Partial<Parameters<typeof KitTemplates>[0]> = {}) {
  const close = vi.fn(), apply = vi.fn();
  const defaults = { userId: "owner", canManageShared: false, normSetId: "norm", rows: [row()], lines: [line], date: "2026-10-01", onClose: close, onApply: apply };
  const view = (overrides = {}) => <InventoryRepositoryProvider value={repository}><KitTemplates {...defaults} {...props} {...overrides} /></InventoryRepositoryProvider>;
  return { ...render(view()), view, repository, close, apply };
}
describe("PPE kit selection and local input", () => {
  it("preserves selection through a nested preview and cancelled dismissal", async () => {
    const { close } = picker();
    fireEvent.click(screen.getByRole("button", { name: "Выбрать СИЗ: Каска" }));
    fireEvent.click(screen.getByRole("button", { name: "Из шаблона" }));
    await screen.findByText(/Комплект · 1 позиций/);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть просмотр" }));
    expect(screen.getByRole("button", { name: "Выбрать СИЗ: Каска" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    expect(screen.getByLabelText("Количество")).toHaveValue(1); expect(close).not.toHaveBeenCalled();
  });
  it("retains an invalid price after blur and rejects add until corrected", async () => {
    const { add } = picker(); fireEvent.click(screen.getByRole("button", { name: "Выбрать СИЗ: Каска" }));
    const price = screen.getByLabelText("Цена, руб.");
    fireEvent.change(price, { target: { value: "12,,50" } }); fireEvent.blur(price);
    expect(price).toHaveValue("12,,50"); expect(price).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Добавить выбранное" }));
    expect(add).not.toHaveBeenCalled();
    fireEvent.change(price, { target: { value: "1 250,50" } }); fireEvent.blur(price);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Добавить выбранное" }));
    await waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(add.mock.calls[0][0][0]).toMatchObject({ unitPriceMinor: 125050 });
  });
  it("blocks duplicate add and dismissal, then retains the choice after failure", async () => {
    const request = deferred<void>(), add = vi.fn(() => request.promise), close = vi.fn(); picker({ onAdd: add, onClose: close });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать СИЗ: Каска" }));
    const submit = screen.getByRole("button", { name: "Добавить выбранное" }); fireEvent.click(submit); fireEvent.click(submit);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(add).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Закрыть" })).toBeDisabled();
    await act(async () => request.reject(new Error("Не удалось записать комплект")));
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось записать комплект");
    expect(screen.getByLabelText("Количество")).toHaveValue(1);
  });
  it("reaches every catalog page and keeps selected rows when filtering", () => {
    picker({ rows: Array.from({ length: 30 }, (_, index) => row(index)) });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать СИЗ: Каска" }));
    fireEvent.click(screen.getByRole("button", { name: "Вперёд" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать СИЗ: Каска 29" }));
    fireEvent.change(screen.getByLabelText("Поиск"), { target: { value: "ничего" } });
    expect(screen.getByText("Выбранные позиции · 2")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Количество")).toHaveLength(2);
  });
  it("does not add a selected mapping revoked by background refresh", () => {
    const { add, rerender, view } = picker(); fireEvent.click(screen.getByRole("button", { name: "Выбрать СИЗ: Каска" }));
    rerender(view({ rows: [row(0, false)] }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить выбранное" }));
    expect(screen.getByRole("alert")).toHaveTextContent("больше не утверждено"); expect(add).not.toHaveBeenCalled();
  });
  it("clears a different owner's selection and ignores an old add result", async () => {
    const request = deferred<void>(), close = vi.fn();
    const { rerender, view } = picker({ onAdd: () => request.promise, onClose: close });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать СИЗ: Каска" })); fireEvent.click(screen.getByRole("button", { name: "Добавить выбранное" }));
    rerender(view({ userId: "other" })); await act(async () => request.resolve());
    expect(close).not.toHaveBeenCalled(); expect(screen.getByText("Выбрано: 0")).toBeInTheDocument();
  });
  it("keeps raw price edits during delayed document save and excludes them from DTOs", () => {
    const edited = { ...line, priceInput: "12," };
    const document = { content: { lines: [line], normRows: [] } } as never;
    expect(mergeServerLines(document, [edited], [toLineInput(line)])[0].priceInput).toBe("12,");
    expect(toLineInput(edited)).not.toHaveProperty("priceInput"); expect(templateLineInputs([edited])[0]).not.toHaveProperty("priceInput");
    const key = (current: DraftLine) => fingerprintOf("employee", "norm", "2026-10-01", "", "", {} as never, [current], false);
    expect(key(edited)).not.toBe(key(line));
    expect(key({ ...line, priceInput: "1,00" })).toBe(key(line));
  });
});
describe("PPE server template operations", () => {
  it("does not crash or delete malformed legacy browser records", async () => {
    const key = "patrol360.ppe.kits.v1.corrupt-user", value = JSON.stringify([{ id: "broken", name: "Старый", normSetId: "norm", lines: [null] }]);
    localStorage.setItem(key, value);
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValue([]); templates(repository, { userId: "corrupt-user" });
    await screen.findByText("Сохраните комплект, чтобы использовать его повторно.");
    expect(localStorage.getItem(key)).toBe(value);
  });
  it("saves a renamed template explicitly and keeps its draft after a conflict", async () => {
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValue([template]);
    const rename = vi.spyOn(repository, "renamePpeKitTemplate").mockRejectedValueOnce(new Error("Версия изменена другим пользователем")).mockResolvedValue({ ...template, name: "Новое имя", version: 2 }); templates(repository);
    fireEvent.click(await screen.findByText(/Комплект · 1 позиций/)); const input = screen.getByLabelText("Название шаблона");
    fireEvent.change(input, { target: { value: "Новое имя" } }); fireEvent.blur(input); expect(rename).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить имя" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Версия изменена"); expect(input).toHaveValue("Новое имя");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить имя" })); await screen.findByText(/Новое имя · 1 позиций/);
    expect(rename).toHaveBeenLastCalledWith("template", 1, "Новое имя");
  });
  it("keeps a completed rename against an older list, but accepts a later deliberate refresh", async () => {
    const repository = createMockInventoryRepository(), stale = deferred<PpeKitTemplateDto[]>();
    const list = vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValueOnce([template]).mockImplementationOnce(() => stale.promise).mockResolvedValue([{ ...template, name: "Изменено на сервере", version: 3 }]);
    vi.spyOn(repository, "renamePpeKitTemplate").mockResolvedValue({ ...template, name: "Наше имя", version: 2 }); templates(repository);
    fireEvent.click(await screen.findByText(/Комплект · 1 позиций/)); fireEvent.click(screen.getByRole("button", { name: "Обновить список" }));
    fireEvent.change(screen.getByLabelText("Название шаблона"), { target: { value: "Наше имя" } }); fireEvent.click(screen.getByRole("button", { name: "Сохранить имя" }));
    await screen.findByText(/Наше имя · 1 позиций/); await act(async () => stale.resolve([template]));
    expect(screen.queryByText(/Комплект · 1 позиций/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Обновить список" })); await screen.findByText(/Изменено на сервере · 1 позиций/); expect(list).toHaveBeenCalledTimes(3);
  });
  it("does not discard a newly created template when the initial list arrives late", async () => {
    const repository = createMockInventoryRepository(), stale = deferred<PpeKitTemplateDto[]>();
    vi.spyOn(repository, "getPpeKitTemplates").mockImplementation(() => stale.promise); vi.spyOn(repository, "createPpeKitTemplate").mockResolvedValue(template); templates(repository);
    fireEvent.click(screen.getByText("Сохранить комплект как новый шаблон"));
    fireEvent.change(screen.getByLabelText("Название нового шаблона"), { target: { value: "Комплект" } }); fireEvent.click(screen.getByRole("button", { name: "Сохранить текущий комплект" }));
    await screen.findByText(/Комплект · 1 позиций/); await act(async () => stale.resolve([])); expect(screen.getByText(/Комплект · 1 позиций/)).toBeInTheDocument();
  });
  it("does not resurrect an archived template from an older refresh", async () => {
    const repository = createMockInventoryRepository(), stale = deferred<PpeKitTemplateDto[]>();
    vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValueOnce([template]).mockImplementationOnce(() => stale.promise);
    vi.spyOn(repository, "archivePpeKitTemplate").mockResolvedValue(template); templates(repository);
    fireEvent.click(await screen.findByText(/Комплект · 1 позиций/)); fireEvent.click(screen.getByRole("button", { name: "Обновить список" })); fireEvent.click(screen.getByRole("button", { name: "В архив" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Архивировать шаблон?" })).getByRole("button", { name: "Архивировать" }));
    await screen.findByText("Шаблон перенесён в архив."); await act(async () => stale.resolve([template])); expect(screen.queryByText(/Комплект · 1 позиций/)).not.toBeInTheDocument();
  });
  it("does not apply a late validation response to a different norm", async () => {
    const repository = createMockInventoryRepository(), request = deferred<PpeKitTemplateDto>();
    vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValue([template]); vi.spyOn(repository, "validatePpeKitTemplate").mockImplementation(() => request.promise);
    const { rerender, view, apply, close } = templates(repository);
    fireEvent.click(await screen.findByText(/Комплект · 1 позиций/)); fireEvent.click(screen.getByRole("button", { name: "Применить шаблон" }));
    rerender(view({ normSetId: "other" })); await act(async () => request.resolve(template)); expect(apply).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
  it("reports a successful legacy import even when session storage refuses writes", async () => {
    localStorage.setItem("patrol360.ppe.kits.v1.storage-user", JSON.stringify([{ id: "legacy", name: "Старый", normSetId: "norm", lines: [line] }]));
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => { throw new Error("Storage denied"); } });
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValue([]);
    const create = vi.spyOn(repository, "createPpeKitTemplate").mockResolvedValue(template); templates(repository, { userId: "storage-user" });
    fireEvent.click(screen.getByText(/Шаблоны этого браузера:/)); fireEvent.click(screen.getByText(/Старый · 1 позиций/)); fireEvent.click(screen.getByRole("button", { name: "Импортировать этот шаблон" }));
    await screen.findByText(/Отметка импорта сохранена в памяти/); expect(screen.getByRole("button", { name: "Импортирован" })).toBeDisabled(); expect(create).toHaveBeenCalledOnce();
    expect(localStorage.getItem("patrol360.ppe.kits.v1.storage-user")).toContain("legacy");
  });
});
describe("PPE line control", () => {
  it("edits locally, requires a reason, and applies only once", async () => {
    const request = deferred<void>(), change = vi.fn(() => request.promise);
    function Harness() { const [current] = useState(line); return <KitLineActions line={current} editable onChange={change} onRemove={vi.fn()} />; }
    render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "Контроль: Каска" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ручной контроль" })); expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Применить к строке" })); expect(screen.getByRole("alert")).toHaveTextContent("Укажите причину");
    fireEvent.change(screen.getByLabelText("Причина исключения"), { target: { value: "Проверено комиссией" } });
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" }));
    const form = screen.getByRole("dialog").querySelector("form")!; fireEvent.submit(form); fireEvent.submit(form); fireEvent.keyDown(window, { key: "Escape" });
    expect(change).toHaveBeenCalledOnce(); expect(change).toHaveBeenCalledWith({ manualControlConfirmed: true, exceptionReason: "Проверено комиссией" });
    await act(async () => request.resolve()); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
