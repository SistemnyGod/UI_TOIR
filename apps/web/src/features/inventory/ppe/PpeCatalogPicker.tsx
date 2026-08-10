import { useEffect, useRef, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
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
  comment: string;
};

export function PpeCatalogPicker({ onClose, onConfirm, warehouses = [] }: { onClose: () => void; onConfirm: (selection: PpeCatalogSelection) => void; warehouses?: InventoryReferenceOptionDto[] }) {
  const repository = useInventoryRepository();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InventoryItemDto[]>([]);
  const [selected, setSelected] = useState<InventoryItemDto | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [sizeText, setSizeText] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [unitPriceMinor, setUnitPriceMinor] = useState<number | null>(null);
  const [comment, setComment] = useState("");
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

  function selectItem(item: InventoryItemDto) {
    setSelected(item);
    setQuantity(1);
    setSizeText(item.clothingSize || item.shoeSize || "");
    setWarehouseId(warehouses.find((warehouse) => warehouse.isActive)?.id ?? null);
    setUnitPriceMinor(item.defaultUnitPriceMinor ?? null);
    setComment("");
  }
  return (
    <PpeModalShell
      ariaLabel="Выбрать спецодежду из номенклатуры"
      className="ppe-catalog-picker-modal"
      description="Сначала выберите фактическую позицию. На следующем шаге бухгалтер подтвердит норму АТОМ."
      footer={(
        <>
          <PpeButton onClick={onClose} variant="ghost">Отмена</PpeButton>
          <PpeButton disabled={!selected || quantity <= 0} onClick={() => selected && onConfirm({ comment, item: selected, quantity, sizeText, unitPriceMinor, warehouseId })} variant="primary">Сохранить выбор</PpeButton>
        </>
      )}
      initialFocusSelector="#ppe-catalog-picker-search"
      onClose={onClose}
      title="Выбор спецодежды"
    >
      <label className="ppe-issue-search" htmlFor="ppe-catalog-picker-search"><Search size={17} /><input id="ppe-catalog-picker-search" onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Название, артикул, модель или категория" value={query} /></label>
      {error ? <div className="ppe-issue-error" role="alert">{error}<PpeButton onClick={() => setReloadToken((value) => value + 1)} variant="link">Повторить</PpeButton></div> : null}
      {loading ? <div className="ppe-issue-empty-inline" role="status"><PackageSearch size={18} />Загрузка номенклатуры…</div> : null}
      {!loading && !error && !rows.length ? <div className="ppe-issue-empty-inline" role="status"><PackageSearch size={18} />По заданному запросу позиции не найдены.</div> : null}
      <div aria-busy={loading} aria-label="Позиции номенклатуры" className="ppe-catalog-item-grid" role="listbox">
        {rows.map((item) => {
          const active = item.id === selected?.id;
          return <button aria-selected={active} className={`ppe-catalog-item-card ${active ? "is-selected" : ""}`} key={item.id} onClick={() => selectItem(item)} role="option" type="button">
            <strong>{item.name}</strong>
            <small>{[item.brandName, item.modelName, item.article].filter(Boolean).join(" · ") || "Модель не указана"}</small>
            <span>{item.unit || "шт."} · Остаток: {item.stockAvailable ?? "—"}</span>
          </button>;
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
      {selected ? <div className="ppe-catalog-selection-editor" aria-label="Параметры выбранной позиции">
        <strong>Параметры выбранной позиции</strong>
        <div className="ppe-catalog-selection-grid">
          <label><span>Количество</span><input min="0.01" onChange={(event) => setQuantity(Number(event.target.value))} step="0.01" type="number" value={quantity} /></label>
          <label><span>Размер</span><input onChange={(event) => setSizeText(event.target.value)} placeholder="Не указан" value={sizeText} /></label>
          <label><span>Цена за единицу</span><input min="0.01" onChange={(event) => { const value = Number(event.target.value); setUnitPriceMinor(Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null); }} step="0.01" type="number" value={unitPriceMinor === null ? "" : (unitPriceMinor / 100).toFixed(2)} /></label>
          <label><span>Склад</span><select onChange={(event) => setWarehouseId(event.target.value || null)} value={warehouseId ?? ""}><option value="">Выберите склад позже</option>{warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
          <label className="ppe-catalog-selection-comment"><span>Комментарий</span><textarea onChange={(event) => setComment(event.target.value)} placeholder="Необязательно" rows={2} value={comment} /></label>
        </div>
      </div> : null}
    </PpeModalShell>
  );
}
