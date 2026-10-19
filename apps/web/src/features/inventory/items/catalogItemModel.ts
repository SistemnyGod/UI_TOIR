import type { InventoryItemDto, InventorySettingsDto, UpsertInventoryItemDto } from "../../../api/contracts";

export type ItemFormState = {
  actualItemName: string;
  article: string;
  brandName: string;
  categoryId: string;
  clothingSize: string;
  comment: string;
  defaultLifeMonths: string;
  defaultUnitPrice: string;
  gloveSize: string;
  headSize: string;
  heightSize: string;
  isActive: boolean;
  isConsumable: boolean;
  itemKind: string;
  minStockQty: string;
  modelName: string;
  name: string;
  normItemName: string;
  protectionClass: string;
  respiratorSize: string;
  shoeSize: string;
  standardsText: string;
  sku: string;
  trackingType: string;
  trackLife: boolean;
  unitId: string;
};

export type ItemFormErrors = Partial<Record<"name" | "defaultLifeMonths" | "defaultUnitPrice" | "minStockQty", string>>;

export function createEmptyForm(settings?: InventorySettingsDto): ItemFormState {
  return {
    actualItemName: "",
    article: "",
    brandName: "",
    categoryId: settings?.categories[0]?.id ?? "",
    clothingSize: "",
    comment: "",
    defaultLifeMonths: "",
    defaultUnitPrice: "",
    gloveSize: "",
    headSize: "",
    heightSize: "",
    isActive: true,
    isConsumable: false,
    itemKind: "",
    minStockQty: "",
    modelName: "",
    name: "",
    normItemName: "",
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: "",
    standardsText: "",
    trackingType: "quantity",
    trackLife: true,
    unitId: settings?.units[0]?.id ?? "",
  };
}

export function itemToForm(item: InventoryItemDto): ItemFormState {
  return {
    actualItemName: item.actualItemName ?? "",
    article: item.article || item.sku || "",
    brandName: item.brandName ?? "",
    categoryId: item.categoryId ?? "",
    clothingSize: item.clothingSize ?? "",
    comment: item.comment ?? "",
    defaultLifeMonths: item.defaultLifeMonths?.toString() ?? "",
    defaultUnitPrice: moneyMinorToInput(item.defaultUnitPriceMinor),
    gloveSize: item.gloveSize ?? "",
    headSize: item.headSize ?? "",
    heightSize: item.heightSize ?? "",
    isActive: item.isActive,
    isConsumable: item.isConsumable,
    itemKind: item.itemKind ?? "",
    minStockQty: item.minStockQty?.toString() ?? "",
    modelName: item.modelName ?? "",
    name: item.name ?? "",
    normItemName: item.normItemName ?? "",
    protectionClass: item.protectionClass ?? "",
    respiratorSize: item.respiratorSize ?? "",
    shoeSize: item.shoeSize ?? "",
    sku: item.sku ?? "",
    standardsText: (item.standards ?? []).map(row => `${row.designation}${row.name ? ` | ${row.name}` : ""}`).join("\n"),
    trackingType: item.trackingType || "quantity",
    trackLife: item.trackLife,
    unitId: item.unitId ?? "",
  };
}

export function validateItemForm(form: ItemFormState): ItemFormErrors {
  const errors: ItemFormErrors = {};
  if (!form.name.trim()) errors.name = "Укажите название позиции";
  if (form.defaultLifeMonths.trim()) {
    const value = Number(form.defaultLifeMonths.replace(",", "."));
    if (!Number.isSafeInteger(value) || value < 0) errors.defaultLifeMonths = "Укажите целое число месяцев от нуля";
  }
  if (form.defaultUnitPrice.trim()) {
    const value = Number(form.defaultUnitPrice.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) errors.defaultUnitPrice = "Цена должна быть неотрицательным числом";
  }
  if (form.minStockQty.trim()) {
    const value = Number(form.minStockQty.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) errors.minStockQty = "Количество должно быть неотрицательным числом";
  }
  return errors;
}
export function itemFormToPayload(form: ItemFormState): UpsertInventoryItemDto {
  return {
    actualItemName: trimToNull(form.actualItemName),
    article: trimToNull(form.article || form.sku),
    brandName: trimToNull(form.brandName),
    categoryId: trimToNull(form.categoryId),
    clothingSize: trimToNull(form.clothingSize),
    comment: trimToNull(form.comment),
    defaultLifeMonths: parseOptionalInteger(form.defaultLifeMonths),
    defaultUnitPriceMinor: parseMoneyMinor(form.defaultUnitPrice),
    gloveSize: trimToNull(form.gloveSize),
    headSize: trimToNull(form.headSize),
    heightSize: trimToNull(form.heightSize),
    isActive: form.isActive,
    isConsumable: form.isConsumable,
    itemKind: trimToNull(form.itemKind),
    minStockQty: parseOptionalNumber(form.minStockQty),
    modelName: trimToNull(form.modelName),
    name: form.name.trim(),
    normItemName: trimToNull(form.normItemName),
    protectionClass: trimToNull(form.protectionClass),
    respiratorSize: trimToNull(form.respiratorSize),
    shoeSize: trimToNull(form.shoeSize),
    sku: trimToNull(form.sku || form.article),
    standards: parseStandards(form.standardsText),
    trackingType: trimToNull(form.trackingType) ?? "quantity",
    trackLife: form.trackLife,
    unitId: trimToNull(form.unitId),
  };
}

function parseStandards(value: string) {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [designation, ...name] = line.split("|");
    return { designation: designation.trim(), name: name.join("|").trim() };
  });
}

export function itemToPayload(item: InventoryItemDto, patch: Partial<UpsertInventoryItemDto> = {}): UpsertInventoryItemDto {
  return {
    actualItemName: trimToNull(item.actualItemName),
    article: trimToNull(item.article),
    brandName: trimToNull(item.brandName),
    categoryId: item.categoryId,
    clothingSize: trimToNull(item.clothingSize),
    comment: trimToNull(item.comment),
    defaultLifeMonths: item.defaultLifeMonths,
    defaultUnitPriceMinor: item.defaultUnitPriceMinor,
    gloveSize: trimToNull(item.gloveSize),
    headSize: trimToNull(item.headSize),
    heightSize: trimToNull(item.heightSize),
    isActive: item.isActive,
    isConsumable: item.isConsumable,
    itemKind: trimToNull(item.itemKind),
    minStockQty: item.minStockQty,
    modelName: trimToNull(item.modelName),
    name: item.name,
    normItemName: trimToNull(item.normItemName),
    protectionClass: trimToNull(item.protectionClass),
    respiratorSize: trimToNull(item.respiratorSize),
    shoeSize: trimToNull(item.shoeSize),
    sku: trimToNull(item.sku),
    trackingType: trimToNull(item.trackingType) ?? "quantity",
    trackLife: item.trackLife,
    unitId: item.unitId,
    ...patch,
  };
}

function moneyMinorToInput(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

function parseMoneyMinor(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function parseOptionalInteger(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isSafeInteger(parsed) ? parsed : null;
}

function parseOptionalNumber(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function trimToNull(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Compare only writable fields. Stock counters and labels do not belong to this editor. */
export function catalogItemSnapshot(item: InventoryItemDto) {
  return JSON.stringify({ ...itemToPayload(item), standards: item.standards ?? [] });
}

