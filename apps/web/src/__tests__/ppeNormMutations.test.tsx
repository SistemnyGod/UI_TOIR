import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode, ChangeEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePpeNormWorkspace } from "../features/inventory/ppe/norms/usePpeNormWorkspace";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import type { InventoryPpeNormSetDto, InventoryPpeNormRowDto, InventoryItemDto } from "../api/contracts";
const norm = { id: "norm", version: 7, positionName: "Испытатель", status: "draft", versionName: "Тест", sourceName: "Источник", rowsCount: 1, effectiveFrom: "2026-01-01", effectiveTo: null, requiresReview: false } as InventoryPpeNormSetDto;
const row = { id: "row", rowType: "item", normItemName: "Каска", quantity: 1, sortOrder: 0, parentRowId: null, quantityText: "1 шт.", issuePeriodText: "12 месяцев", lifeMonths: 12, normPoint: "п. 1", mappings: [] } as InventoryPpeNormRowDto;
const item = { id: "item", name: "Каска", unit: "шт.", category: "СИЗ", defaultUnitPriceMinor: 125050, isActive: true } as InventoryItemDto;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function setup() {
  const repository = createMockInventoryRepository(), detail = { normSet: norm, rows: [row], itemRowsCount: 1, mappedItemRowsCount: 0, unmappedItemRowsCount: 1 }, notify = vi.fn();
  vi.spyOn(repository, "getPpeNormSets").mockResolvedValue({ rows: [norm], total: 1, page: 1, pageSize: 100, pageCount: 1 }); const load = vi.spyOn(repository, "getPpeNormSet").mockResolvedValue(detail); vi.spyOn(repository, "getPpeItems").mockResolvedValue({ rows: [item], total: 1, page: 1, pageSize: 100, pageCount: 1 });
  const wrapper = ({ children }: { children: ReactNode }) => <InventoryRepositoryProvider value={repository}>{children}</InventoryRepositoryProvider>, hook = renderHook(() => usePpeNormWorkspace("", notify), { wrapper }); await waitFor(() => expect(hook.result.current.loading).toBe(false)); await act(async () => hook.result.current.toggleDetails(norm)); return { repository, load, detail, notify, ...hook };
}
describe("PPE norm mutation boundaries", () => {
  it("does not repeat an accepted mapping after refresh failure and keeps the set stale until reloaded", async () => {
    const { repository, load, result, notify } = await setup(), gate = deferred<InventoryPpeNormRowDto["mappings"][number]>(), save = vi.spyOn(repository, "upsertPpeNormRowMapping").mockReturnValue(gate.promise); load.mockRejectedValueOnce(new Error("Ошибка обновления")); let pending!: Promise<boolean>;
    act(() => { pending = result.current.saveMapping(norm.id, row, item.id); }); await act(async () => { expect(await result.current.saveMapping(norm.id, row, item.id)).toBe(false); }); expect(save).toHaveBeenCalledOnce();
    await act(async () => { gate.resolve({ id: "mapping", normRowId: row.id, itemId: item.id, itemName: item.name, itemSku: "", brandModelArticle: "", defaultUnitPriceMinor: 125050, isDefault: false, comment: "", isApproved: false }); expect(await pending).toBe(true); }); expect(result.current.staleIds).toContain(norm.id); expect(result.current.error).toContain("Сопоставление сохранено"); expect(notify).toHaveBeenCalledWith(expect.stringContaining("Сопоставление сохранено")); await act(async () => result.current.reloadNormSet(norm.id)); expect(result.current.staleIds).toEqual([]); expect(save).toHaveBeenCalledOnce();
  });
  it("submits publication once even when called twice before rerender", async () => {
    const { repository, result } = await setup(), gate = deferred<InventoryPpeNormSetDto>(), publish = vi.spyOn(repository, "publishPpeNormSet").mockReturnValue(gate.promise); act(() => result.current.setReviewedIds([norm.id])); let first!: Promise<void>;
    act(() => { first = result.current.publish(norm); void result.current.publish(norm); }); expect(publish).toHaveBeenCalledExactlyOnceWith(norm.id, { confirmReviewed: true, expectedVersion: 7 }); await act(async () => { gate.resolve({ ...norm, status: "active", version: 8 }); await first; });
  });
  it("retains an accepted publication after refresh failure and rejects an older reload before allowing further actions", async () => {
    const { repository, load, detail, result, notify } = await setup();
    const published = { ...norm, status: "active" as const, version: 8 }, publish = vi.spyOn(repository, "publishPpeNormSet").mockResolvedValue(published);
    load.mockRejectedValueOnce(new Error("Обновление недоступно")); act(() => result.current.setReviewedIds([norm.id]));
    await act(async () => result.current.publish(norm));
    expect(result.current.allRows[0]).toMatchObject(published); expect(result.current.details[norm.id].normSet).toMatchObject(published);
    expect(result.current.reviewedIds).not.toContain(norm.id); expect(result.current.staleIds).toContain(norm.id); expect(result.current.error).toContain("Набор опубликован");
    act(() => result.current.setReviewedIds([norm.id])); await act(async () => result.current.publish(norm)); expect(publish).toHaveBeenCalledOnce();
    await act(async () => result.current.reloadNormSet(norm.id)); expect(result.current.staleIds).toContain(norm.id); expect(result.current.error).toContain("устаревшую версию");
    load.mockResolvedValue({ ...detail, normSet: published }); await act(async () => result.current.reloadNormSet(norm.id));
    expect(result.current.staleIds).toEqual([]); expect(result.current.error).toBe(""); expect(publish).toHaveBeenCalledOnce(); expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("опубликован"));
  });
  it.each([{ ...norm, id: "other", status: "active" as const, version: 8 }, { ...norm, status: "active" as const }, { ...norm, version: 8 }])("does not apply an unverified publication response: $id $status v$version", async response => {
    const { repository, result, notify } = await setup(); vi.spyOn(repository, "publishPpeNormSet").mockResolvedValue(response); act(() => result.current.setReviewedIds([norm.id]));
    await act(async () => result.current.publish(norm)); expect(result.current.allRows[0]).toEqual(norm); expect(result.current.staleIds).toContain(norm.id); expect(result.current.error).toContain("Публикация не подтверждена"); expect(notify).not.toHaveBeenCalled();
  });
  it("checks the published set even if another set is expanded and keeps a late index from restoring its old draft", async () => {
    const { repository, load, detail, result } = await setup(); const other = { ...norm, id: "other" }, published = { ...norm, status: "active" as const, version: 8 };
    load.mockResolvedValueOnce({ ...detail, normSet: other }); await act(async () => result.current.toggleDetails(other));
    load.mockResolvedValue({ ...detail, normSet: published }); const index = deferred<Awaited<ReturnType<typeof repository.getPpeNormSets>>>(); vi.mocked(repository.getPpeNormSets).mockReturnValue(index.promise);
    vi.spyOn(repository, "publishPpeNormSet").mockResolvedValue(published); act(() => result.current.setReviewedIds([norm.id])); await act(async () => result.current.publish(norm));
    expect(load).toHaveBeenLastCalledWith(norm.id); await act(async () => index.resolve({ rows: [norm, other], total: 2, page: 1, pageSize: 100, pageCount: 1 }));
    expect(result.current.allRows.find(row => row.id === norm.id)).toMatchObject(published); expect(result.current.expandedId).toBe(other.id);
  });
  it("requires a read after a lost publication response instead of submitting the same write again", async () => {
    const { repository, load, detail, result } = await setup(); const publish = vi.spyOn(repository, "publishPpeNormSet").mockRejectedValue(new Error("Ответ потерян")); act(() => result.current.setReviewedIds([norm.id]));
    await act(async () => result.current.publish(norm)); expect(result.current.staleIds).toContain(norm.id); act(() => result.current.setReviewedIds([norm.id])); await act(async () => result.current.publish(norm)); expect(publish).toHaveBeenCalledOnce();
    load.mockResolvedValue({ ...detail, normSet: { ...norm, version: 8, status: "active" } }); await act(async () => result.current.reloadNormSet(norm.id)); expect(result.current.allRows[0].status).toBe("active"); expect(result.current.staleIds).toEqual([]); expect(publish).toHaveBeenCalledOnce();
  });
  it("preserves the published version when a filtered search returns an older draft", async () => {
    const { repository, load, detail, result } = await setup(), search = deferred<Awaited<ReturnType<typeof repository.getPpeNormSets>>>();
    const published = { ...norm, status: "active" as const, version: 8 }; load.mockResolvedValue({ ...detail, normSet: published });
    vi.mocked(repository.getPpeNormSets).mockImplementation(async filters => filters?.query ? search.promise : { rows: [norm], total: 1, page: 1, pageSize: 100, pageCount: 1 });
    vi.spyOn(repository, "publishPpeNormSet").mockResolvedValue(published); act(() => result.current.setSearch("Испытатель"));
    await waitFor(() => expect(repository.getPpeNormSets).toHaveBeenCalledWith(expect.objectContaining({ query: "Испытатель" })));
    act(() => result.current.setReviewedIds([norm.id])); await act(async () => result.current.publish(norm));
    await waitFor(() => expect(vi.mocked(repository.getPpeNormSets).mock.calls.filter(([filters]) => filters?.query)).toHaveLength(2));
    await act(async () => search.resolve({ rows: [norm], total: 1, page: 1, pageSize: 100, pageCount: 1 }));
    expect(result.current.rows[0]).toMatchObject(published); expect(result.current.allRows[0]).toMatchObject(published);
  });
  it("ignores an old publication response after its workspace has unmounted", async () => {
    const { repository, load, result, unmount, notify } = await setup(), gate = deferred<InventoryPpeNormSetDto>(); vi.spyOn(repository, "publishPpeNormSet").mockReturnValue(gate.promise); act(() => result.current.setReviewedIds([norm.id])); let pending!: Promise<void>;
    act(() => { pending = result.current.publish(norm); }); unmount(); await act(async () => { gate.resolve({ ...norm, status: "active", version: 8 }); await pending; }); expect(notify).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledOnce();
  });
  it("submits one import for repeated file events while the previous import is pending", async () => {
    const { repository, result } = await setup(), gate = deferred<Awaited<ReturnType<typeof repository.importPpeNormSetsDraft>>>(), upload = vi.spyOn(repository, "importPpeNormSetsDraft").mockReturnValue(gate.promise); const file = new File(["fixture"], "norms.xlsx"), event = () => ({ target: { files: [file], value: "norms.xlsx" } } as unknown as ChangeEvent<HTMLInputElement>); let first!: Promise<void>;
    act(() => { first = result.current.importWorkbook(event()); void result.current.importWorkbook(event()); }); expect(upload).toHaveBeenCalledOnce(); await act(async () => { gate.resolve({ sourceRows: 1, normSetsCreated: 1, groupsCreated: 0, itemsCreated: 1, skippedRows: 0, warnings: [], normSets: [norm] }); await first; });
  });
});
