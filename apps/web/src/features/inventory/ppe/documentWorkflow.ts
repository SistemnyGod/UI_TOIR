import type { InventoryPpeNormRowDto, PpeIssueDocumentLineInputDto } from "../../../api/contracts";

export type DraftLine = PpeIssueDocumentLineInputDto & { itemName: string; unitSymbol: string; normName: string; approved: boolean; standards?: { designation: string; name: string }[] | null };
export type KitTemplate = { id: string; name: string; normSetId: string; lines: DraftLine[] };
export function addMonths(date: string, months: number | null | undefined) {
  if (!Number.isInteger(months) || !months || months < 1 || months > 1200 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year, month - 1 + months + 1, 0));
  if (!Number.isFinite(last.getTime()) || last.getUTCFullYear() > 9999) return null;
  last.setUTCDate(Math.min(day, last.getUTCDate()));
  return last.toISOString().slice(0, 10);
}
export function applyKitTemplate(template: KitTemplate, normSetId: string, rows: InventoryPpeNormRowDto[]) {
  if (template.normSetId !== normSetId) throw new Error("Шаблон относится к другой норме. Выберите совместимый комплект.");
  if (template.lines.some(line => !rows.some(row => row.id === line.normRowId && row.mappings.some(mapping => mapping.itemId === line.itemId && mapping.isApproved)))) {
    throw new Error("Состав нормы изменился: в шаблоне есть товары без утверждённого соответствия. Обновите шаблон.");
  }
  return template.lines;
}
type JournalRow = { employeeName: string; status: string; documentDate: string; department?: string; personnelNo?: string; hasOverdue?: boolean };
export function filterJournal<T extends JournalRow>(rows: T[], filters: { query: string; status: string; from: string; to: string; department: string }) {
  const query = filters.query.trim().toLocaleLowerCase("ru");
  return rows.filter(row => (!query || `${row.employeeName} ${row.personnelNo ?? ""}`.toLocaleLowerCase("ru").includes(query))
    && (!filters.department || row.department === filters.department)
    && (!filters.status || (filters.status === "overdue" ? row.hasOverdue : row.status === filters.status))
    && (!filters.from || row.documentDate >= filters.from) && (!filters.to || row.documentDate <= filters.to));
}
