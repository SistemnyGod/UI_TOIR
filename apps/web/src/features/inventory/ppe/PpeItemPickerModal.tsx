import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryItemSetItemDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { getDefaultDueDate, getDefaultIssuePeriodText, itemModelDescription, moneyMinorToInput } from "./ppeCommon";
import { PpePickerContent } from "./PpePickerContent";
import { PpePickerDatalists } from "./PpePickerDatalists";
import { PpePickerFilters } from "./PpePickerFilters";
import { PpePickerFooterActions } from "./PpePickerFooterActions";
import { PpePickerSelectedPanel } from "./PpePickerSelectedPanel";
import { PpePickerSummary } from "./PpePickerSummary";
import { PpePickerTabs, type PpePickerTab } from "./PpePickerTabs";
import type { PickerLineInput } from "./ppeTypes";
import {
  createManualNormDraft,
  createSelectedDraft,
  createEmptySelectedDraft,
  isPpeCatalogItem,
  loadManualNorms,
  loadModelSuggestions,
  parsePriceText,
  saveManualNorms,
  saveModelSuggestion,
  type ManualNormDraft,
  type PickerSelectedDraft,
  type StoredManualNorm,
} from "./ppeWizardDomain";

export function PpeItemPickerModal({
  employee,
  isOpen,
  items,
  onAdd,
  onClose,
  settings,
}: {
  employee: InventoryEmployeeDto | null;
  isOpen: boolean;
  items: InventoryItemDto[];
  onAdd: (lines: PickerLineInput[]) => void;
  onClose: () => void;
  settings?: InventorySettingsDto;
}) {
  const inventoryRepository = useInventoryRepository();
  const [tab, setTab] = useState<PpePickerTab>("items");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [manualDraft, setManualDraft] = useState<ManualNormDraft>(() => createManualNormDraft());
  const [manualNorms, setManualNorms] = useState<StoredManualNorm[]>(() => loadManualNorms());
  const [modelSuggestions, setModelSuggestions] = useState<string[]>(() => loadModelSuggestions());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, PickerSelectedDraft>>({});
  const [selectedItemsById, setSelectedItemsById] = useState<Record<string, InventoryItemDto>>({});
  const [catalogItems, setCatalogItems] = useState<InventoryItemDto[]>(items);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [loadingSetId, setLoadingSetId] = useState("");
  const [setItemsById, setSetItemsById] = useState<Record<string, InventoryItemSetItemDto[]>>({});
  const setsLoading = false;

  const itemsById = useMemo(() => new Map(catalogItems.map((item) => [item.id, item])), [catalogItems]);
  const ppeItems = useMemo(() => catalogItems.filter(isPpeCatalogItem), [catalogItems]);
  const activeSetRows = useMemo(() => (settings?.itemSets ?? []).filter((row) => row.isActive), [settings?.itemSets]);
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of ppeItems) {
      if (!item.categoryId) continue;
      counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }

    return (settings?.categories ?? [])
      .filter((row) => row.isActive)
      .map((row) => ({ count: counts.get(row.id) ?? 0, id: row.id, name: row.name }))
      .filter((row) => row.count > 0);
  }, [ppeItems, settings?.categories]);
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ppeItems.filter((item) => {
      const matchesQuery =
        !normalized || [item.name, item.article, item.sku, item.category].join(" ").toLowerCase().includes(normalized);
      const matchesCategory = !categoryId || item.categoryId === categoryId;
      return matchesQuery && matchesCategory;
    });
  }, [categoryId, ppeItems, query]);
  const selectedItems = useMemo(
    () =>
      Array.from(selected)
        .map((itemId) => selectedItemsById[itemId] ?? itemsById.get(itemId))
        .filter((item): item is InventoryItemDto => Boolean(item)),
    [itemsById, selected, selectedItemsById],
  );
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + parsePriceText(selectedDrafts[item.id]?.priceText), 0),
    [selectedDrafts, selectedItems],
  );
  const norms = useMemo(
    () =>
      settings?.positionNorms.filter(
        (norm) => employee?.position && norm.positionName.toLowerCase() === employee.position.toLowerCase(),
      ) ?? [],
    [employee?.position, settings?.positionNorms],
  );

  useEffect(() => {
    if (!isOpen) return;

    setCatalogItems(items);
    setSelected(new Set());
    setSelectedDrafts({});
    setSelectedItemsById({});
    setQuery("");
    setCategoryId("");
    setManualDraft(createManualNormDraft());
    setManualNorms(loadManualNorms());
    setModelSuggestions(loadModelSuggestions());
    setTab("items");
  }, [isOpen, items]);

  useEffect(() => {
    if (!isOpen || tab !== "items") return;

    let cancelled = false;
    setItemsLoading(true);
    const timer = window.setTimeout(() => {
      void inventoryRepository
        .getPpeItems({ categoryId: categoryId || undefined, pageSize: 100, query: query || undefined })
        .then((response) => {
          if (!cancelled) setCatalogItems(response.rows);
        })
        .finally(() => {
          if (!cancelled) setItemsLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [categoryId, inventoryRepository, isOpen, query, tab]);

  if (!isOpen) {
    return null;
  }

  function toggleItem(itemId: string) {
    const next = new Set(selected);
    if (next.has(itemId)) {
      next.delete(itemId);
      setSelectedDrafts((current) => {
        const { [itemId]: _, ...rest } = current;
        return rest;
      });
      setSelectedItemsById((current) => {
        const { [itemId]: _, ...rest } = current;
        return rest;
      });
    } else {
      next.add(itemId);
      const item = itemsById.get(itemId);
      if (item) {
        setSelectedItemsById((current) => ({ ...current, [itemId]: item }));
        setSelectedDrafts((current) => ({
          ...current,
          [itemId]: current[itemId] ?? createSelectedDraft(item),
        }));
      }
    }
    setSelected(next);
  }

  function patchSelectedDraft(itemId: string, patch: Partial<PickerSelectedDraft>) {
    setSelectedDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? createEmptySelectedDraft()),
        ...patch,
      },
    }));
  }

  async function addSet(setId: string) {
    try {
      setLoadingSetId(setId);
      const rows = setItemsById[setId] ?? (await inventoryRepository.getItemSetItems(setId));
      if (!setItemsById[setId]) {
        setSetItemsById((current) => ({ ...current, [setId]: rows }));
      }
      onAdd(
        rows.map((row) => ({
          brandModelArticle: itemModelDescription(row.item),
          catalogName: row.item.name,
          dueAt: getDefaultDueDate(row.item.defaultLifeMonths),
          issuePeriodText: getDefaultIssuePeriodText(row.item.defaultLifeMonths),
          item: row.item,
          normPoint: "Набор выдачи",
          printItemName: row.item.normItemName || row.item.name,
          priceText: moneyMinorToInput(row.item.defaultUnitPriceMinor),
          quantityText: String(row.quantity || 1),
        })),
      );
    } finally {
      setLoadingSetId("");
    }
  }

  function addManualNorm() {
    const item = itemsById.get(manualDraft.catalogItemId) ?? visibleItems[0];
    const normName = manualDraft.normName.trim();
    const normPoint = manualDraft.normPoint.trim();
    const issuePeriodText = manualDraft.issuePeriodText.trim();
    const quantityText = manualDraft.quantityText.trim() || "1";

    if (!item || !normName || !normPoint || !issuePeriodText) {
      return;
    }

    const stored = { issuePeriodText, normName, normPoint, quantityText };
    const nextNorms = [stored, ...manualNorms.filter((row) => row.normName !== normName || row.normPoint !== normPoint)].slice(0, 20);
    setManualNorms(nextNorms);
    saveManualNorms(nextNorms);
    setModelSuggestions((current) => saveModelSuggestion(manualDraft.brandModelArticle, current));
    onAdd([
      {
        brandModelArticle: manualDraft.brandModelArticle.trim() || itemModelDescription(item),
        catalogName: item.name,
        issuePeriodText,
        item,
        normPoint,
        printItemName: normName,
        priceText: moneyMinorToInput(item.defaultUnitPriceMinor),
        quantityText,
      },
    ]);
  }

  function addSelectedItems() {
    setModelSuggestions((current) =>
      selectedItems.reduce(
        (suggestions, item) => saveModelSuggestion(selectedDrafts[item.id]?.brandModelArticle ?? itemModelDescription(item), suggestions),
        current,
      ),
    );
    onAdd(
      selectedItems.map((item) => ({
        brandModelArticle: selectedDrafts[item.id]?.brandModelArticle ?? itemModelDescription(item),
        catalogName: item.name,
        dueAt: selectedDrafts[item.id]?.dueAt ?? getDefaultDueDate(item.defaultLifeMonths),
        issuePeriodText: selectedDrafts[item.id]?.issuePeriodText ?? getDefaultIssuePeriodText(item.defaultLifeMonths),
        item,
        normPoint: "п. 1645 Приложения № 1",
        priceText: selectedDrafts[item.id]?.priceText ?? moneyMinorToInput(item.defaultUnitPriceMinor),
        printItemName: selectedDrafts[item.id]?.printItemName ?? item.normItemName ?? item.name,
        quantityText: "1",
      })),
    );
  }

  return createPortal(
    <div className="inventory-ppe-picker-backdrop" onMouseDown={onClose} role="presentation">
      <section className="inventory-ppe-picker" onMouseDown={(event) => event.stopPropagation()} aria-label="Добавить СИЗ к выдаче">
        <header className="inventory-ppe-picker-head">
          <div>
            <h2>Добавить СИЗ к выдаче</h2>
            <p>Выберите предметы, нормы по должности или готовый набор.</p>
          </div>
          <button className="inventory-ppe-icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>
        <PpePickerTabs activeTab={tab} onChange={setTab} />
        <PpePickerDatalists modelSuggestions={modelSuggestions} />
        <div className="inventory-ppe-picker-layout">
          <div className="inventory-ppe-picker-main">
            <PpePickerFilters
              categoryId={categoryId}
              categoryOptions={categoryOptions}
              onCategoryChange={setCategoryId}
              onQueryChange={setQuery}
              query={query}
            />
            <PpePickerContent
              activeSetRows={activeSetRows}
              categoryId={categoryId}
              employee={employee}
              itemsById={itemsById}
              itemsLoading={itemsLoading}
              loadingSetId={loadingSetId}
              manualDraft={manualDraft}
              manualNorms={manualNorms}
              norms={norms}
              onAdd={onAdd}
              onAddManualNorm={addManualNorm}
              onAddSet={(setId) => void addSet(setId)}
              onManualDraftChange={(patch) => setManualDraft((current) => ({ ...current, ...patch }))}
              onToggleItem={toggleItem}
              query={query}
              selected={selected}
              setItemsById={setItemsById}
              setsLoading={setsLoading}
              tab={tab}
              visibleItems={visibleItems}
            />
          </div>

          <PpePickerSummary drafts={selectedDrafts} items={selectedItems} total={selectedTotal} />
        </div>
        <PpePickerSelectedPanel drafts={selectedDrafts} items={selectedItems} onDraftChange={patchSelectedDraft} />
        <PpePickerFooterActions canAdd={Boolean(selectedItems.length)} onAdd={addSelectedItems} onClose={onClose} />
      </section>
    </div>,
    document.body,
  );
}
