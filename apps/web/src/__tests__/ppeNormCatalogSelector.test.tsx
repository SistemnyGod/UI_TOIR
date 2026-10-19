import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryItemDto, InventoryPpeNormRowDto } from "../api/contracts";
import { NormCatalogSelector } from "../features/inventory/ppe/norms/NormCatalogSelector";

const row = { id: "norm", normItemName: "Каска защитная", mappings: [] } as unknown as InventoryPpeNormRowDto;
const items = [
  { id: "helmet", name: "Каска защитная", normItemName: "Каска защитная", actualItemName: "Каска защитная", sku: "HELMET-01", article: "HELMET-01", category: "Голова", unit: "шт.", isActive: true, itemKind: "ppe" },
  { id: "boots", name: "Сапоги зимние", normItemName: "Сапоги зимние", actualItemName: "Сапоги зимние", sku: "BOOT-02", article: "BOOT-02", category: "Обувь", unit: "пар", isActive: true, itemKind: "ppe" },
] as InventoryItemDto[];
afterEach(() => cleanup());
function deferred() { let resolve!: (value: boolean) => void, reject!: (reason: Error) => void; const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe("current norm catalog selection", () => {
  it("returns the selected catalog ID without claiming approval or stock availability", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(<NormCatalogSelector disabled={false} items={items} row={row} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Подобрать товар из номенклатуры" }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "HELMET-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Сопоставить: Каска защитная" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("helmet");
    expect(screen.queryByText("Нет в наличии")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Подобрать товар из номенклатуры" })).toHaveAttribute("aria-expanded", "false"));
  });

  it("allows an explicit manual selection outside the recommendations", () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(<NormCatalogSelector disabled={false} items={items} row={row} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Подобрать товар из номенклатуры" }));
    fireEvent.click(screen.getByRole("button", { name: "Все товары для ручного выбора" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "BOOT-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Сопоставить: Сапоги зимние" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("boots");
  });
  it("reaches goods after the former 40-item limit and resets pagination for a new search", () => {
    const catalog = Array.from({ length: 45 }, (_, index) => ({ ...items[0], id: "helmet-" + index, name: "Каска защитная " + String(index + 1).padStart(2, "0"), sku: "SKU-" + (index + 1) })), onSelect = vi.fn().mockResolvedValue(true);
    render(<NormCatalogSelector disabled={false} items={catalog} row={row} onSelect={onSelect} />); fireEvent.click(screen.getByRole("button", { name: "Подобрать товар из номенклатуры" })); expect(screen.getAllByRole("button", { name: /^Сопоставить:/ })).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "Далее" })); fireEvent.click(screen.getByRole("button", { name: "Далее" })); expect(screen.getAllByRole("button", { name: /^Сопоставить:/ })).toHaveLength(5); expect(screen.getByRole("status")).toHaveTextContent("41–45 из 45");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "SKU-1" } }); expect(screen.getByRole("status")).toHaveTextContent(/^1–/); expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
  });
  it("keeps search and the window on rejection and blocks duplicate selection and dismissal while pending", async () => {
    const gate = deferred(), onSelect = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(true);
    render(<NormCatalogSelector disabled={false} items={items} row={row} onSelect={onSelect} />); fireEvent.click(screen.getByRole("button", { name: "Подобрать товар из номенклатуры" })); const search = screen.getByRole("searchbox"); fireEvent.change(search, { target: { value: "HELMET-01" } }); const pick = screen.getByRole("button", { name: "Сопоставить: Каска защитная" }); fireEvent.click(pick); fireEvent.click(pick); expect(onSelect).toHaveBeenCalledOnce(); expect(search).toBeDisabled(); fireEvent.keyDown(window, { key: "Escape" }); expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => gate.reject(new Error("Ошибка записи сопоставления"))); expect(screen.getByRole("alert")).toHaveTextContent("Ошибка записи сопоставления"); expect(search).toHaveValue("HELMET-01"); fireEvent.click(pick); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(onSelect).toHaveBeenCalledTimes(2);
  });
  it("does not let the response of a replaced row close its new picker", async () => {
    const gate = deferred(), onSelect = vi.fn().mockReturnValue(gate.promise); const view = render(<NormCatalogSelector disabled={false} items={items} row={row} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Подобрать товар из номенклатуры" })); fireEvent.click(screen.getByRole("button", { name: "Сопоставить: Каска защитная" })); view.rerender(<NormCatalogSelector disabled={false} items={items} row={{ ...row, id: "other" }} onSelect={onSelect} />); fireEvent.click(screen.getByRole("button", { name: "Подобрать товар из номенклатуры" })); await act(async () => gate.resolve(true)); expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
