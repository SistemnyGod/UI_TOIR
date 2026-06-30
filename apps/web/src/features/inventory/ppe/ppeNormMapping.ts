import type { InventoryItemDto, InventoryPositionNormDto } from "../../../api/contracts";
import { itemModelDescription } from "./ppePrintMapping";

const PPE_NORM_MAPPING_STORAGE_KEY = "patrol360:inventory-ppe-norm-item-mapping:v1";

export type PpeNormItemCatalogMapping = {
  brandModelArticle?: string;
  itemId: string;
  normKey: string;
  priceText?: string;
};

export function ppeNormKey(positionName: string, normItemName?: string | null, normPoint?: string | null) {
  return [positionName, normItemName, normPoint]
    .map((part) => (part ?? "").trim().toLocaleLowerCase("ru-RU"))
    .join("::");
}

export function ppeNormKeyFromNorm(norm: InventoryPositionNormDto) {
  return ppeNormKey(norm.positionName, norm.normItemName || norm.itemName, norm.normPoint);
}

export function loadPpeNormMappings(): Record<string, PpeNormItemCatalogMapping> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PPE_NORM_MAPPING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return isMappingRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function savePpeNormMapping(mapping: PpeNormItemCatalogMapping) {
  if (typeof window === "undefined") return;
  const current = loadPpeNormMappings();
  window.localStorage.setItem(
    PPE_NORM_MAPPING_STORAGE_KEY,
    JSON.stringify({
      ...current,
      [mapping.normKey]: mapping,
    }),
  );
}

export function removePpeNormMapping(normKey: string) {
  if (typeof window === "undefined") return;
  const current = loadPpeNormMappings();
  const { [normKey]: _, ...rest } = current;
  window.localStorage.setItem(PPE_NORM_MAPPING_STORAGE_KEY, JSON.stringify(rest));
}

export function mappedItemForNorm(
  norm: InventoryPositionNormDto,
  itemsById: Map<string, InventoryItemDto>,
  mappings: Record<string, PpeNormItemCatalogMapping>,
) {
  const mapping = mappings[ppeNormKeyFromNorm(norm)];
  return itemsById.get(mapping?.itemId ?? "") ?? itemsById.get(norm.itemId) ?? null;
}

export function mappingFromItem(norm: InventoryPositionNormDto, item: InventoryItemDto): PpeNormItemCatalogMapping {
  return {
    brandModelArticle: itemModelDescription(item),
    itemId: item.id,
    normKey: ppeNormKeyFromNorm(norm),
  };
}

function isMappingRecord(value: unknown): value is Record<string, PpeNormItemCatalogMapping> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (row) =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as PpeNormItemCatalogMapping).normKey === "string" &&
      typeof (row as PpeNormItemCatalogMapping).itemId === "string",
  );
}
