import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryItemSetItemDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import { PpeManualNormForm } from "./PpeManualNormForm";
import { PpePickerCatalogGrid } from "./PpePickerCatalogGrid";
import { PpePickerReferenceList } from "./PpePickerReferenceList";
import type { PpePickerTab } from "./PpePickerTabs";
import { PpePositionNormList } from "./PpePositionNormList";
import type { PickerLineInput } from "./ppeTypes";
import type { ManualNormDraft, StoredManualNorm } from "./ppeWizardDomain";

export function PpePickerContent({
  activeSetRows,
  categoryId,
  employee,
  itemsById,
  itemsLoading,
  loadingSetId,
  manualDraft,
  manualNorms,
  norms,
  onAdd,
  onAddManualNorm,
  onAddSet,
  onManualDraftChange,
  onToggleItem,
  query,
  selected,
  setItemsById,
  setsLoading,
  tab,
  visibleItems,
}: {
  activeSetRows: InventorySettingsDto["itemSets"];
  categoryId: string;
  employee: InventoryEmployeeDto | null;
  itemsById: Map<string, InventoryItemDto>;
  itemsLoading: boolean;
  loadingSetId: string;
  manualDraft: ManualNormDraft;
  manualNorms: StoredManualNorm[];
  norms: InventorySettingsDto["positionNorms"];
  onAdd: (lines: PickerLineInput[]) => void;
  onAddManualNorm: () => void;
  onAddSet: (setId: string) => void;
  onManualDraftChange: (patch: Partial<ManualNormDraft>) => void;
  onToggleItem: (itemId: string) => void;
  query: string;
  selected: Set<string>;
  setItemsById: Record<string, InventoryItemSetItemDto[]>;
  setsLoading: boolean;
  tab: PpePickerTab;
  visibleItems: InventoryItemDto[];
}) {
  if (tab === "items") {
    return <PpePickerCatalogGrid items={visibleItems} loading={itemsLoading} onToggle={onToggleItem} selected={selected} />;
  }

  if (tab === "norms") {
    return <PpePositionNormList employee={employee} itemsById={itemsById} norms={norms} onAdd={onAdd} />;
  }

  if (tab === "manual") {
    return (
      <PpeManualNormForm
        draft={manualDraft}
        items={visibleItems}
        manualNorms={manualNorms}
        onAdd={onAddManualNorm}
        onDraftChange={onManualDraftChange}
      />
    );
  }

  if (tab === "sets" || tab === "templates") {
    return (
      <PpePickerReferenceList
        categoryId={categoryId}
        emptyText={
          tab === "sets"
            ? "Наборы СИЗ пока не настроены."
            : "Шаблоны используют настроенные наборы СИЗ. Сначала заполните наборы."
        }
        loading={setsLoading}
        loadingSetId={loadingSetId}
        onAdd={(row) => onAddSet(row.id)}
        query={query}
        rows={activeSetRows}
        setItemsById={setItemsById}
      />
    );
  }

  return null;
}
