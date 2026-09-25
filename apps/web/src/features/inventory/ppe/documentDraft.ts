import { ApiError } from "../../../api/client";
import { createClientUuid } from "../../../shared/clientUuid";
import { ppeErrorMessage } from "./ppeErrors";
import type { InventoryPpeEmployeeDetailsDto, InventoryPpeNormRowDto, PpeIssueDocumentDto, PpeIssueDocumentLineInputDto } from "../../../api/contracts";
import type { DraftLine } from "./documentWorkflow";
export function messageOf(reason: unknown, fallback: string) { return ppeErrorMessage(reason, fallback); }
export function formatDocumentStatus(status: string) {
  switch (status.trim().toLowerCase()) {
    case "draft": return "Черновик";
    case "confirmed": return "Подтверждён";
    case "cancelled": return "Отменён";
    default: return status;
  }
}
export function formatRuDate(value: string) { const [date] = value.split("T"); const parts = date.split("-"); return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : value; }
export function formatNormQuantity(row: Pick<InventoryPpeNormRowDto, "quantity" | "quantityText" | "unitSymbol">) { return row.quantityText?.trim() || `${row.quantity} ${row.unitSymbol || "шт."}`; }
export function formatPriceInput(value: number | null) { return value === null ? "" : (value / 100).toFixed(2); }
export function parsePriceInput(value: string): number | null | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  return Math.round(Number(normalized) * 100);
}
export function problemMessagesOf(reason: unknown) { return reason instanceof ApiError ? Object.entries(reason.errors ?? {}).flatMap(([key, messages]) => messages.map((message) => key === "normChanged" ? message : `${key}: ${message}`)) : []; }
export function validateDraftLines(lines: DraftLine[]) { const invalidManual = lines.find((line) => line.manualControlConfirmed && !line.exceptionReason?.trim()); if (invalidManual) return `Укажите причину исключения для позиции «${invalidManual.itemName}».`; return ""; }
export function toLineInput({ id, normRowId, itemId, issueDate, quantity, unitPriceMinor, sizeText = "", exceptionReason = "", manualControlConfirmed = false, lifeMonths = null, normPoint }: DraftLine): PpeIssueDocumentLineInputDto {
  return { id, normRowId, itemId, issueDate, quantity, unitPriceMinor, sizeText, exceptionReason, manualControlConfirmed, lifeMonths, normPoint };
}
export function fingerprintOf(employeeId: string, normSetId: string, documentDate: string, responsibleName: string, basis: string, employeeDetails: InventoryPpeEmployeeDetailsDto, lines: DraftLine[], acceptNormChange: boolean) {
  return JSON.stringify({ employeeId, normSetId, documentDate, responsibleName, basis, employeeDetails, lines: lines.map(toLineInput), acceptNormChange });
}
export function confirmKeyStorageKey(documentId: string) { return `patrol360.inventory.ppe.issue-document.confirm:${documentId}`; }
export function alternativeKey(row: InventoryPpeNormRowDto | undefined) { return row?.alternativeGroup?.trim() || row?.id || ""; }
export function createDraftLine(row: InventoryPpeNormRowDto, mapping: InventoryPpeNormRowDto["mappings"][number], issueDate: string, useNormQuantity: boolean): DraftLine {
  const factor = mapping.normUnitsPerItem ?? 0;
  const requiresManualControl = useNormQuantity && factor <= 0;
  return {
    id: createClientUuid(),
    normRowId: row.id,
    itemId: mapping.itemId,
    issueDate,
    lifeMonths: row.lifeMonths,
    quantity: useNormQuantity && factor > 0 ? row.quantity / factor : 1,
    unitPriceMinor: mapping.defaultUnitPriceMinor && mapping.defaultUnitPriceMinor > 0 ? mapping.defaultUnitPriceMinor : null,
    sizeText: "",
    exceptionReason: requiresManualControl ? "Не указан коэффициент пересчета нормы." : "",
    manualControlConfirmed: requiresManualControl,
    itemName: mapping.itemName,
    unitSymbol: row.unitSymbol || "ед. не подтверждена",
    normName: row.normItemName,
    normPoint: row.normPoint,
    approved: true,
    standards: mapping.standards ?? [],
  };
}
export function mergeServerLines(document: PpeIssueDocumentDto, current: DraftLine[], submitted: PpeIssueDocumentLineInputDto[]) {
  const savedById = new Map(document.content.lines.map((line) => [line.id, line]));
  const submittedById = new Map(submitted.map((line) => [line.id, line]));
  // A slow save must not undo edits, additions or removals made while it was in flight.
  return current.map((line) => {
    const saved = savedById.get(line.id);
    const sent = submittedById.get(line.id);
    if (!saved || !sent || saved.itemId !== line.itemId || saved.normRowId !== line.normRowId) return line;
    const changed = JSON.stringify(toLineInput(line)) !== JSON.stringify(toLineInput(sent as DraftLine));
    return {
      ...saved,
      ...(changed ? toLineInput(line) : {}),
      normName: document.content.normRows.find((row) => row.id === line.normRowId)?.normItemName ?? line.normName,
      approved: true,
      unitSymbol: saved.unitSymbol || line.unitSymbol || "ед. не подтверждена",
    };
  });
}
