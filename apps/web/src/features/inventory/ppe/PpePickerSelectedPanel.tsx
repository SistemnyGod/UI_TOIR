import type { InventoryItemDto } from "../../../api/contracts";
import { PpeState } from "./ppeCommon";
import { PpePickerSelectedItems } from "./PpePickerSelectedItems";
import type { PickerSelectedDraft } from "./ppeWizardDomain";

export function PpePickerSelectedPanel({
  drafts,
  items,
  onDraftChange,
}: {
  drafts: Record<string, PickerSelectedDraft>;
  items: InventoryItemDto[];
  onDraftChange: (itemId: string, patch: Partial<PickerSelectedDraft>) => void;
}) {
  return (
    <div className="inventory-ppe-picker-selected">
      {!items.length ? (
        <PpeState kind="empty" title="СИЗ не выбраны" text="Отметьте одну или несколько позиций в списке выше." />
      ) : (
        <PpePickerSelectedItems drafts={drafts} items={items} onDraftChange={onDraftChange} />
      )}
    </div>
  );
}
