import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PpeNormSetsAdmin } from "../features/inventory/PpeNormSetsAdmin";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import type { InventoryPpeNormSetDto } from "../api/contracts";

afterEach(() => vi.restoreAllMocks());
const norm = { id: "norm-a", positionName: "Тестовая должность", versionName: "Тест", sourceName: "Синтетический источник", status: "draft", version: 1, rowsCount: 0, effectiveFrom: "2026-01-01", effectiveTo: null, departmentName: "Тестовый цех", positionAliases: ["Испытатель"],
  readiness: { isReady: false, requiredCount: 1, approvedCount: 0, blockers: [{ rowId: "row-a", code: "missing", message: "Не выбран товар" }] } } as InventoryPpeNormSetDto;
const page = (rows: InventoryPpeNormSetDto[], current = 1, pageCount = 1) => ({ rows, page: current, pageSize: 100, total: rows.length, pageCount });

function setup() {
  const repository = createMockInventoryRepository();
  const lists = vi.spyOn(repository, "getPpeNormSets").mockResolvedValue(page([norm]));
  vi.spyOn(repository, "getLegacyPpeKitTemplates").mockResolvedValue([]);
  vi.spyOn(repository, "getPpeNormSet").mockResolvedValue({ normSet: norm, rows: [], itemRowsCount: 0, mappedItemRowsCount: 0, unmappedItemRowsCount: 0 });
  const catalog = vi.spyOn(repository, "getPpeItems").mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 100, pageCount: 1 });
  const ui = (repo = repository, notify = vi.fn()) => <InventoryRepositoryProvider value={repo}><PpeNormSetsAdmin canManage onNotify={notify} /></InventoryRepositoryProvider>;
  return { repository, lists, catalog, ui };
}

describe("PPE norms workspace", () => {
  it("discards obsolete search results without changing the global readiness counters", async () => {
    const { lists, ui } = setup();
    render(ui()); await screen.findByRole("heading", { name: norm.positionName });
    let finish!: (value: ReturnType<typeof page>) => void;
    lists.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const search = screen.getByRole("searchbox", { name: "Поиск по нормам СИЗ" });
    fireEvent.change(search, { target: { value: "Старый запрос" } });
    await waitFor(() => expect(lists).toHaveBeenCalledTimes(2));
    lists.mockResolvedValue(page([]));
    fireEvent.change(search, { target: { value: "Новый запрос" } });
    await screen.findByText("По заданным фильтрам наборы не найдены");
    await act(async () => finish(page([{ ...norm, positionName: "Устаревший набор" }])));
    expect(screen.queryByRole("heading", { name: "Устаревший набор" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("max", "1");
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByRole("heading", { name: norm.positionName })).toBeInTheDocument();
    expect(lists).toHaveBeenCalledTimes(3);
  });

  it("does not replace a freshly loaded detail with a delayed older index", async () => {
    const { repository, lists, ui } = setup();
    render(ui()); fireEvent.click(await screen.findByRole("button", { name: "Открыть категории и сопоставление" }));
    await screen.findByRole("button", { name: "Проверить область применения" });
    let finish!: (value: ReturnType<typeof page>) => void;
    lists.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.mocked(repository.getPpeNormSet).mockResolvedValue({ normSet: { ...norm, version: 2 }, rows: [], itemRowsCount: 0, mappedItemRowsCount: 0, unmappedItemRowsCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
    await waitFor(() => expect(screen.getByText("Версия").querySelector("b")).toHaveTextContent("2"));
    await act(async () => finish(page([norm])));
    expect(screen.getByText("Версия").querySelector("b")).toHaveTextContent("2");
  });
  it("searches all matching pages without downloading the global readiness index again", async () => {
    const { lists, ui } = setup();
    render(ui()); await screen.findByRole("heading", { name: norm.positionName });
    lists.mockImplementation(async params => params?.page === 2 ? page([{ ...norm, id: "norm-b", positionName: "Вторая тестовая должность" }], 2, 2) : page([norm], 1, 2));
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск по нормам СИЗ" }), { target: { value: "Тест" } });
    await screen.findByRole("heading", { name: "Вторая тестовая должность" });
    expect(lists).toHaveBeenCalledTimes(3);
    expect(lists.mock.calls.slice(1).every(([params]) => params?.query === "Тест")).toBe(true);
    expect(screen.getByRole("progressbar")).toHaveAttribute("max", "1");
  });

  it("retains unsaved fields and the expanded set during refresh, including an empty catalog", async () => {
    const { repository, lists, catalog, ui } = setup();
    render(ui()); fireEvent.click(await screen.findByRole("button", { name: "Открыть категории и сопоставление" }));
    await screen.findByRole("button", { name: "Проверить область применения" });
    await waitFor(() => expect(catalog).toHaveBeenCalledTimes(1));
    let finish!: (value: Awaited<ReturnType<typeof repository.getPpeNormSet>>) => void;
    vi.mocked(repository.getPpeNormSet).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
    fireEvent.click(screen.getByRole("button", { name: "Проверить область применения" }));
    const input = await screen.findByLabelText("Подразделение"); fireEvent.change(input, { target: { value: "Несохранённая правка" } });
    await act(async () => finish({ normSet: { ...norm, version: 2, departmentName: "Серверное изменение" }, rows: [], itemRowsCount: 0, mappedItemRowsCount: 0, unmappedItemRowsCount: 0 }));
    await waitFor(() => expect(lists).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Подразделение")).toBe(input);
    expect(input).toHaveValue("Несохранённая правка");
    fireEvent.click(screen.getByRole("button", { name: "Отмена" })); fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" }));
    expect(screen.getByRole("button", { name: "Скрыть категории" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скрыть категории" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть категории и сопоставление" }));
    expect(catalog).toHaveBeenCalledTimes(1);
  });

  it("does not refresh or notify a replacement workspace after an old editor save completes", async () => {
    const { repository, ui } = setup();
    let finish!: () => void;
    vi.spyOn(repository, "updatePpeNormSetScope").mockImplementation(() => new Promise(resolve => { finish = () => resolve(norm); }));
    const notify = vi.fn(); const view = render(ui(repository, notify));
    fireEvent.click(await screen.findByRole("button", { name: "Открыть категории и сопоставление" }));
    fireEvent.click(await screen.findByRole("button", { name: "Проверить область применения" }));
    fireEvent.click(await screen.findByRole("button", { name: "Подтвердить область" }));
    const next = createMockInventoryRepository();
    const nextLists = vi.spyOn(next, "getPpeNormSets").mockResolvedValue(page([]));
    const nextDetails = vi.spyOn(next, "getPpeNormSet");
    vi.spyOn(next, "getLegacyPpeKitTemplates").mockResolvedValue([]);
    view.rerender(ui(next, notify));
    await act(async () => finish());
    await waitFor(() => expect(nextLists).toHaveBeenCalledTimes(1));
    expect(nextDetails).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Подразделение")).not.toBeInTheDocument();
  });
});
