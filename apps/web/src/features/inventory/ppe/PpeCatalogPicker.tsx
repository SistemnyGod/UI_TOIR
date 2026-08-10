import { useEffect, useRef, useState } from "react";
import { Check, PackageSearch, Search, X } from "lucide-react";
import type { InventoryItemDto, InventoryReferenceOptionDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { PpeButton, PpeModalShell } from "./PpeUi";
import "../styles/ppe-catalog-picker.css";

export type PpeCatalogSelection = {
  item: InventoryItemDto;
  quantity: number;
  sizeText: string;
  warehouseId: string | null;
  unitPriceMinor: number | null;
  brandModelArticle: string;
  comment: string;
};

type CatalogSelectionDraft = Omit<PpeCatalogSelection, "unitPriceMinor"> & {
  priceText: string;
};

export function PpeCatalogPicker({
  onClose,
  onConfirm,
  singleSelection = false,
  warehouses = [],
}: {
  onClose: () => void;
  onConfirm: (selections: PpeCatalogSelection[]) => void;
  singleSelection?: boolean;
  warehouses?: InventoryReferenceOptionDto[];
}) {
  const repository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InventoryItemDto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<string, CatalogSelectionDraft>>({});
  const [activeSelectionId, setActiveSelectionId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    repository.getPpeItems({ page, pageSize, query: query.trim() || undefined })
      .then((result) => {
        if (cancelled || currentRequest !== requestId.current) return;
        setRows(result.rows);
        setPageCount(Math.max(1, result.pageCount));
        setTotal(result.total);
      })
      .catch((reason) => {
        if (cancelled || currentRequest !== requestId.current) return;
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить номенклатуру");
      })
      .finally(() => {
        if (!cancelled && currentRequest === requestId.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, pageSize, query, reloadToken, repository]);

  const activeSelection = activeSelectionId ? selectedItems[activeSelectionId] ?? null : null;

  function selectItem(item: InventoryItemDto) {
    const alreadySelected = Boolean(selectedItems[item.id]);
    if (alreadySelected) {
      if (singleSelection) return;
      removeSelection(item.id);
      return;
    }

    const next = createSelectionDraft(item, warehouses);
    setSelectedItems(singleSelection ? { [item.id]: next } : (current) => ({ ...current, [item.id]: next }));
    setSelectedIds(singleSelection ? [item.id] : (current) => [...current, item.id]);
    setActiveSelectionId(item.id);
  }

  function removeSelection(itemId: string) {
    setSelectedIds((current) => {
      const next = current.filter((id) => id !== itemId);
      if (activeSelectionId === itemId) setActiveSelectionId(next[0] ?? "");
      return next;
    });
    setSelectedItems((current) => {
      const { [itemId]: _, ...rest } = current;
      return rest;
    });
  }

  function updateActiveSelection(patch: Partial<CatalogSelectionDraft>) {
    if (!activeSelectionId) return;
    setSelectedItems((current) => {
      const currentSelection = current[activeSelectionId];
      return currentSelection
        ? { ...current, [activeSelectionId]: { ...currentSelection, ...patch } }
        : current;
    });
  }

  function confirmSelections() {
    const selections: PpeCatalogSelection[] = [];
    for (const itemId of selectedIds) {
      const draft = selectedItems[itemId];
      if (!draft) continue;
      if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) {
        setActiveSelectionId(itemId);
        setError(`Количество для позиции «${draft.item.name}» должно быть больше нуля`);
        return;
      }
      const normalizedPrice = draft.priceText.trim().replace(",", ".");
      const parsedPrice = normalizedPrice ? Number(normalizedPrice) : null;
      if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
        setActiveSelectionId(itemId);
        setError(`Проверьте цену для позиции «${draft.item.name}»`);
        return;
      }
      selections.push({
        brandModelArticle: draft.brandModelArticle.trim(),
        comment: draft.comment.trim(),
        item: draft.item,
        quantity: draft.quantity,
        sizeText: draft.sizeText.trim(),
        unitPriceMinor: parsedPrice === null ? null : Math.round(parsedPrice * 100),
        warehouseId: draft.warehouseId,
      });
    }
    if (!selections.length) {
      setError("Отметьте хотя бы одну позицию номенклатуры");
      return;
    }
    onConfirm(selections);
  }

  return (
    <PpeModalShell
      ariaLabel="Выбрать спецодежду из номенклатуры"
      className="ppe-catalog-picker-modal"
      description={singleSelection
        ? "Выберите замену для текущей позиции и заполните параметры выдачи."
        : "Отметьте несколько фактических позиций, заполните их параметры и добавьте одним действием. Норма АТОМ подтверждается следующим шагом."
      }
      footer={(
        <>
          <span className="ppe-catalog-footer-summary" aria-live="polite">
            Выбрано: <strong>{selectedIds.length}</strong>
          </span>
          <PpeButton onClick={onClose} variant="ghost">Отмена</PpeButton>
          <PpeButton disabled={!selectedIds.length || loading} onClick={confirmSelections} variant="primary">
            {singleSelection ? "Заменить товар" : `Добавить выбранные${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </PpeButton>
        </>
      )}
      initialFocusSelector="#ppe-catalog-picker-search"
      onClose={onClose}
      title="Выбор спецодежды"
    >
      <div className="ppe-catalog-picker-intro" role="status">
        <span className="ppe-catalog-picker-intro-step">1</span>
        <div>
          <strong>{singleSelection ? "Выберите товар для замены" : "Сначала отметьте все нужные товары"}</strong>
          <span>Цена и артикул/модель редактируются для текущего документа и не меняют справочник номенклатуры.</span>
        </div>
      </div>

      <label className="ppe-issue-search" htmlFor="ppe-catalog-picker-search">
        <Search size={17} />
        <input
          id="ppe-catalog-picker-search"
          onChange={(event) => { setPage(1); setQuery(event.target.value); }}
          placeholder="Название, артикул, модель или категория"
          value={query}
        />
      </label>
      {error ? <div className="ppe-issue-error" role="alert">{error}<PpeButton onClick={() => setReloadToken((value) => value + 1)} variant="link">Повторить</PpeButton></div> : null}
      {loading ? <div className="ppe-issue-empty-inline" role="status"><PackageSearch size={18} />Загрузка номенклатуры…</div> : null}
      {!loading && !error && !rows.length ? <div className="ppe-issue-empty-inline" role="status"><PackageSearch size={18} />По заданному запросу позиции не найдены.</div> : null}

      <div aria-busy={loading} aria-label="Позиции номенклатуры" className="ppe-catalog-item-grid" role="listbox" aria-multiselectable={!singleSelection}>
        {rows.map((item) => {
          const active = Boolean(selectedItems[item.id]);
          return (
            <button
              aria-selected={active}
              className={`ppe-catalog-item-card ${active ? "is-selected" : ""}`}
              key={item.id}
              onClick={() => selectItem(item)}
              role="option"
              type="button"
            >
              <span className="ppe-catalog-item-check" aria-hidden="true">{active ? <Check size={14} /> : null}</span>
              <span className="ppe-catalog-item-copy">
                <strong>{item.name}</strong>
                <small>{[item.brandName, item.modelName, item.article].filter(Boolean).join(" · ") || "Модель не указана"}</small>
                <span>{item.unit || "шт."} · Остаток: {item.stockAvailable ?? "—"}</span>
              </span>
            </button>
          );
        })}
      </div>

      <nav aria-label="Страницы номенклатуры" className="ppe-catalog-picker-pagination">
        <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} из ${total}` : "Нет позиций"}</span>
        <label><span>Показывать</span><select aria-label="Количество позиций на странице" onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} value={pageSize}><option value={12}>12</option><option value={24}>24</option><option value={48}>48</option></select></label>
        <div>
          <PpeButton aria-label="Предыдущая страница" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="compact">Назад</PpeButton>
          <span aria-live="polite">Стр. {page} из {pageCount}</span>
          <PpeButton aria-label="Следующая страница" disabled={loading || page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} size="compact">Вперёд</PpeButton>
        </div>
      </nav>

      {selectedIds.length ? (
        <section className="ppe-catalog-selection-basket" aria-label="Выбранные позиции">
          <header><div><strong>Выбранные позиции</strong><span>{selectedIds.length} {selectedIds.length === 1 ? "позиция" : "позиций"}</span></div><small>Выберите карточку, чтобы изменить её параметры</small></header>
          <div className="ppe-catalog-selection-basket-list">
            {selectedIds.map((itemId) => {
              const selected = selectedItems[itemId];
              if (!selected) return null;
              return (
                <article className={itemId === activeSelectionId ? "is-active" : ""} key={itemId}>
                  <button aria-pressed={itemId === activeSelectionId} className="ppe-catalog-selection-summary" onClick={() => setActiveSelectionId(itemId)} type="button">
                    <strong>{selected.item.name}</strong>
                    <span>{selected.quantity} {selected.item.unit || "шт."} · {selected.brandModelArticle || "Артикул не указан"}</span>
                  </button>
                  {!singleSelection ? <button aria-label={`Убрать ${selected.item.name}`} className="ppe-catalog-selection-remove" onClick={() => removeSelection(itemId)} type="button"><X size={15} /></button> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeSelection ? (
        <section className="ppe-catalog-selection-editor" aria-label={`Параметры ${activeSelection.item.name}`}>
          <header><div><strong>Параметры выбранной позиции</strong><span>{activeSelection.item.name}</span></div></header>
          <div className="ppe-catalog-selection-grid">
            <label><span>Количество</span><input aria-label={`Количество ${activeSelection.item.name}`} min="0.01" onChange={(event) => updateActiveSelection({ quantity: Number(event.target.value) })} step="0.01" type="number" value={activeSelection.quantity} /></label>
            <label><span>Цена за единицу, ₽</span><input aria-label={`Цена ${activeSelection.item.name}`} inputMode="decimal" min="0" onChange={(event) => updateActiveSelection({ priceText: event.target.value })} placeholder="Введите цену" step="0.01" type="text" value={activeSelection.priceText} /></label>
            <label><span>Артикул / модель</span><input aria-label={`Артикул или модель ${activeSelection.item.name}`} onChange={(event) => updateActiveSelection({ brandModelArticle: event.target.value })} placeholder="Введите артикул или модель" value={activeSelection.brandModelArticle} /></label>
            <label><span>Размер</span><input aria-label={`Размер ${activeSelection.item.name}`} onChange={(event) => updateActiveSelection({ sizeText: event.target.value })} placeholder="Не указан" value={activeSelection.sizeText} /></label>
            <label><span>Склад</span><select aria-label={`Склад ${activeSelection.item.name}`} onChange={(event) => updateActiveSelection({ warehouseId: event.target.value || null })} value={activeSelection.warehouseId ?? ""}><option value="">Выберите склад позже</option>{warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <label className="ppe-catalog-selection-comment"><span>Комментарий</span><textarea aria-label={`Комментарий ${activeSelection.item.name}`} onChange={(event) => updateActiveSelection({ comment: event.target.value })} placeholder="Необязательно" rows={2} value={activeSelection.comment} /></label>
          </div>
        </section>
      ) : <div className="ppe-catalog-selection-empty"><PackageSearch size={24} /><strong>Отметьте одну или несколько позиций</strong><span>После выбора здесь появятся поля цены, артикула, размера и склада.</span></div>}
    </PpeModalShell>
  );
}

function createSelectionDraft(item: InventoryItemDto, warehouses: InventoryReferenceOptionDto[]): CatalogSelectionDraft {
  return {
    brandModelArticle: [item.brandName, item.modelName, item.article].filter(Boolean).join(" · "),
    comment: "",
    item,
    priceText: item.defaultUnitPriceMinor === null ? "" : String(item.defaultUnitPriceMinor / 100),
    quantity: 1,
    sizeText: item.clothingSize || item.shoeSize || "",
    warehouseId: warehouses.find((warehouse) => warehouse.isActive)?.id ?? null,
  };
}
