import { parsePriceInput, validateDraftLines } from "./documentDraft";
import type { DraftLine } from "./documentWorkflow";

export function validateKitLines(lines: DraftLine[], requireIssueDate = true) {
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return `Укажите количество больше нуля для позиции «${line.itemName}».`;
    if (line.lifeMonths != null && (!Number.isInteger(line.lifeMonths) || line.lifeMonths < 1 || line.lifeMonths > 1200)) return `Укажите срок от 1 до 1200 месяцев для позиции «${line.itemName}».`;
    if (line.priceInput !== undefined && parsePriceInput(line.priceInput) === undefined) return `Укажите корректную цену для позиции «${line.itemName}».`;
    if (line.unitPriceMinor != null && (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0)) return `Укажите неотрицательную цену для позиции «${line.itemName}».`;
    if (requireIssueDate) {
      const timestamp = Date.parse(`${line.issueDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(line.issueDate) || Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== line.issueDate) return `Укажите дату выдачи для позиции «${line.itemName}».`;
    }
  }
  return requireIssueDate ? validateDraftLines(lines) : "";
}
