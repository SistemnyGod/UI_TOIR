import { useCallback, useEffect, useRef, useState } from "react";
import type { InventoryItemDto, InventoryItemFacetsDto, InventoryListResponseDto, InventorySettingsDto, UpsertInventoryItemDto } from "../../../api/contracts";
import type { InventoryRepository } from "../../../repositories/inventoryRepository";
import { catalogItemSnapshot } from "./catalogItemModel";
export type ItemFilters = {
  categoryId: string;
  itemKind: string;
  page: number;
  pageSize: number;
  query: string;
  status: string;
  trackingType: string;
  unitId: string;
};
const initialFilters: ItemFilters = { categoryId: "", itemKind: "", page: 1, pageSize: 20, query: "", status: "active", trackingType: "", unitId: "" };
const emptyFacets: InventoryItemFacetsDto = { total: 0, active: 0, inactive: 0, categories: [], units: [], trackingTypes: [], itemKinds: [] };
const emptyItems: InventoryListResponseDto<InventoryItemDto> = { rows: [], total: 0, page: 1, pageSize: 20, pageCount: 1 };
/** Kept inside an owner-keyed workspace. Reads cannot undo an accepted write. */
export function useInventoryCatalog(repository: InventoryRepository, initialSettings?: InventorySettingsDto) {
  const [settings, setSettings] = useState(initialSettings), [facets, setFacets] = useState(emptyFacets), [items, setItems] = useState(emptyItems), [hasFacets, setHasFacets] = useState(false);
  const [filters, setFilters] = useState(initialFilters), [query, setQuery] = useState(""), [loading, setLoading] = useState(true), [lookupsLoading, setLookupsLoading] = useState(true);
  const [listError, setListError] = useState(""), [lookupError, setLookupError] = useState(""), [reload, setReload] = useState(0), [selectedItemId, setSelectedItemId] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true), listGeneration = useRef(0), writeLock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; listGeneration.current++; }; }, []);
  useEffect(() => { const handle = window.setTimeout(() => setFilters(current => current.query === query.trim() ? current : { ...current, query: query.trim(), page: 1 }), 300); return () => window.clearTimeout(handle); }, [query]);
  useEffect(() => {
    let current = true;
    setLookupsLoading(true);
    setLookupError("");
    void Promise.all([initialSettings ? Promise.resolve(initialSettings) : repository.getSettings(), repository.getItemFacets()]).then(([nextSettings, nextFacets]) => { if (current) {
      setSettings(nextSettings);
      setFacets(nextFacets);
      setHasFacets(true);
    } }).catch(error => { if (current)
      setLookupError(error instanceof Error ? error.message : "Не удалось загрузить категории и единицы."); }).finally(() => { if (current)
      setLookupsLoading(false); });
    return () => { current = false; };
  }, [repository, initialSettings, reload]);
  useEffect(() => {
    const request = ++listGeneration.current;
    let current = true;
    setLoading(true);
    setListError("");
    void repository.getItems({ ...filters, categoryId: filters.categoryId || undefined, itemKind: filters.itemKind || undefined, query: filters.query || undefined, status: filters.status || undefined, trackingType: filters.trackingType || undefined, unitId: filters.unitId || undefined }).then(next => {
      if (!current || request !== listGeneration.current)
        return;
      if (next.total > 0 && filters.page > next.pageCount) {
        setFilters(old => ({ ...old, page: Math.max(1, next.pageCount) }));
        return;
      }
      setItems(next);
      setSelectedItemId(id => next.rows.some(row => row.id === id) ? id : next.rows[0]?.id ?? "");
    }).catch(error => { if (current && request === listGeneration.current)
      setListError(error instanceof Error ? error.message : "Не удалось загрузить номенклатуру."); }).finally(() => { if (current && request === listGeneration.current)
      setLoading(false); });
    return () => { current = false; };
  }, [repository, filters, reload]);
  const refresh = useCallback(() => { listGeneration.current++; setReload(value => value + 1); }, []);
  function updateFilters(patch: Partial<ItemFilters>) { setFilters(current => ({ ...current, ...patch, page: patch.page ?? 1 })); }
  function resetFilters() { setQuery(""); setFilters(initialFilters); }
  async function writeItem(original: InventoryItemDto | undefined, payload: UpsertInventoryItemDto) {
    if (writeLock.current)
      return null;
    writeLock.current = true;
    setSaving(true);
    try {
      if (original) {
        const latest = await repository.getItem(original.id);
        if (!mounted.current)
          return null;
        if (catalogItemSnapshot(latest) !== catalogItemSnapshot(original))
          throw new Error("Позиция изменилась на сервере. Ваш ввод сохранён. Закройте форму и откройте актуальную карточку перед повторным изменением.");
      }
      const saved = original ? await repository.updateItem(original.id, payload) : await repository.createItem(payload);
      if (!mounted.current)
        return null;
      listGeneration.current++;
      setItems(current => ({ ...current, rows: current.rows.map(row => row.id === saved.id ? saved : row) }));
      setSelectedItemId(saved.id);
      refresh();
      return saved;
    }
    finally {
      writeLock.current = false;
      if (mounted.current)
        setSaving(false);
    }
  }
  return { settings, facets, hasFacets, items, filters, query, setQuery, loading, lookupsLoading, error: [listError, lookupError].filter(Boolean).join(" "), selectedItemId, setSelectedItemId, refresh, updateFilters, resetFilters, saving, writeItem };
}
