import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, PackageSearch, Search, X } from "lucide-react";
import type { InventoryItemDto, InventoryPpeCardNormRowDto, InventoryReferenceOptionDto, UpsertInventoryPpeNormMappingDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";

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
    <div className="ppe-v2-modal-backdrop" onMouseDown={onClose} role="presentation">
      <section aria-label="Сопоставить норму с номенклатурой" className="ppe-v2-modal ppe-v2-catalog-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="ppe-v2-modal-head">
          <div>
            <span className="ppe-v2-eyebrow">Сопоставление нормы</span>
            <h2>{normRow.normItemName}</h2>
            <p>{[normRow.normPoint, normRow.issuePeriodText, normRow.quantityText].filter(Boolean).join(" · ")}</p>
          </div>
          <button aria-label="Закрыть" className="ppe-v2-icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </header>

        <div className="ppe-v2-catalog-layout">
          <div className="ppe-v2-catalog-list-pane">
            <div className="ppe-v2-catalog-filters">
              <label className="ppe-v2-search">
                <Search size={17} />
                <input aria-label="Поиск номенклатуры" onChange={(event) => setQuery(event.target.value)} placeholder="Название или артикул" value={query} />
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
                <label className="ppe-v2-check"><input checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} type="checkbox" /> Использовать по умолчанию</label>
              </>
            ) : <div className="ppe-v2-state"><PackageSearch size={32} /><strong>Выберите позицию</strong><span>Сопоставление не создает фактическую выдачу.</span></div>}
          </aside>
        </div>

        {error ? <p className="ppe-v2-error">{error}</p> : null}
        <footer className="ppe-v2-modal-actions">
          <button className="button" onClick={onClose} type="button">Отмена</button>
          <button className="button primary" disabled={!selected || saving} onClick={() => void save()} type="button">{saving ? "Сохранение…" : "Сохранить связь"}</button>
        </footer>
      </section>
    </div>
  );
}
