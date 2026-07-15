import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardLineDto,
  InventoryPositionNormDto,
} from "../../../api/contracts";
import { defaultIssuePeriodText, isPpeSignatureStatus } from "./ppeStatusCatalog";
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

export function getDefaultQuantityText(quantity: number, unit = "шт.") {
  return `${formatPrintQuantity(quantity)} ${unit || "шт."}`;
}

function printableQuantityText(value: string | null | undefined, quantity: number, unit = "шт.") {
  return value?.trim() || getDefaultQuantityText(quantity, unit);
}

export function itemModelDescription(item: InventoryItemDto) {
  return [item.brandName, item.modelName, item.article || item.sku, item.protectionClass]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

export function toLineFromNorm(norm: InventoryPositionNormDto, itemsById: Map<string, InventoryItemDto>): PickerLineInput {
  const item = itemsById.get(norm.itemId) ?? toItemFromNorm(norm);
  const normName = norm.normItemName || item.normItemName || norm.itemName || item.name;
  const isSectionTitle = Boolean(norm.isSectionTitle || isPrintSectionLine(normName, norm.itemName));
  return {
    dueAt: isSectionTitle ? "" : getDefaultDueDate(norm.lifeMonths ?? item.defaultLifeMonths),
    issuePeriodText: isSectionTitle ? "" : norm.issuePeriodText || getDefaultIssuePeriodText(norm.lifeMonths ?? item.defaultLifeMonths),
    isSectionTitle,
    item,
    brandModelArticle: isSectionTitle ? "" : itemModelDescription(item),
    catalogName: item.name,
    normPoint: isSectionTitle ? "" : norm.normPoint || "",
    printItemName: normName,
    priceText: isSectionTitle ? "0" : moneyMinorToInput(item.defaultUnitPriceMinor),
    quantityText: isSectionTitle ? "" : printableQuantityText(norm.quantityText, norm.quantity || 1, item.unit || "шт."),
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
    normItemName: norm.normItemName || norm.itemName,
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
    lines: wizard.lines.map((line) => {
      const printItemName = line.printItemName || line.item.normItemName || line.item.name;
      const isSectionTitle = Boolean(line.isSectionTitle || isPrintSectionLine(printItemName, line.item.name));
      const quantity = parsePositiveQuantity(line.quantityText) ?? 1;
      return {
      amount: isSectionTitle ? 0 : quantity * parsePrice(line.priceText),
      brandModelArticle: line.brandModelArticle || itemModelDescription(line.item),
      catalogName: line.catalogName || line.item.name,
      dueAt: isSectionTitle ? null : line.dueAt || null,
      issuePeriodText: isSectionTitle ? "" : line.issuePeriodText || getDefaultIssuePeriodText(line.item.defaultLifeMonths),
      issuedAt: !isSectionTitle && isPpeSignatureLineStatus(line.status) ? line.issuedAt || new Date().toISOString() : null,
      isSectionTitle,
      itemName: line.item.name,
      model: line.brandModelArticle || itemModelDescription(line.item),
      modelOptions: itemModelOptions(line.item, wizard.lines.map((wizardLine) => wizardLine.item)),
      normPoint: line.normPoint,
      printItemName,
      quantity,
      quantityText: isSectionTitle
        ? ""
        : printableQuantityText(line.quantityText, quantity, line.item.unit || "шт."),
      status: line.status,
      unit: line.item.unit || "шт.",
      unitPrice: isSectionTitle ? 0 : parsePrice(line.priceText),
      };
    }),
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
    lines: detail.lines.map((line) => {
      const printItemName = line.printItemName || itemsById.get(line.itemId)?.normItemName || line.itemName;
      const isSectionTitle = Boolean(line.isSectionTitle || isPrintSectionLine(printItemName, line.itemName));
      return {
      brandModelArticle: line.brandModelArticle || line.modelDescription || itemModelDescriptionFromOptional(itemsById.get(line.itemId)),
      catalogName: line.itemName,
      dueAt: isSectionTitle ? null : line.dueAt,
      issuePeriodText: isSectionTitle ? "" : line.issuePeriodText || "",
      issuedAt: isSectionTitle ? null : line.issuedAt,
      isSectionTitle,
      itemName: line.itemName,
      model: line.brandModelArticle || line.modelDescription || itemModelDescriptionFromOptional(itemsById.get(line.itemId)),
      modelOptions: itemModelOptions(itemsById.get(line.itemId), items),
      normPoint: isSectionTitle ? "" : line.normPoint || "",
      printItemName,
      quantity: line.quantity,
      quantityText: isSectionTitle ? "" : line.quantityText || getDefaultQuantityText(line.quantity, line.unit || "шт."),
      status: line.status,
      unit: line.unit || "шт.",
      unitPrice: isSectionTitle ? 0 : (line.unitPriceMinor ?? 0) / 100,
      amount: isSectionTitle ? 0 : (line.amountMinor ?? 0) / 100,
      };
    }),
    position: detail.position,
  };
}

export function isConsumableLine(line: PrintLine) {
  return !line.dueAt && line.status === "issued";
}

export function isPpeSignatureLineStatus(status?: string | null) {
  return Boolean(status && isPpeSignatureStatus(status));
}

export function sortPpeSignatureLines(lines: PrintLine[]) {
  return lines
    .map((line, sourceIndex) => ({ line, sourceIndex }))
    .sort((left, right) => {
      const leftTime = parseSortDate(left.line.issuedAt);
      const rightTime = parseSortDate(right.line.issuedAt);
      return leftTime === rightTime ? left.sourceIndex - right.sourceIndex : leftTime - rightTime;
    })
    .map(({ line }) => line);
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

function formatPrintQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function parseSortDate(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}
