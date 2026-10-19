import type {
  InventoryItemDto,
  InventoryPpeCardDetailDto,
} from "../../../api/contracts";
import { defaultIssuePeriodText, isPpeSignatureStatus } from "./ppeStatusCatalog";
import { parsePositiveQuantity } from "./ppeFormatters";
import type { PrintData, PrintLine } from "./ppeTypes";

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
      issueMethod: line.issueMethod === "dispenser" ? "dispenser" : line.issueMethod === "personal" ? "personal" : undefined,
      itemName: line.itemName,
      model: line.brandModelArticle || line.modelDescription || itemModelDescriptionFromOptional(itemsById.get(line.itemId)),
      modelOptions: itemModelOptions(itemsById.get(line.itemId), items),
      normPoint: isSectionTitle ? "" : line.normPoint || "",
      printItemName,
      quantity: line.quantity,
      quantityText: isSectionTitle ? "" : line.quantityText || getDefaultQuantityText(line.quantity, line.unit || "шт."),
      normQuantity: isSectionTitle ? 0 : parsePositiveQuantity(line.quantityText || "") ?? line.quantity,
      normQuantityText: isSectionTitle ? "" : line.quantityText || getDefaultQuantityText(line.quantity, line.unit || "шт."),
      returnedAt: isSectionTitle ? null : line.returnedAt,
      returnedQuantity: isSectionTitle ? null : line.returnedQuantity,
      writeOffActDate: isSectionTitle ? null : line.writeOffActDate,
      writeOffActNumber: isSectionTitle ? null : line.writeOffActNumber,
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
