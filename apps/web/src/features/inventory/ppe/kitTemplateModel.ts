import type { InventoryPpeNormRowDto, PpeKitTemplateDto, SavePpeKitTemplateLineDto } from "../../../api/contracts";
import { createClientUuid } from "../../../shared/clientUuid";
import { readDocumentStorage } from "./documentStorage";
import type { DraftLine, KitTemplate } from "./documentWorkflow";

export const legacyTemplatesKey = (userId: string) => `patrol360.ppe.kits.v1.${userId}`;
export function readLegacyTemplates(userId: string): KitTemplate[] {
  try {
    const value = JSON.parse(readDocumentStorage("localStorage", legacyTemplatesKey(userId)) ?? "[]");
    return Array.isArray(value) ? value.filter(item => typeof item?.id === "string" && typeof item.name === "string" && typeof item.normSetId === "string" && Array.isArray(item.lines) && item.lines.every((line: Partial<DraftLine> | null) => line && typeof line.normRowId === "string" && typeof line.itemId === "string" && typeof line.itemName === "string" && typeof line.unitSymbol === "string" && typeof line.quantity === "number")) : [];
  } catch { return []; }
}
export function readImportedTemplates(key: string): Set<string> {
  try { const value = JSON.parse(readDocumentStorage("sessionStorage", key) ?? "[]"); return new Set(Array.isArray(value) ? value.filter(item => typeof item === "string") : []); }
  catch { return new Set(); }
}
export function templateLineInputs(lines: DraftLine[]): SavePpeKitTemplateLineDto[] {
  return lines.map(line => ({ normRowId: line.normRowId, itemId: line.itemId, itemName: line.itemName, unitSymbol: line.unitSymbol, quantity: line.quantity, lifeMonths: line.lifeMonths ?? null, unitPriceMinor: line.unitPriceMinor ?? null }));
}
export function templateDraftLines(template: PpeKitTemplateDto, rows: InventoryPpeNormRowDto[], date: string): DraftLine[] {
  const rowById = new Map(rows.map(row => [row.id, row]));
  return template.lines.map(line => { const row = rowById.get(line.normRowId); return { id: createClientUuid(), normRowId: line.normRowId, itemId: line.itemId, itemName: line.itemName, unitSymbol: line.unitSymbol, normName: row?.normItemName ?? line.itemName, normPoint: row?.normPoint, approved: true, quantity: line.quantity, lifeMonths: line.lifeMonths, unitPriceMinor: line.unitPriceMinor, issueDate: date, sizeText: "", exceptionReason: "", manualControlConfirmed: false }; });
}
/** A background list must not undo writes that completed after its request began. */
export function mergeTemplates(current: PpeKitTemplateDto[], received: PpeKitTemplateDto[], touched: Set<string>) {
  const byId = new Map(received.map(template => [template.id, template]));
  const currentById = new Map(current.map(template => [template.id, template]));
  for (const id of touched) { const template = currentById.get(id); if (template) byId.set(id, template); else byId.delete(id); }
  const order = [...current.map(template => template.id), ...received.filter(template => !currentById.has(template.id)).map(template => template.id)];
  return order.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}
