import type { InventoryItemDto } from "../../../api/contracts";
import { PPE_ISSUE_PERIOD_OPTIONS } from "./ppeStatusCatalog";
import { createSelectedDraft, parsePriceText, type PickerSelectedDraft } from "./ppeWizardDomain";

export function PpePickerSelectedItems({
  drafts,
  items,
  onDraftChange,
}: {
  drafts: Record<string, PickerSelectedDraft>;
  items: InventoryItemDto[];
  onDraftChange: (itemId: string, patch: Partial<PickerSelectedDraft>) => void;
}) {
  return (
    <div className="inventory-ppe-lines-wrap inventory-ppe-picker-selected-table">
      <datalist id="ppe-picker-period-options">
        {PPE_ISSUE_PERIOD_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <table className="inventory-ppe-lines-table">
        <thead>
          <tr>
            <th>СИЗ по норме</th>
            <th>Номенклатура</th>
            <th>Марка / модель / артикул</th>
            <th>Периодичность</th>
            <th>Контроль</th>
            <th>Цена</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const draft = drafts[item.id] ?? {
              ...createSelectedDraft(item),
            };

            return (
              <tr className={parsePriceText(draft.priceText) === 0 ? "has-warning" : ""} key={item.id}>
                <td>
                  <input
                    aria-label={`СИЗ по норме ${item.name}`}
                    onChange={(event) => onDraftChange(item.id, { printItemName: event.target.value })}
                    value={draft.printItemName}
                  />
                  <span>Нормативное наименование для личной карточки и листа подписи.</span>
                </td>
                <td>
                  <strong>{item.name}</strong>
                  <span>{item.category || "без категории"}</span>
                </td>
                <td>
                  <input
                    aria-label={`Модель, марка или артикул ${item.name}`}
                    list="ppe-model-suggestions"
                    onChange={(event) => onDraftChange(item.id, { brandModelArticle: event.target.value })}
                    placeholder="СОМЗ, Форвард, Эксперт К3, SIM-06/K"
                    value={draft.brandModelArticle}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Периодичность ${item.name}`}
                    list="ppe-picker-period-options"
                    onChange={(event) => onDraftChange(item.id, { issuePeriodText: event.target.value })}
                    value={draft.issuePeriodText}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Срок ${item.name}`}
                    onChange={(event) => onDraftChange(item.id, { dueAt: event.target.value })}
                    type="date"
                    value={draft.dueAt}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Цена ${item.name}`}
                    inputMode="decimal"
                    onChange={(event) => onDraftChange(item.id, { priceText: event.target.value })}
                    value={draft.priceText}
                  />
                  {parsePriceText(draft.priceText) === 0 ? <span className="inventory-ppe-field-warning">Укажите цену</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
