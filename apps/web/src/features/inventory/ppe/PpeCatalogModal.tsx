import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, PackageSearch, Search } from "lucide-react";
import type { InventoryItemDto, InventoryPpeCardNormRowDto, InventoryPpeNormMappingDto, InventoryReferenceOptionDto, UpsertInventoryPpeNormMappingDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { PpeButton, PpeModalShell } from "./PpeUi";

export function PpeCatalogModal({
  normRow,
  onClose,
  onConfirm,
}: {
  normRow: InventoryPpeCardNormRowDto;
  onClose: () => void;
  onConfirm: (item: InventoryItemDto, mapping: UpsertInventoryPpeNormMappingDto) => Promise<void>;
}) {
  const repository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InventoryItemDto[]>([]);
  const [categories, setCategories] = useState<InventoryReferenceOptionDto[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [selectedId, setSelectedId] = useState(normRow.mappedItemId ?? "");
  const [selectedItem, setSelectedItem] = useState<InventoryItemDto | null>(null);
  const [model, setModel] = useState(normRow.brandModelArticle);
  const [price, setPrice] = useState(normRow.defaultUnitPriceMinor ? String(normRow.defaultUnitPriceMinor / 100) : "");
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    repository.getPpeItems({ categoryId, page, pageSize: 18, query: deferredQuery })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setPageCount(Math.max(result.pageCount, 1));
        const current = result.rows.find((item) => item.id === selectedId);
        if (current) setSelectedItem(current);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить номенклатуру");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [categoryId, deferredQuery, page, repository, selectedId]);

  useEffect(() => setPage(1), [categoryId, deferredQuery]);

  useEffect(() => {
    let cancelled = false;
    repository.getSettings()
      .then((settings) => { if (!cancelled) setCategories(settings.categories); })
      .catch(() => { /* Category filtering remains optional if references are unavailable. */ });
    return () => { cancelled = true; };
  }, [repository]);

  useEffect(() => {
    if (!normRow.mappedItemId || selectedItem || !normRow.mappedItemName) return;
    let cancelled = false;
    repository.getPpeItems({ page: 1, pageSize: 20, query: normRow.mappedItemName })
      .then((result) => {
        if (cancelled) return;
        const mapped = result.rows.find((item) => item.id === normRow.mappedItemId);
        if (mapped) setSelectedItem(mapped);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [normRow.mappedItemId, normRow.mappedItemName, repository, selectedItem]);

  const selected = useMemo(
    () => selectedItem ?? rows.find((item) => item.id === selectedId) ?? null,
    [rows, selectedId, selectedItem],
  );

  function select(item: InventoryItemDto) {
    setSelectedId(item.id);
    setSelectedItem(item);
    setModel([item.brandName, item.modelName, item.article, item.protectionClass].filter(Boolean).join(" · "));
    setPrice(item.defaultUnitPriceMinor ? String(item.defaultUnitPriceMinor / 100) : "");
  }

  async function selectMapped(mapping: InventoryPpeNormMappingDto) {
    setLoading(true);
    setError("");
    try {
      const result = await repository.getPpeItems({ page: 1, pageSize: 50, query: mapping.itemSku || mapping.itemName });
      const item = result.rows.find((candidate) => candidate.id === mapping.itemId);
      if (!item) throw new Error("Допустимая позиция нормы отсутствует в активном каталоге");
      select(item);
      setModel(mapping.brandModelArticle || [item.brandName, item.modelName, item.article].filter(Boolean).join(" · "));
      setPrice(mapping.defaultUnitPriceMinor ? String(mapping.defaultUnitPriceMinor / 100) : "");
      setIsDefault(mapping.isDefault);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выбрать позицию по норме");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!selected) {
      setError("Выберите позицию номенклатуры");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm(selected, {
        brandModelArticle: model.trim(),
        defaultUnitPriceMinor: price.trim() ? Math.round(Number(price.replace(",", ".")) * 100) : null,
        isDefault,
        itemId: selected.id,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить сопоставление");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PpeModalShell
      ariaLabel="Сопоставить норму с номенклатурой"
      bodyClassName="ppe-v2-catalog-modal-body"
      className="ppe-v2-catalog-modal"
      description={[normRow.normPoint, normRow.issuePeriodText, normRow.quantityText].filter(Boolean).join(" · ")}
      eyebrow="Сопоставление нормы"
      footer={(
        <>
          <PpeButton onClick={onClose} variant="ghost">Отмена</PpeButton>
          <PpeButton disabled={!selected} loading={saving} onClick={() => void save()} variant="primary">Сохранить и выбрать</PpeButton>
        </>
      )}
      initialFocusSelector="[data-ppe-initial-focus]"
      onClose={onClose}
      title={normRow.normItemName}
    >
      <div className="ppe-v2-catalog-layout">
        <div className="ppe-v2-catalog-list-pane">
          {normRow.mappings.length ? (
            <section className="ppe-v2-norm-options">
              <header>
                <div><strong>Допустимые позиции по норме</strong><span>Сначала проверьте утверждённые варианты. Общий каталог ниже нужен для нового сопоставления.</span></div>
                <b>{normRow.mappings.length}</b>
              </header>
              <div>{[...normRow.mappings].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.itemName.localeCompare(right.itemName)).map((mapping) => (
                <button className={selectedId === mapping.itemId ? "is-selected" : ""} key={mapping.id} onClick={() => void selectMapped(mapping)} type="button">
                  <span><strong>{mapping.itemName}</strong><small>{[mapping.itemSku, mapping.brandModelArticle].filter(Boolean).join(" · ") || "Без артикула"}</small></span>
                  {mapping.isDefault ? <em>По умолчанию</em> : null}
                </button>
              ))}</div>
            </section>
          ) : <div className="ppe-v2-norm-options is-empty"><strong>Для нормы ещё нет допустимых позиций</strong><span>Найдите товар в каталоге и сохраните первую связь.</span></div>}
          <div className="ppe-v2-catalog-section-label"><div><strong>Общий каталог СИЗ</strong><span>Используйте поиск, если подходящего варианта нет среди допустимых.</span></div></div>
          <div className="ppe-v2-catalog-filters">
            <label className="ppe-v2-search">
              <Search size={17} />
              <input aria-label="Поиск номенклатуры" data-ppe-initial-focus onChange={(event) => setQuery(event.target.value)} placeholder="Название или артикул" value={query} />
            </label>
            <select aria-label="Категория номенклатуры" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
              <option value="">Все категории</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div className="ppe-v2-catalog-list">
            {loading ? <div className="ppe-v2-state">Загрузка номенклатуры…</div> : rows.length === 0 ? (
              <div className="ppe-v2-state"><PackageSearch size={30} /><strong>Ничего не найдено</strong><span>Измените поисковый запрос.</span></div>
            ) : rows.map((item) => (
              <button className={selectedId === item.id ? "is-selected" : ""} key={item.id} onClick={() => select(item)} type="button">
                <span><strong>{item.name}</strong><small>{[item.sku, item.article, item.category].filter(Boolean).join(" · ")}</small></span>
                {selectedId === item.id ? <Check size={18} /> : null}
              </button>
            ))}
          </div>
          <div className="ppe-v2-pagination">
            <button aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button"><ChevronLeft size={17} /></button>
            <span>{page} / {pageCount}</span>
            <button aria-label="Следующая страница" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} type="button"><ChevronRight size={17} /></button>
          </div>
        </div>

        <aside className="ppe-v2-catalog-detail">
          {selected ? (
            <>
              <div className="ppe-v2-selected-item">
                <span className="ppe-v2-eyebrow">Выбранная позиция</span>
                <h3>{selected.name}</h3>
                <dl>
                  <div><dt>Артикул</dt><dd>{selected.article || "Не указан"}</dd></div>
                  <div><dt>Модель</dt><dd>{selected.modelName || "Не указана"}</dd></div>
                  <div><dt>Класс защиты</dt><dd>{selected.protectionClass || "Не указан"}</dd></div>
                  <div><dt>Единица</dt><dd>{selected.unit || "шт."}</dd></div>
                </dl>
              </div>
              <label>Модель / марка / артикул<input onChange={(event) => setModel(event.target.value)} value={model} /></label>
              <label>Цена, ₽<input inputMode="decimal" onChange={(event) => setPrice(event.target.value)} value={price} /></label>
              <label className="ppe-v2-check"><input checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} type="checkbox" /> Использовать по умолчанию для этой нормы</label>
            </>
          ) : <div className="ppe-v2-state"><PackageSearch size={32} /><strong>Выберите позицию</strong><span>Сопоставление не создаёт фактическую выдачу.</span></div>}
        </aside>
      </div>
      {error ? <p className="ppe-v2-error" role="alert">{error}</p> : null}
    </PpeModalShell>
  );
}
