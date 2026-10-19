import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegacyPrintPreview } from "../features/inventory/ppe/LegacyPrintPreview";
import { LegacyPrintFields } from "../features/inventory/ppe/LegacyPrintFields";
import { printDocument } from "../features/inventory/ppe/ppePrint";
import type { PrintData, PrintMode } from "../features/inventory/ppe/ppeTypes";

function data(count = 2): PrintData { return { cardId: "card", employeeName: "Иванов Иван Иванович", position: "Слесарь", lines: Array.from({ length: count }, (_, index) => ({ itemName: "Средство " + (index + 1), printItemName: "Печать " + (index + 1), model: "Модель", brandModelArticle: "Артикул " + (index + 1), normPoint: "п. " + (index + 1), issuePeriodText: "12 месяцев", quantity: 2, status: "issued", unit: "шт.", unitPrice: 100, amount: 200, issuedAt: `2026-10-${String(20 - index % 20).padStart(2, "0")}T08:00:00Z` })) }; }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  const onPrint = vi.fn<(data: PrintData, mode: PrintMode) => void | Promise<void>>(), onClose = vi.fn();
  const initial = { card: data(), sheet: data() };
  function View({ sources = initial }) { const [mode, setMode] = useState<PrintMode>("card"); return <LegacyPrintPreview sources={sources} mode={mode} onModeChange={setMode} onPrint={onPrint} onClose={onClose} />; }
  return { ...render(<View />), View, initial, onPrint, onClose };
}
function editFirst(value: string) { fireEvent.click(screen.getByRole("button", { name: "Правки для печати" })); fireEvent.change(screen.getByRole("textbox", { name: "Наименование СИЗ · строка 1" }), { target: { value } }); fireEvent.click(screen.getByRole("button", { name: "Применить к предпросмотру" })); }
describe("legacy PPE print preview", () => {
  it("retains local edits across a mode switch and a background card refresh", async () => {
    const { initial, rerender, View, onPrint } = setup(); editFirst("Локальное имя");
    fireEvent.click(screen.getByRole("button", { name: "Лист подписи" })); fireEvent.click(screen.getByRole("button", { name: "Личная карточка" }));
    const next = structuredClone(initial); next.card.lines[0].printItemName = "Новое серверное имя"; rerender(<View sources={next} />);
    expect(screen.getByText("Локальное имя")).toBeInTheDocument(); expect(screen.getByText(/Карточка обновилась/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Печать" })); await waitFor(() => expect(onPrint).toHaveBeenCalledOnce()); expect(onPrint.mock.calls[0][0].lines[0].printItemName).toBe("Локальное имя"); expect(initial.card.lines[0].printItemName).toBe("Печать 1");
  });
  it("requires explicit confirmation before replacing edits with server data", () => {
    const { initial, rerender, View } = setup(); editFirst("Локальное имя"); const next = structuredClone(initial); next.card.lines[0].printItemName = "Новая карточка"; rerender(<View sources={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Загрузить обновлённые данные" })); const confirm = screen.getByRole("dialog", { name: "Обновить печатные данные?" }); expect(screen.getByText("Локальное имя")).toBeInTheDocument(); fireEvent.click(within(confirm).getByRole("button", { name: "Вернуться" })); expect(screen.getByText("Локальное имя")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Загрузить обновлённые данные" })); fireEvent.click(screen.getByRole("button", { name: "Обновить и сбросить правки" })); expect(screen.getByText("Новая карточка")).toBeInTheDocument(); expect(screen.queryByText("Локальное имя")).not.toBeInTheDocument();
  });
  it("guards every dirty dismissal and keeps edits after a print failure", async () => {
    const { onPrint, onClose } = setup(); editFirst("Правка"); onPrint.mockRejectedValueOnce(new Error("Принтер недоступен")); fireEvent.click(screen.getByRole("button", { name: "Печать" })); await screen.findByRole("alert"); expect(screen.getByText("Правка")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" }); await screen.findByRole("dialog", { name: "Несохранённые изменения" }); expect(onClose).not.toHaveBeenCalled(); expect(screen.getByText(/Данные карточки в базе не изменены/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Продолжить редактирование" })); expect(screen.getByText("Правка")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Закрыть" }).at(-1)!); fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" })); expect(onClose).toHaveBeenCalledOnce();
  });
  it("locks duplicate printing and closing until the real request settles, without a timer", async () => {
    const { onPrint, onClose } = setup(), gate = deferred(); onPrint.mockReturnValueOnce(gate.promise); const print = screen.getByRole("button", { name: "Печать" }); fireEvent.click(print); fireEvent.click(print); fireEvent.keyDown(document, { key: "Escape" }); expect(onPrint).toHaveBeenCalledOnce(); expect(onClose).not.toHaveBeenCalled(); expect(screen.getByLabelText("Масштаб")).toBeDisabled();
    await act(async () => gate.resolve()); expect(screen.getByLabelText("Масштаб")).toBeEnabled(); expect(screen.getByRole("button", { name: "Печать" })).toBeEnabled();
  });
  it("reports a blocked popup instead of silently doing nothing", () => { vi.spyOn(window, "open").mockReturnValue(null); expect(() => printDocument(data(), "card")).toThrow(/Браузер заблокировал/); });
  it("edits all 54 positions through pages without changing quantities or losing fields", () => {
    const source = data(54), apply = vi.fn(); render(<LegacyPrintFields data={source} mode="card" onApply={apply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Наименование СИЗ · строка 1" }), { target: { value: "Правка 1" } }); fireEvent.click(screen.getByRole("button", { name: "Далее" })); expect(screen.queryByRole("textbox", { name: "Наименование СИЗ · строка 1" })).not.toBeInTheDocument();
    for (let index = 0; index < 4; index++) fireEvent.click(screen.getByRole("button", { name: "Далее" })); fireEvent.change(screen.getByRole("textbox", { name: "Наименование СИЗ · строка 54" }), { target: { value: "Правка 54" } }); fireEvent.click(screen.getByRole("button", { name: "Применить к предпросмотру" }));
    const saved = apply.mock.calls[0][0] as PrintData; expect(saved.lines[0].printItemName).toBe("Правка 1"); expect(saved.lines[53].printItemName).toBe("Правка 54"); expect(saved.lines.map(line => line.quantity)).toEqual(source.lines.map(line => line.quantity)); expect(source.lines[0].printItemName).toBe("Печать 1");
  });
  it("uses source row identities when the signature sheet is sorted and excludes non-signature rows", () => {
    const source = data(3), apply = vi.fn(); source.lines[0].isSectionTitle = true; render(<LegacyPrintFields data={source} mode="sheet" onApply={apply} onClose={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: "Модель, марка, артикул · строка 1" })).not.toBeInTheDocument(); const fields = screen.getAllByRole("textbox"); expect(fields[0]).toHaveAccessibleName("Модель, марка, артикул · строка 3"); fireEvent.change(fields[0], { target: { value: "Уточнённый артикул" } }); fireEvent.click(screen.getByRole("button", { name: "Применить к предпросмотру" })); expect(apply.mock.calls[0][0].lines[2].brandModelArticle).toBe("Уточнённый артикул"); expect(apply.mock.calls[0][0].lines[1].brandModelArticle).toBe("Артикул 2");
  });
});
