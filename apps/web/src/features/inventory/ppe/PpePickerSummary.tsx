import type { InventoryItemDto } from "../../../api/contracts";
import { formatMoney } from "./ppeCommon";
import { parsePriceText, type PickerSelectedDraft } from "./ppeWizardDomain";

export function PpePickerSummary({
  drafts,
  items,
  total,
}: {
  drafts: Record<string, PickerSelectedDraft>;
  items: InventoryItemDto[];
  total: number;
}) {
  return (
    <aside className="inventory-ppe-picker-summary">
      <div>
        <span>Итого к выдаче</span>
        <strong>{items.length}</strong>
        <small>{items.length} позиций выбрано</small>
      </div>
      <div>
        <span>Сумма</span>
        <strong>{formatMoney(total)}</strong>
        <small>
          {items.some((item) => parsePriceText(drafts[item.id]?.priceText) === 0)
            ? "Есть позиции без цены"
            : "По выбранным предметам"}
        </small>
      </div>
    </aside>
  );
}
