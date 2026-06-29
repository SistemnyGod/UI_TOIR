import type { InventoryItemSetDto, InventoryItemSetItemDto } from "../../../api/contracts";
import { PpeState } from "./ppeCommon";

type PickerReferenceListProps = {
  categoryId: string;
  emptyText: string;
  loading: boolean;
  loadingSetId: string;
  onAdd: (row: InventoryItemSetDto) => void;
  query: string;
  rows: InventoryItemSetDto[];
  setItemsById: Record<string, InventoryItemSetItemDto[]>;
};

export function PpePickerReferenceList({
  categoryId,
  emptyText,
  loading,
  loadingSetId,
  onAdd,
  query,
  rows,
  setItemsById,
}: PickerReferenceListProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    const items = setItemsById[row.id] ?? [];
    const categories = getSetCategoryNames(items).join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || `${row.name} ${categories}`.toLowerCase().includes(normalizedQuery);
    const matchesCategory = !categoryId || items.some((item) => item.item.categoryId === categoryId);
    return matchesQuery && matchesCategory;
  });

  if (loading && !rows.length) {
    return <PpeState kind="loading" title="Загружаем наборы" text="Подтягиваем состав и категории наборов СИЗ." />;
  }

  if (!visibleRows.length) {
    return <PpeState kind="empty" title="Справочник пуст" text={emptyText} />;
  }

  return (
    <div className="inventory-ppe-reference-list">
      {visibleRows.map((row) => {
        const items = setItemsById[row.id] ?? [];
        const categories = getSetCategoryNames(items);
        const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

        return (
          <article className="inventory-ppe-reference-card" key={row.id}>
            <div className="inventory-ppe-reference-card-head">
              <div>
                <strong>{row.name}</strong>
                <span>{row.itemsCount} позиций в наборе</span>
              </div>
              <button className="button ghost" disabled={loadingSetId === row.id || row.itemsCount === 0} onClick={() => onAdd(row)} type="button">
                {loadingSetId === row.id ? "Загрузка..." : "Добавить набор"}
              </button>
            </div>
            <div className="inventory-ppe-reference-meta">
              <span className="inventory-ppe-reference-chip">
                {categories.length ? categories.join(", ") : loading ? "Загружаем категории..." : "Категории не указаны"}
              </span>
              <span className="inventory-ppe-reference-chip">Всего {totalQuantity || row.itemsCount} шт.</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function getSetCategoryNames(items: InventoryItemSetItemDto[]) {
  return Array.from(new Set(items.map((row) => row.item.category).filter(Boolean))) as string[];
}
