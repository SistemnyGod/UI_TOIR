import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownAZ, Check, ChevronLeft, ChevronRight, PackageCheck, PackageSearch, RotateCcw, Search, Tag, X } from "lucide-react";
import type { InventoryItemDto, InventoryPpeCardNormRowDto, InventoryPpeNormMappingDto, InventoryReferenceOptionDto, UpsertInventoryPpeNormMappingDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { PpeButton, PpeModalShell } from "./PpeUi";
import "../styles/ppeCatalogModal.css";

export type PpeCatalogSelection = {
  item: InventoryItemDto;
  mapping: UpsertInventoryPpeNormMappingDto;
  quantity: number;
};

type CatalogSort = "name-asc" | "name-desc" | "stock-desc" | "price-asc";
type SelectionEdit = { isDefault: boolean; model: string; price: string; quantity: number };

export function PpeCatalogModal({
  allowMultiple = false,
  normRow,
  onClose,
  onConfirm,
}: {
  allowMultiple?: boolean;
  normRow: InventoryPpeCardNormRowDto;
  onClose: () => void;
  onConfirm: (selections: PpeCatalogSelection[]) => Promise<void>;
}) {
  const repository = useInventoryRepository();
  const allowsMultiple = allowMultiple && !normRow.sourceNormRowId;
  const initialSelectedId = normRow.mappedItemId ?? "";
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InventoryItemDto[]>([]);
  const [categories, setCategories] = useState<InventoryReferenceOptionDto[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<CatalogSort>("name-asc");
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedId ? [initialSelectedId] : []);
  const [selectedItems, setSelectedItems] = useState<Record<string, InventoryItemDto>>({});
  const [selectionEdits, setSelectionEdits] = useState<Record<string, SelectionEdit>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    repository.getPpeItems({ categoryId, page, pageSize: 18, query: deferredQuery })
      .then((result) => {
        if (cancelled) return;
        setError("");
        setRows(result.rows);
        setPageCount(Math.max(result.pageCount, 1));
        setTotal(result.total);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить номенклатуру");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [categoryId, deferredQuery, page, repository]);




  useEffect(() => {
    let cancelled = false;
    setCategoryError("");
    repository.getSettings()
      .then((settings) => {
        if (cancelled) return;
        setCategories(settings.categories);
        setCategoryError("");
      })
      .catch((reason) => {
        if (cancelled) return;
        setCategories([]);
        setCategoryError(reason instanceof Error ? reason.message : "Не удалось загрузить категории СИЗ");
      });
    return () => { cancelled = true; };
  }, [repository]);

  useEffect(() => {
    if (!normRow.mappedItemId || !normRow.mappedItemName) return;
    let cancelled = false;
    repository.getPpeItems({ page: 1, pageSize: 20, query: normRow.mappedItemName })
      .then((result) => {
        if (cancelled) return;
        const mapped = result.rows.find((item) => item.id === normRow.mappedItemId);
        if (!mapped) return;
        rememberItem(mapped, {
          isDefault: true,
          model: normRow.brandModelArticle || defaultModel(mapped),
          price: normRow.defaultUnitPriceMinor ? String(normRow.defaultUnitPriceMinor / 100) : defaultPrice(mapped),
          quantity: Math.max(normRow.quantity || 1, 1),
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [normRow, repository]);

  const sortedRows = useMemo(() => sortCatalogItems(rows, sort), [rows, sort]);
  const selected = selectedId ? selectedItems[selectedId] ?? rows.find((item) => item.id === selectedId) ?? null : null;
  const activeEdit = selectedId ? selectionEdits[selectedId] ?? (selected ? createDefaultEdit(selected) : null) : null;

  function updateQuery(nextQuery: string) {
    setPage(1);
    setQuery(nextQuery);
  }

  function updateCategory(nextCategoryId: string) {
    setPage(1);
    setCategoryId(nextCategoryId);
  }

  function rememberItem(item: InventoryItemDto, edit?: SelectionEdit) {
    setSelectedItems((current) => current[item.id] ? current : { ...current, [item.id]: item });
    setSelectionEdits((current) => current[item.id] ? current : { ...current, [item.id]: edit ?? createDefaultEdit(item) });
  }

  function select(item: InventoryItemDto, edit?: SelectionEdit) {
    setError("");
    if (allowsMultiple && selectedIds.includes(item.id)) {
      removeSelection(item.id);
      return;
    }
    rememberItem(item, edit);
    setSelectedId(item.id);
    setSelectedIds((current) => allowsMultiple
      ? current.includes(item.id) ? current : [...current, item.id]
      : [item.id]);
  }

  function removeSelection(itemId: string) {
    setSelectedIds((current) => {
      const next = current.filter((id) => id !== itemId);
      if (selectedId === itemId) setSelectedId(next[0] ?? "");
      return next;
    });
    setSelectedItems((current) => {
      const { [itemId]: _, ...rest } = current;
      return rest;
    });
    setSelectionEdits((current) => {
      const { [itemId]: _, ...rest } = current;
      return rest;
    });
  }

  function updateActiveEdit(patch: Partial<SelectionEdit>) {
    if (!selectedId || !selected) return;
    setSelectionEdits((current) => ({
      ...current,
      [selectedId]: { ...(current[selectedId] ?? createDefaultEdit(selected)), ...patch },
    }));
  }

  function resetSelectedFields() {
    if (!selectedId || !selected) return;
    setSelectionEdits((current) => ({ ...current, [selectedId]: createDefaultEdit(selected) }));
  }

  async function selectMapped(mapping: InventoryPpeNormMappingDto) {
    setLoading(true);
    setError("");
    try {
      const result = await repository.getPpeItems({ page: 1, pageSize: 50, query: mapping.itemSku || mapping.itemName });
      const item = result.rows.find((candidate) => candidate.id === mapping.itemId);
      if (!item) throw new Error("Допустимая позиция нормы отсутствует в активном каталоге");
      select(item, {
        isDefault: mapping.isDefault,
        model: mapping.brandModelArticle || defaultModel(item),
        price: mapping.defaultUnitPriceMinor ? String(mapping.defaultUnitPriceMinor / 100) : defaultPrice(item),
        quantity: Math.max(normRow.quantity || 1, 1),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выбрать позицию по норме");
    } finally {
      setLoading(false);
    }
  }

  const requestClose = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);

  async function save() {
    if (savingRef.current) return;
    if (!selectedIds.length) {
      setError("Выберите хотя бы одну позицию номенклатуры");
      return;
    }

    const selections: PpeCatalogSelection[] = [];
    for (const itemId of [...new Set(selectedIds)]) {
      const item = selectedItems[itemId] ?? rows.find((candidate) => candidate.id === itemId);
      if (!item) continue;
      const edit = selectionEdits[itemId] ?? createDefaultEdit(item);
      const normalizedPrice = edit.price.trim().replace(",", ".");
      const parsedPrice = normalizedPrice ? Number(normalizedPrice) : null;
      if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
        setSelectedId(itemId);
        setError(`Проверьте цену для позиции «${item.name}»`);
        return;
      }
      if (!Number.isFinite(edit.quantity) || edit.quantity <= 0) {
        setSelectedId(itemId);
        setError(`Количество для позиции «${item.name}» должно быть больше нуля`);
        return;
      }
      selections.push({
        item,
        mapping: {
          brandModelArticle: edit.model.trim(),
          defaultUnitPriceMinor: parsedPrice === null ? null : Math.round(parsedPrice * 100),
          isDefault: allowsMultiple ? false : edit.isDefault,
          itemId: item.id,
        },
        quantity: edit.quantity,
      });
    }

    if (!selections.length) {
      setError("Выбранные позиции недоступны. Обновите каталог и повторите выбор.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onConfirm(selections);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить выбранные позиции");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <PpeModalShell
      ariaLabel="Сопоставить норму с номенклатурой"
      bodyClassName="ppe-v2-catalog-modal-body"
      className="ppe-v2-catalog-modal"
      closeDisabled={saving}
      description={[normRow.normPoint, normRow.issuePeriodText, normRow.quantityText].filter(Boolean).join(" · ")}
      eyebrow="Выбор номенклатуры"
      footer={(
        <>
          <span className="ppe-catalog-footer-summary">Выбрано: <strong>{selectedIds.length}</strong></span>
          <PpeButton disabled={saving} onClick={requestClose} variant="ghost">Отмена</PpeButton>
          <PpeButton disabled={!selectedIds.length || loading} loading={saving} onClick={() => void save()} variant="primary">Добавить выбранные{selectedIds.length ? ` (${selectedIds.length})` : ""}</PpeButton>
        </>
      )}
      initialFocusSelector="[data-ppe-initial-focus]"
      onClose={requestClose}
      title={normRow.normItemName}
    >
      <div className="ppe-catalog-context">
        <div><span>Норма</span><strong>{normRow.normItemName}</strong></div>
        <div><span>Требуется</span><strong>{normRow.quantityText || "Количество не указано"}</strong></div>
        <div><span>Режим выбора</span><strong>{allowsMultiple ? "Можно несколько изделий" : "Одно изделие"}</strong></div>
      </div>

      <div className="ppe-v2-catalog-layout">
        <section className="ppe-v2-catalog-list-pane" aria-label="Каталог номенклатуры СИЗ">
          {normRow.mappings.length ? (
            <section className="ppe-v2-norm-options">
              <header><div><strong>Подходят по норме</strong><span>Проверенные изделия для этой нормативной позиции.</span></div><b>{normRow.mappings.length}</b></header>
              <div>{[...normRow.mappings].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.itemName.localeCompare(right.itemName)).map((mapping) => (
                <button aria-pressed={selectedIds.includes(mapping.itemId)} className={selectedIds.includes(mapping.itemId) ? "is-selected" : ""} disabled={loading || saving} key={mapping.id} onClick={() => void selectMapped(mapping)} type="button">
                  <span><strong>{mapping.itemName}</strong><small>{[mapping.itemSku, mapping.brandModelArticle].filter(Boolean).join(" · ") || "Без артикула"}</small></span>
                  {mapping.isDefault ? <em>По умолчанию</em> : null}
                </button>
              ))}</div>
            </section>
          ) : <div className="ppe-v2-norm-options is-empty"><strong>Подходящие изделия ещё не назначены</strong><span>Выберите товар из каталога — он станет первым допустимым вариантом.</span></div>}

          <div className="ppe-catalog-toolbar">
            <label className="ppe-v2-search"><Search size={17} /><input aria-label="Поиск номенклатуры" data-ppe-initial-focus onChange={(event) => updateQuery(event.target.value)} placeholder="Название, модель или артикул" value={query} />{query ? <button aria-label="Очистить поиск" onClick={() => updateQuery("")} type="button">×</button> : null}</label>
            <label className="ppe-catalog-sort"><ArrowDownAZ size={16} /><select aria-label="Сортировка номенклатуры" onChange={(event) => setSort(event.target.value as CatalogSort)} value={sort}><option value="name-asc">Название А–Я</option><option value="name-desc">Название Я–А</option><option value="stock-desc">Сначала в наличии</option><option value="price-asc">Сначала дешевле</option></select></label>
          </div>

          {categoryError ? (
            <div className="ppe-catalog-category-warning" role="status" title={categoryError}>
              <AlertTriangle aria-hidden="true" size={16} />
              <span><strong>Категории временно недоступны</strong><small>Поиск, сортировка и выбор номенклатуры продолжают работать.</small></span>
            </div>
          ) : null}

          <div className="ppe-catalog-category-chips" aria-label="Категории номенклатуры">
            <button aria-pressed={!categoryId} className={!categoryId ? "is-active" : ""} disabled={loading || saving} onClick={() => updateCategory("")} type="button">Все <span>{total}</span></button>
            {categories.map((category) => <button aria-pressed={categoryId === category.id} className={categoryId === category.id ? "is-active" : ""} disabled={loading || saving} key={category.id} onClick={() => updateCategory(category.id)} type="button">{category.name}</button>)}
          </div>

          <div className="ppe-catalog-results-head"><div aria-live="polite"><strong>Номенклатура СИЗ</strong><span>{loading ? "Обновляем список…" : `Показано ${sortedRows.length} из ${total}`}</span></div>{categoryId ? <button disabled={loading || saving} onClick={() => updateCategory("")} type="button">Сбросить категорию</button> : null}</div>

          <div className="ppe-v2-catalog-list">
            {loading ? <div className="ppe-v2-state">Загрузка номенклатуры…</div> : sortedRows.length === 0 ? <div className="ppe-v2-state"><PackageSearch size={30} /><strong>Ничего не найдено</strong><span>Измените запрос или выберите другую категорию.</span></div> : sortedRows.map((item) => (
              <button aria-pressed={selectedIds.includes(item.id)} className={selectedIds.includes(item.id) ? "ppe-catalog-item-card is-selected" : "ppe-catalog-item-card"} disabled={loading || saving} key={item.id} onClick={() => select(item)} type="button">
                <span className="ppe-catalog-item-icon"><PackageCheck size={19} /></span>
                <span className="ppe-catalog-item-copy"><strong>{item.name}</strong><small>{[item.brandName, item.modelName].filter(Boolean).join(" · ") || "Производитель и модель не указаны"}</small><span className="ppe-catalog-item-meta"><em><Tag size={12} />{item.article || item.sku || "Без артикула"}</em><em>{item.category || "Без категории"}</em></span></span>
                <span className="ppe-catalog-item-side"><b>{formatPrice(item.defaultUnitPriceMinor)}</b><small className={item.stockAvailable > 0 ? "is-available" : "is-empty"}>{item.stockAvailable > 0 ? `${formatQuantity(item.stockAvailable)} ${item.unit || "шт."}` : "Нет в наличии"}</small>{selectedIds.includes(item.id) ? <span className="ppe-catalog-selected-mark"><Check size={14} /> Выбрано</span> : null}</span>
              </button>
            ))}
          </div>

          <div className="ppe-v2-pagination"><button aria-label="Предыдущая страница" disabled={page <= 1 || loading || saving} onClick={() => setPage((value) => value - 1)} type="button"><ChevronLeft size={17} /></button><span>Страница {page} из {pageCount}</span><button aria-label="Следующая страница" disabled={page >= pageCount || loading || saving} onClick={() => setPage((value) => value + 1)} type="button"><ChevronRight size={17} /></button></div>
        </section>

        <aside className="ppe-v2-catalog-detail">
          {selectedIds.length ? <section className="ppe-catalog-basket"><header><div><strong>Выбрано для выдачи</strong><span>{selectedIds.length} поз.</span></div>{allowsMultiple ? <small>Выберите карточку для редактирования</small> : null}</header><div>{selectedIds.map((itemId) => { const item = selectedItems[itemId]; if (!item) return null; return <article className={itemId === selectedId ? "is-active" : ""} key={itemId}><button aria-pressed={itemId === selectedId} disabled={saving} onClick={() => setSelectedId(itemId)} type="button"><strong>{item.name}</strong><span>{selectionEdits[itemId]?.quantity ?? 1} {item.unit || "шт."} · {item.article || item.sku || "без артикула"}</span></button>{allowsMultiple ? <button aria-label={`Убрать ${item.name}`} disabled={saving} onClick={() => removeSelection(itemId)} type="button"><X size={15} /></button> : null}</article>; })}</div></section> : null}

          {selected && activeEdit ? (
            <>
              <div className="ppe-v2-selected-item"><span className="ppe-v2-eyebrow">Редактируемая позиция</span><h3>{selected.name}</h3><p>{[selected.brandName, selected.modelName].filter(Boolean).join(" · ") || "Без производителя и модели"}</p><dl><div><dt>Артикул</dt><dd>{selected.article || selected.sku || "Не указан"}</dd></div><div><dt>Категория</dt><dd>{selected.category || "Не указана"}</dd></div><div><dt>Класс защиты</dt><dd>{selected.protectionClass || "Не указан"}</dd></div><div><dt>Остаток</dt><dd>{formatQuantity(selected.stockAvailable)} {selected.unit || "шт."}</dd></div></dl></div>
              <section className="ppe-catalog-editor"><header><div><strong>Параметры выдачи</strong><span>Изменения применяются только к строке документа.</span></div><PpeButton disabled={saving} icon={<RotateCcw size={15} />} onClick={resetSelectedFields} size="compact" variant="ghost">Сбросить</PpeButton></header><div className="ppe-catalog-editor-grid"><label>Количество<input aria-label={`Количество ${selected.name}`} disabled={saving} inputMode="decimal" min="0.01" onChange={(event) => updateActiveEdit({ quantity: Number(event.target.value) })} step="0.01" type="number" value={activeEdit.quantity} /></label><label>Цена, ₽<input disabled={saving} inputMode="decimal" min="0" onChange={(event) => updateActiveEdit({ price: event.target.value })} value={activeEdit.price} /></label><label className="is-wide">Модель / марка / артикул<input disabled={saving} onChange={(event) => updateActiveEdit({ model: event.target.value })} value={activeEdit.model} /></label></div>{!allowsMultiple ? <label className="ppe-v2-check"><input checked={activeEdit.isDefault} disabled={saving} onChange={(event) => updateActiveEdit({ isDefault: event.target.checked })} type="checkbox" /> Использовать по умолчанию для этой нормы</label> : null}</section>
              <div className="ppe-catalog-selection-note"><Check size={16} /><span><strong>Позиция готова</strong>Количество можно повторно изменить на этапе «Состав».</span></div>
            </>
          ) : <div className="ppe-v2-state ppe-catalog-detail-empty"><PackageSearch size={36} /><strong>Выберите одно или несколько изделий</strong><span>Выбранные карточки появятся здесь для редактирования.</span></div>}
        </aside>
      </div>
      {error ? <p className="ppe-v2-error" role="alert">{error}</p> : null}
    </PpeModalShell>
  );
}

function createDefaultEdit(item: InventoryItemDto): SelectionEdit {
  return { isDefault: true, model: defaultModel(item), price: defaultPrice(item), quantity: 1 };
}

function defaultModel(item: InventoryItemDto) {
  return [item.brandName, item.modelName, item.article, item.protectionClass].filter(Boolean).join(" · ");
}

function defaultPrice(item: InventoryItemDto) {
  return item.defaultUnitPriceMinor ? String(item.defaultUnitPriceMinor / 100) : "";
}

function sortCatalogItems(items: InventoryItemDto[], sort: CatalogSort) {
  return [...items].sort((left, right) => {
    if (sort === "name-desc") return right.name.localeCompare(left.name, "ru");
    if (sort === "stock-desc") return right.stockAvailable - left.stockAvailable || left.name.localeCompare(right.name, "ru");
    if (sort === "price-asc") return (left.defaultUnitPriceMinor ?? Number.MAX_SAFE_INTEGER) - (right.defaultUnitPriceMinor ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "ru");
    return left.name.localeCompare(right.name, "ru");
  });
}

function formatPrice(value: number | null) {
  if (value === null) return "Цена не указана";
  return new Intl.NumberFormat("ru-RU", { currency: "RUB", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}
