import type { UpsertInventoryPpeCardLineDto } from "../../../api/contracts";
import { itemModelDescription, isPpeSignatureLineStatus, parsePositiveQuantity } from "./ppeCommon";
import type { PpeWizardLine } from "./ppeTypes";

export function buildWizardLinePayloads(
  lines: PpeWizardLine[],
  confirmIssue: boolean,
):
  | { payloads: Array<{ line: PpeWizardLine; payload: UpsertInventoryPpeCardLineDto }> }
  | { error: string } {
  const payloads: Array<{ line: PpeWizardLine; payload: UpsertInventoryPpeCardLineDto }> = [];

  for (const line of lines) {
    const printItemName = (line.printItemName || line.item.normItemName || "").trim();
    const isSectionTitle = Boolean(line.isSectionTitle || (printItemName && printItemName.endsWith(":")));

    if (isSectionTitle) {
      payloads.push({
        line,
        payload: {
          brandModelArticle: null,
          comment: null,
          dueAt: null,
          issuedAt: null,
          issuePeriodText: null,
          itemId: line.item.id,
          normPoint: line.normPoint || null,
          printItemName: printItemName || line.item.name,
          quantity: 1,
          quantityText: "",
          isSectionTitle: true,
          status: "not_issued",
          unitPriceMinor: 0,
          warehouseId: null,
        },
      });
      continue;
    }

    const quantity = parsePositiveQuantity(line.quantityText);
    if (!quantity) {
      return { error: `Проверьте количество для позиции ${line.item.name}` };
    }

    const unitPriceMinor = parseMoneyToMinor(line.priceText);
    if (unitPriceMinor === null) {
      return { error: `Проверьте цену для позиции ${line.item.name}` };
    }

    if (!printItemName) {
      return { error: `Укажите полное нормативное наименование СИЗ для позиции ${line.item.name}` };
    }

    if (isGenericPpeCategory(printItemName)) {
      return { error: `Строка "${printItemName}" является категорией. Укажите полное нормативное наименование СИЗ.` };
    }

    if (printItemName.includes(" - ")) {
      return { error: `Нельзя печатать строку в формате "Категория - номенклатура": ${printItemName}` };
    }

    const nextStatus = confirmIssue && line.status === "issuing" ? "issued" : line.status;

    if (line.isSectionTitle && nextStatus === "issued") {
      return { error: `Раздел "${printItemName || line.item.name}" нельзя отметить как выданный СИЗ.` };
    }

    payloads.push({
      line,
      payload: {
        brandModelArticle: line.brandModelArticle || itemModelDescription(line.item) || null,
        comment: null,
        dueAt: line.dueAt || null,
        issuedAt:
          isPpeSignatureLineStatus(nextStatus)
            ? line.issuedAt
              ? new Date(line.issuedAt).toISOString()
              : new Date().toISOString()
            : null,
        issuePeriodText: line.issuePeriodText || null,
        itemId: line.item.id,
        normPoint: line.normPoint || null,
        printItemName: printItemName || line.item.name,
        quantity,
        quantityText: line.isSectionTitle ? "" : line.quantityText.trim() || `${quantity} ${line.item.unit || "шт."}`,
        isSectionTitle: Boolean(line.isSectionTitle),
        status: nextStatus,
        unitPriceMinor,
        warehouseId: line.warehouseId || null,
      },
    });
  }

  return { payloads };
}

function isGenericPpeCategory(value: string) {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return new Set(["каски", "одежда", "обувь", "брюки", "сиз", "спецодежда"]).has(normalized);
}

function parseMoneyToMinor(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    return 0;
  }

  if (!/^\d+(\.\d*)?$/.test(normalized)) {
    return null;
  }

  const [rublesPart, minorPart = ""] = normalized.split(".");
  const rubles = Number(rublesPart);
  if (!Number.isSafeInteger(rubles)) {
    return null;
  }

  const minor = Number(minorPart.padEnd(2, "0").slice(0, 2));
  return rubles * 100 + minor;
}
