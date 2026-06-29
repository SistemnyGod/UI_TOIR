import type { InventoryItemDto } from "../../../api/contracts";
import { formatMoney, PpeState } from "./ppeCommon";

export function PpePickerCatalogGrid({
  items,
  loading,
  onToggle,
  selected,
}: {
  items: InventoryItemDto[];
  loading: boolean;
  onToggle: (itemId: string) => void;
  selected: Set<string>;
}) {
  if (loading) {
    return <PpeState kind="loading" title="Загружаем номенклатуру" text="Подбираем СИЗ по поиску и категории." />;
  }

  if (!items.length) {
    return <PpeState kind="empty" title="Нет предметов по фильтру" text="Измените поиск или выберите другую категорию." />;
  }

  return (
    <div className="inventory-ppe-picker-grid">
      {items.map((item) => {
        const isSelected = selected.has(item.id);

        return (
          <button className={isSelected ? "is-selected" : ""} key={item.id} onClick={() => onToggle(item.id)} type="button">
            <span className="inventory-ppe-picker-check">{isSelected ? "✓" : ""}</span>
            <span className="inventory-ppe-picker-item-main">
              <strong>{item.name}</strong>
              <small>{[item.article || item.sku || "без артикула", item.category || "без категории"].join(" • ")}</small>
            </span>
            <em>{formatMoney(item.defaultUnitPriceMinor ? item.defaultUnitPriceMinor / 100 : 0)}</em>
          </button>
        );
      })}
    </div>
  );
}
