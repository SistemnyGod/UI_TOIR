import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardLineDto,
  InventoryPositionNormDto,
} from "../../../api/contracts";
import { defaultIssuePeriodText } from "./ppeStatusCatalog";
import { moneyMinorToInput, parsePositiveQuantity } from "./ppeFormatters";
import type { PickerLineInput, PpeWizardState, PrintData, PrintLine } from "./ppeTypes";

export function getDefaultDueDate(lifeMonths?: number | null) {
  if (!lifeMonths) return "";
  const date = new Date();
  date.setMonth(date.getMonth() + lifeMonths);
  return date.toISOString().slice(0, 10);
}

export function getDefaultIssuePeriodText(lifeMonths?: number | null) {
  return defaultIssuePeriodText(lifeMonths);
}

export function itemModelDescription(item: InventoryItemDto) {
  return [item.brandName, item.modelName, item.article || item.sku, item.protectionClass]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

export function toLineFromNorm(norm: InventoryPositionNormDto, itemsById: Map<string, InventoryItemDto>): PickerLineInput {
  const item = itemsById.get(norm.itemId) ?? toItemFromNorm(norm);
  const normName = item.normItemName || norm.itemName || item.name;
  return {
    dueAt: getDefaultDueDate(norm.lifeMonths ?? item.defaultLifeMonths),
    issuePeriodText: getDefaultIssuePeriodText(norm.lifeMonths ?? item.defaultLifeMonths),
    item,
    brandModelArticle: itemModelDescription(item),
    catalogName: item.name,
    normPoint: "п. 1645 Приложения № 1",
    printItemName: normName,
    priceText: moneyMinorToInput(item.defaultUnitPriceMinor),
    quantityText: String(norm.quantity || 1),
  };
}

export function toItemFromNorm(norm: InventoryPositionNormDto): InventoryItemDto {
  return {
    actualItemName: norm.itemName,
    article: "",
    balance: 0,
    brandName: "",
    category: "",
    categoryId: null,
    clothingSize: "",
    comment: "",
    defaultLifeMonths: norm.lifeMonths ?? 12,
    defaultUnitPriceMinor: 0,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id: norm.itemId,
    isActive: true,
    isConsumable: false,
    itemKind: "ppe",
    minStockQty: 0,
    modelName: "",
    name: norm.itemName,
    normItemName: norm.itemName,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: "",
    status: "active",
    stockAvailable: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockStatus: "normal",
    trackLife: true,
    trackingType: "ppe",
    unit: "шт.",
    unitId: null,
  };
}

export function toItemFromPpeLine(line: InventoryPpeCardLineDto): InventoryItemDto {
  return {
    actualItemName: line.itemName,
    article: "",
    balance: 0,
    brandName: "",
    category: "",
    categoryId: null,
    clothingSize: "",
    comment: "",
    defaultLifeMonths: 12,
    defaultUnitPriceMinor: line.unitPriceMinor ?? null,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id: line.itemId,
    isActive: true,
    isConsumable: line.status === "issued" && !line.dueAt,
    itemKind: "ppe",
    minStockQty: 0,
    modelName: "",
    name: line.itemName,
    normItemName: line.itemName,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: "",
    status: "active",
    stockAvailable: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockStatus: "normal",
    trackLife: true,
    trackingType: "ppe",
    unit: line.unit || "шт.",
    unitId: null,
  };
}

export function printDataFromWizard(wizard: PpeWizardState, employee: InventoryEmployeeDto | null): PrintData {
  return {
    cardId: wizard.cardId,
    createdAt: new Date().toISOString(),
    employee,
    employeeDetails: wizard.employeeDetails,
    employeeName: employee?.fullName ?? "Сотрудник не выбран",
    lines: sortPpePrintLines(wizard.lines.map((line) => {
      const printItemName = line.printItemName || line.item.normItemName || line.item.name;
      return {
      amount: (parsePositiveQuantity(line.quantityText) ?? 1) * parsePrice(line.priceText),
      brandModelArticle: line.brandModelArticle || itemModelDescription(line.item),
      catalogName: line.catalogName || line.item.name,
      dueAt: line.dueAt || null,
      issuePeriodText: line.issuePeriodText || getDefaultIssuePeriodText(line.item.defaultLifeMonths),
      issuedAt: isPpeSignatureLineStatus(line.status) ? line.issuedAt || new Date().toISOString() : null,
      isSectionTitle: Boolean(line.isSectionTitle || isPrintSectionLine(printItemName, line.item.name)),
      itemName: line.item.name,
      model: line.brandModelArticle || itemModelDescription(line.item),
      modelOptions: itemModelOptions(line.item, wizard.lines.map((wizardLine) => wizardLine.item)),
      normPoint: line.normPoint,
      printItemName,
      quantity: parsePositiveQuantity(line.quantityText) ?? 1,
      status: line.status,
      unit: line.item.unit || "шт.",
      unitPrice: parsePrice(line.priceText),
      };
    })),
    position: employee?.position ?? "",
  };
}

export function printDataFromDetail(detail: InventoryPpeCardDetailDto, items: InventoryItemDto[] = []): PrintData {
  const itemsById = new Map(items.map((item) => [item.id, item]));

  return {
    cardId: detail.id,
    createdAt: detail.createdAt,
    employee: {
      birthDate: null,
      department: detail.employeeDepartment || "",
      employeeGroup: "",
      fullName: detail.employeeName,
      hiredAt: null,
      id: detail.employeeId,
      personnelNo: detail.employeePersonnelNo || "",
      position: detail.position,
      status: "active",
    },
    employeeDetails: detail.employeeDetails ?? {},
    employeeName: detail.employeeName,
    lines: sortPpePrintLines(detail.lines.map((line) => {
      const printItemName = line.printItemName || itemsById.get(line.itemId)?.normItemName || line.itemName;
      return {
      brandModelArticle: line.brandModelArticle || line.modelDescription || itemModelDescriptionFromOptional(itemsById.get(line.itemId)),
      catalogName: line.itemName,
      dueAt: line.dueAt,
      issuePeriodText: line.issuePeriodText || "",
      issuedAt: line.issuedAt,
      isSectionTitle: isPrintSectionLine(printItemName, line.itemName),
      itemName: line.itemName,
      model: line.brandModelArticle || line.modelDescription || itemModelDescriptionFromOptional(itemsById.get(line.itemId)),
      modelOptions: itemModelOptions(itemsById.get(line.itemId), items),
      normPoint: line.normPoint || "",
      printItemName,
      quantity: line.quantity,
      status: line.status,
      unit: line.unit || "шт.",
      unitPrice: (line.unitPriceMinor ?? 0) / 100,
      amount: (line.amountMinor ?? 0) / 100,
      };
    })),
    position: detail.position,
  };
}

export function isConsumableLine(line: PrintLine) {
  return !line.dueAt && line.status === "issued";
}

export function isPpeSignatureLineStatus(status?: string | null) {
  return status === "issued" || status === "replacement" || status === "reissued";
}

function itemModelDescriptionFromOptional(item?: InventoryItemDto | null) {
  return item ? itemModelDescription(item) : "";
}

function itemModelOptions(item: InventoryItemDto | null | undefined, items: InventoryItemDto[]) {
  const options = [itemModelDescriptionFromOptional(item), ...items.map((row) => itemModelDescription(row))].filter(Boolean);
  return Array.from(new Set(options));
}

function parsePrice(value: string) {
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isPrintSectionLine(printItemName: string, itemName: string) {
  const value = (printItemName || itemName).trim();
  return Boolean(value && value.endsWith(":"));
}

function sortPpePrintLines(lines: PrintLine[]) {
  return [...lines].sort((left, right) => {
    const leftTime = parseSortDate(left.issuedAt);
    const rightTime = parseSortDate(right.issuedAt);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return (left.printItemName || left.itemName).localeCompare(right.printItemName || right.itemName, "ru");
  });
}

function parseSortDate(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}
