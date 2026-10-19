import type { InventoryPpeNormSetDto, InventoryPpeNormRowDto } from "../../../../api/contracts";
export type NormEditorSelection = { kind: "scope"; normSet: InventoryPpeNormSetDto }
  | { kind: "rules"; normSetId: string; version: number; row: InventoryPpeNormRowDto }
  | { kind: "approval" | "primary"; normSetId: string; version: number; row: InventoryPpeNormRowDto; mapping: InventoryPpeNormRowDto["mappings"][number] };
export type OpenNormEditor = (selection: NormEditorSelection) => void;
export const editorNormId = (selection: NormEditorSelection) => selection.kind === "scope" ? selection.normSet.id : selection.normSetId;
export function decimalValue(value: string, precision: number, maximum: number): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!new RegExp("^\\d+(?:\\.\\d{1," + precision + "})?$").test(normalized)) return null;
  const number = Number(normalized); return Number.isFinite(number) && number > 0 && number <= maximum ? number : null;
}
export function monthsValue(value: string) { if (!value.trim()) return null; return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1200 ? Number(value) : undefined; }
