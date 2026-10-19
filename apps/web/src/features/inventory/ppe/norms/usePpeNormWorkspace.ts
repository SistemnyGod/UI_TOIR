import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { InventoryItemDto, InventoryPpeNormRowDto, InventoryPpeNormSetDetailDto, InventoryPpeNormSetDto } from "../../../../api/contracts";
import { useInventoryRepository } from "../../../../repositories/inventoryRepositoryContext";

export function usePpeNormWorkspace(initialSearch: string, notify: (message: string) => void) {
  const repository = useInventoryRepository();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const onNotify = (message: string) => { if (mounted.current) notify(message); };
  const owner = useRef(0);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const catalogRequest = useRef<Promise<void> | null>(null);
  const catalogLoaded = useRef(false);
  const mutationLocks = useRef({ mapping: false, publishing: false, importing: false });
  const knownNormSets = useRef(new Map<string, InventoryPpeNormSetDto>());
  const rememberNormSet = useCallback((row: InventoryPpeNormSetDto) => {
    const known = knownNormSets.current.get(row.id);
    if (known && known.version > row.version) return known;
    knownNormSets.current.set(row.id, row); return row;
  }, []);
  const [reload, setReload] = useState(0);
  const [allRows, setAllRows] = useState<InventoryPpeNormSetDto[]>([]);
  const [rows, setRows] = useState<InventoryPpeNormSetDto[]>([]);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [publishingId, setPublishingId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [details, setDetails] = useState<Record<string, InventoryPpeNormSetDetailDto>>({});
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const [catalogItems, setCatalogItems] = useState<InventoryItemDto[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mappingRowId, setMappingRowId] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [error, setError] = useState("");
  const [staleIds, setStaleIds] = useState<string[]>([]);
  const markStale = (id: string) => setStaleIds(current => current.includes(id) ? current : [...current, id]);

  const refreshNormSet = useCallback(async (normSetId: string) => {
    if (!mounted.current) return;
    const session = owner.current;
    const detail = await repository.getPpeNormSet(normSetId);
    if (!mounted.current || session !== owner.current) return;
    if (detail.normSet.id !== normSetId) throw new Error("Сервер вернул другой нормативный набор. Повторите загрузку.");
    if (detail.normSet.version < (knownNormSets.current.get(normSetId)?.version ?? -1)) throw new Error("Сервер вернул устаревшую версию набора. Повторите загрузку актуальных данных.");
    rememberNormSet(detail.normSet);
    setAllRows(current => current.map(row => row.id === normSetId && row.version <= detail.normSet.version ? detail.normSet : row));
    setReviewedIds(current => current.filter(id => id !== normSetId));
    setDetails(current => current[normSetId]?.normSet.version > detail.normSet.version ? current : { ...current, [normSetId]: detail });
    setRows(current => current.map(row => row.id === normSetId && row.version <= detail.normSet.version ? detail.normSet : row));
    setStaleIds(current => current.filter(id => id !== normSetId));
  }, [repository, rememberNormSet]);

  useEffect(() => {
    owner.current++; listRequest.current++; detailRequest.current++;
    catalogRequest.current = null; catalogLoaded.current = false;
    knownNormSets.current.clear();
    mutationLocks.current = { mapping: false, publishing: false, importing: false };
    setRows([]); setAllRows([]); setDetails({}); setExpandedId(""); setCatalogItems([]); setReviewedIds([]); setError(""); setStaleIds([]); setImporting(false); setPublishingId(""); setDetailLoadingId(""); setMappingRowId(""); setCatalogLoading(false);
    return () => { owner.current++; listRequest.current++; detailRequest.current++; };
  }, [repository]);

  // The global readiness index is independent of the server-side search.
  useEffect(() => {
    let active = true;
    setIndexLoading(true); setError("");
    void fetchNormPages(repository).then(value => {
      if (active) { const next = value.map(rememberNormSet); setAllRows(current => {
        const previous = new Map(current.map(row => [row.id, row]));
        return next.map(row => (previous.get(row.id)?.version ?? -1) > row.version ? previous.get(row.id)! : row);
      }); }
    })
      .catch(reason => { if (active) setError(errorMessage(reason, "Не удалось загрузить нормативные наборы")); })
      .finally(() => { if (active) setIndexLoading(false); });
    return () => { active = false; };
  }, [repository, reload, rememberNormSet]);

  useEffect(() => {
    const current = ++listRequest.current;
    const query = search.trim();
    if (!query) { setSearchLoading(false); return; }
    setSearchLoading(true); setError("");
    const timeout = window.setTimeout(() => {
      void fetchNormPages(repository, query).then(value => { if (current === listRequest.current) setRows(value.map(rememberNormSet)); })
        .catch(reason => { if (current === listRequest.current) setError(errorMessage(reason, "Не удалось найти нормы")); })
        .finally(() => { if (current === listRequest.current) setSearchLoading(false); });
    }, 300);
    return () => { listRequest.current++; window.clearTimeout(timeout); };
  }, [repository, search, reload, rememberNormSet]);

  async function load() {
    setReload(value => value + 1);
    if (expandedId && details[expandedId]) {
      const session = owner.current;
      try { await refreshNormSet(expandedId); }
      catch (reason) { if (session === owner.current) setError(errorMessage(reason, "Не удалось обновить строки нормы")); }
    }
  }

  async function importWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const session = owner.current;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (mutationLocks.current.importing) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Для импорта выберите файл Excel в формате .xlsx");
      return;
    }
    try {
      mutationLocks.current.importing = true;
      setImporting(true);
      setError("");
      const result = await repository.importPpeNormSetsDraft(file);
      if (session !== owner.current) return;
      onNotify(`Импорт завершен: ${result.normSetsCreated} наборов, ${result.itemsCreated} позиций`);
      await load();
    } catch (requestError) {
      if (session !== owner.current) return;
      setError(requestError instanceof Error ? requestError.message : "Не удалось импортировать нормы СИЗ");
    } finally {
      if (session === owner.current) { mutationLocks.current.importing = false; setImporting(false); }
    }
  }

  async function publish(row: InventoryPpeNormSetDto) {
    const session = owner.current;
    if (mutationLocks.current.publishing || mutationLocks.current.mapping || staleIds.includes(row.id)) return;
    const known = knownNormSets.current.get(row.id);
    if (row.status !== "draft" || known && (known.version !== row.version || known.status !== "draft")) {
      setError("Набор изменился. Перед публикацией загрузите актуальную версию и проверьте состав."); return;
    }
    if (!reviewedIds.includes(row.id)) {
      setError("Перед публикацией подтвердите, что набор проверен");
      return;
    }
    let published = false;
    try {
      mutationLocks.current.publishing = true;
      setPublishingId(row.id);
      setError("");
      const response = await repository.publishPpeNormSet(row.id, { confirmReviewed: true, expectedVersion: row.version });
      if (session !== owner.current) return;
      if (response?.id !== row.id || response.status !== "active" || !Number.isSafeInteger(response.version) || response.version <= row.version)
        throw new Error("Ответ сервера не подтверждает публикацию выбранного набора.");
      published = true;
      const accepted = rememberNormSet(response);
      markStale(row.id); setReviewedIds(current => current.filter(id => id !== row.id));
      const updateRows = (current: InventoryPpeNormSetDto[]) => current.map(value => value.id === row.id && value.version <= accepted.version ? accepted : value);
      setAllRows(updateRows); setRows(updateRows);
      setDetails(current => current[row.id] ? { ...current, [row.id]: { ...current[row.id], normSet: accepted } } : current);
      onNotify(`Нормативный набор «${row.positionName}» опубликован`);
      await refreshNormSet(row.id);
      if (session === owner.current) setReload(value => value + 1);
    } catch (requestError) {
      if (session !== owner.current) return;
      markStale(row.id); setReviewedIds(current => current.filter(id => id !== row.id));
      setError(published
        ? "Набор опубликован. Не удалось обновить данные; перед следующим действием загрузите актуальную версию набора."
        : `Публикация не подтверждена. ${errorMessage(requestError, "Не удалось получить результат операции")}. Перед повторной публикацией обновите набор.`);
    } finally {
      if (session === owner.current) { mutationLocks.current.publishing = false; setPublishingId(""); }
    }
  }

  async function loadCatalog() {
    if (catalogLoaded.current) return;
    if (catalogRequest.current) return catalogRequest.current;
    const session = owner.current;
    setCatalogLoading(true);
    const pending = (async () => {
      try {
        const first = await repository.getPpeItems({ page: 1, pageSize: 100 });
        const rest = await Promise.all(Array.from({ length: Math.max(0, first.pageCount - 1) }, (_, index) =>
          repository.getPpeItems({ page: index + 2, pageSize: 100 })));
        if (session !== owner.current) return;
        catalogLoaded.current = true;
        setCatalogItems([first, ...rest].flatMap((page) => page.rows));
      } catch (reason) { if (session === owner.current) setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог СИЗ"); } finally {
        if (session === owner.current) { setCatalogLoading(false); catalogRequest.current = null; }
      }
    })();
    catalogRequest.current = pending;
    return pending;
  }

  async function toggleDetails(row: InventoryPpeNormSetDto) {
    const request = ++detailRequest.current;
    if (expandedId === row.id) {
      setExpandedId("");
      setDetailLoadingId("");
      return;
    }
    const session = owner.current;
    setExpandedId(row.id);
    setCategoryFilter("all");
    if (details[row.id] && details[row.id].normSet.version >= row.version) {
      setDetailLoadingId("");
      void loadCatalog();
      return;
    }
    try {
      setDetailLoadingId(row.id);
      setError("");
      const detail = await repository.getPpeNormSet(row.id);
      if (session !== owner.current) return;
      if (detail.normSet.id !== row.id) throw new Error("Сервер вернул другой нормативный набор. Повторите загрузку.");
      if (detail.normSet.version < (knownNormSets.current.get(row.id)?.version ?? -1)) throw new Error("Сервер вернул устаревшую версию набора. Повторите загрузку актуальных данных.");
      rememberNormSet(detail.normSet);
      setDetails(current => current[row.id]?.normSet.version > detail.normSet.version ? current : { ...current, [row.id]: detail });
      await loadCatalog();
    } catch (requestError) {
      if (session !== owner.current || request !== detailRequest.current) return;
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить строки нормы");
    } finally {
      if (session === owner.current && request === detailRequest.current) setDetailLoadingId("");
    }
  }

  async function saveMapping(normSetId: string, normRow: InventoryPpeNormRowDto, itemId: string, isDefault = false) {
    const session = owner.current;
    if (!itemId || mutationLocks.current.mapping || mutationLocks.current.publishing || staleIds.includes(normSetId)) return false;
    const item = catalogItems.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    let saved = false;
    try {
      mutationLocks.current.mapping = true;
      setMappingRowId(normRow.id);
      setError("");
      const mapping = await repository.upsertPpeNormRowMapping(normRow.id, {
        itemId,
        isDefault,
        defaultUnitPriceMinor: item.defaultUnitPriceMinor,
      });
      if (session !== owner.current) return false;
      saved = true; markStale(normSetId);
      setDetails((current) => {
        const detail = current[normSetId];
        if (!detail) return current;
        const nextRows = detail.rows.map((candidate) => candidate.id !== normRow.id ? candidate : {
          ...candidate,
          mappings: [mapping, ...candidate.mappings.filter((existing) => existing.itemId !== mapping.itemId).map((existing) => ({ ...existing, isDefault: mapping.isDefault ? false : existing.isDefault }))],
        });
        return {
          ...current,
          [normSetId]: {
            ...detail,
            rows: nextRows,
            mappedItemRowsCount: nextRows.filter((candidate) => candidate.rowType === "item" && candidate.mappings.length > 0).length,
            unmappedItemRowsCount: nextRows.filter((candidate) => candidate.rowType === "item" && candidate.mappings.length === 0).length,
          },
        };
      });
      await refreshNormSet(normSetId);
      if (session !== owner.current) return false;
      onNotify("Сопоставление нормы сохранено. Утверждение выполняется отдельно.");
      return true;
    } catch (requestError) {
      if (session !== owner.current) return false;
      if (saved) { setError("Сопоставление сохранено. Не удалось обновить набор; загрузите актуальные данные перед следующим действием."); onNotify("Сопоставление сохранено. Обновите набор перед следующим действием."); return true; }
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить сопоставление");
      throw requestError;
    } finally {
      if (session === owner.current) { mutationLocks.current.mapping = false; setMappingRowId(""); }
    }
  }

  async function reloadNormSet(id: string) {
    const session = owner.current;
    try {
      await refreshNormSet(id);
      if (session === owner.current) { setError(""); setReload(value => value + 1); }
    } catch (reason) { if (session === owner.current) setError(errorMessage(reason, "Не удалось обновить набор")); }
  }
  return { allRows, rows: search.trim() ? rows : allRows, reviewedIds, setReviewedIds, loading: indexLoading || searchLoading, importing, publishingId, expandedId, details, detailLoadingId, catalogItems, catalogLoading, categoryFilter, setCategoryFilter, mappingRowId, search, setSearch, error, load, importWorkbook, publish, toggleDetails, saveMapping, refreshNormSet, onNotify, staleIds, markStale, reloadNormSet };
}

async function fetchNormPages(repository: ReturnType<typeof useInventoryRepository>, query?: string) {
  const first = await repository.getPpeNormSets({ page: 1, pageSize: 100, ...(query ? { query } : {}) });
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.pageCount - 1) }, (_, index) =>
    repository.getPpeNormSets({ page: index + 2, pageSize: 100, ...(query ? { query } : {}) })));
  return [first, ...rest].flatMap(page => page.rows);
}

function errorMessage(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
