import type { InventoryCustodyRecordDto, InventoryDocumentDto, InventoryHistoryDto, InventoryItemDto } from "../../../api/contracts";
import { detectCustodyGroup } from "../custody/custodyCommon";

export type InventoryMovementAction = "issued" | "returned" | "written_off" | "lost" | "archived";
export type InventoryMovementPeriod = "all" | "today" | "7d" | "30d" | "custom";
export type InventoryMovementSource = "issue" | "custody";
export type InventoryMovementStatus = "in_use" | "returned" | "written_off" | "lost" | "archived";

export type InventoryMovementRow = {
  action: InventoryMovementAction;
  actor: string;
  comment: string;
  createdAt: string;
  employeeName: string;
  group: string;
  id: string;
  itemName: string;
  quantity: number;
  source: InventoryMovementSource;
  sourceId: string;
  status: InventoryMovementStatus;
  unit: string;
};

export type InventoryMovementFilters = {
  action?: "all" | InventoryMovementAction;
  dateFrom?: string;
  dateTo?: string;
  employee?: string;
  group?: string;
  item?: string;
  period?: InventoryMovementPeriod;
  query?: string;
  source?: "all" | InventoryMovementSource;
  status?: "all" | InventoryMovementStatus;
};

export type InventoryMovementReport = {
  byAction: Record<InventoryMovementAction, number>;
  byEmployee: Array<{
    employeeName: string;
    inUse: number;
    lost: number;
    returned: number;
    writtenOff: number;
  }>;
  byGroup: Array<{
    group: string;
    inUse: number;
    lost: number;
    movements: number;
    writtenOff: number;
  }>;
  filteredCount: number;
  totals: {
    inUse: number;
    issued: number;
    lost: number;
    returned: number;
    writtenOff: number;
  };
};

const SYSTEM_ACTOR = "Система";

export function buildInventoryMovementJournal({
  custodyRecords,
  documents,
  history,
  items,
}: {
  custodyRecords: InventoryCustodyRecordDto[];
  documents: InventoryDocumentDto[];
  history: InventoryHistoryDto[];
  items?: InventoryItemDto[];
}) {
  const itemGroupByName = buildItemGroupByName(items ?? []);
  const historyByEntityId = groupHistoryByEntityId(history);
  const rows: InventoryMovementRow[] = [
    ...documents.flatMap((document) => documentToMovement(document, itemGroupByName)),
    ...custodyRecords.flatMap((record) => custodyRecordToMovements(record, historyByEntityId, itemGroupByName)),
  ];

  return dedupeMovements(rows).sort((left, right) => parseDate(right.createdAt) - parseDate(left.createdAt));
}

export function filterInventoryMovements(rows: InventoryMovementRow[], filters: InventoryMovementFilters, now = new Date()) {
  const normalizedQuery = normalize(filters.query ?? "");
  return rows.filter((row) => {
    if (filters.action && filters.action !== "all" && row.action !== filters.action) return false;
    if (filters.source && filters.source !== "all" && row.source !== filters.source) return false;
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.employee && row.employeeName !== filters.employee) return false;
    if (filters.item && row.itemName !== filters.item) return false;
    if (filters.group && filters.group !== "all" && row.group !== filters.group) return false;
    if (!matchesPeriod(row.createdAt, filters, now)) return false;
    if (!normalizedQuery) return true;
    return normalize([
      row.employeeName,
      row.itemName,
      row.group,
      movementSourceLabel(row.source),
      movementActionLabel(row.action),
      movementStatusLabel(row.status),
      row.actor,
      row.comment,
    ].join(" ")).includes(normalizedQuery);
  });
}

export function buildInventoryMovementReport(rows: InventoryMovementRow[]): InventoryMovementReport {
  const latestBySubject = latestMovementsBySubject(rows);
  const currentRows = Array.from(latestBySubject.values());
  const emptyActions = { archived: 0, issued: 0, lost: 0, returned: 0, written_off: 0 };
  const byAction = rows.reduce<Record<InventoryMovementAction, number>>((acc, row) => {
    acc[row.action] += row.quantity;
    return acc;
  }, { ...emptyActions });
  const totals = currentRows.reduce(
    (acc, row) => {
      if (row.status === "in_use") acc.inUse += row.quantity;
      if (row.status === "returned") acc.returned += row.quantity;
      if (row.status === "written_off") acc.writtenOff += row.quantity;
      if (row.status === "lost") acc.lost += row.quantity;
      return acc;
    },
    { inUse: 0, issued: byAction.issued, lost: 0, returned: 0, writtenOff: 0 },
  );

  return {
    byAction,
    byEmployee: groupCurrentRowsByEmployee(currentRows),
    byGroup: groupCurrentRowsByGroup(currentRows),
    filteredCount: rows.length,
    totals,
  };
}

export function movementActionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    archived: "Архив",
    issued: "Выдано",
    lost: "Неисправно",
    returned: "Возвращено",
    written_off: "Списано",
  };
  return action ? labels[action] ?? action : "Не указано";
}

export function movementStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    archived: "Архив",
    in_use: "На руках",
    issued: "На руках",
    lost: "Неисправно",
    returned: "Возвращено",
    written_off: "Списано",
  };
  return status ? labels[status] ?? status : "Не указано";
}

export function movementSourceLabel(source?: string | null) {
  const labels: Record<string, string> = {
    custody: "Под запись",
    issue: "Выдача",
  };
  return source ? labels[source] ?? source : "Не указано";
}

export function formatMovementQuantity(quantity: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(quantity);
}

function documentToMovement(document: InventoryDocumentDto, itemGroupByName: Map<string, string>): InventoryMovementRow[] {
  const mapped = documentActionFromType(document.type);
  if (!mapped) return [];
  return [{
    action: mapped.action,
    actor: SYSTEM_ACTOR,
    comment: document.comment?.trim() || "Операция выдачи",
    createdAt: document.createdAt,
    employeeName: document.employeeName || "Без сотрудника",
    group: itemGroupByName.get(normalize(document.itemName ?? "")) ?? detectCustodyGroup([document.itemName, document.comment, document.unit]),
    id: `issue:${document.id}:${mapped.action}`,
    itemName: document.itemName || "Без предмета",
    quantity: Math.abs(document.quantity ?? 0),
    source: "issue",
    sourceId: `issue:${document.id}`,
    status: mapped.status,
    unit: document.unit || "",
  }];
}

function custodyRecordToMovements(
  record: InventoryCustodyRecordDto,
  historyByEntityId: Map<string, InventoryHistoryDto[]>,
  itemGroupByName: Map<string, string>,
): InventoryMovementRow[] {
  const recordHistory = historyByEntityId.get(record.id) ?? [];
  const group = itemGroupByName.get(normalize(record.itemName)) ?? detectCustodyGroup([record.itemName, record.comment, record.unit]);
  const createdHistory = recordHistory.find((row) => row.action === "created" || row.action === "issued");
  const rows: InventoryMovementRow[] = [{
    action: "issued",
    actor: safeActor(createdHistory?.actor),
    comment: record.comment?.trim() || formatHistoryDescription(createdHistory?.description) || "Выдано под запись",
    createdAt: record.issuedAt,
    employeeName: record.employeeName || "Без сотрудника",
    group,
    id: `custody:${record.id}:issued`,
    itemName: record.itemName || "Без предмета",
    quantity: record.quantity,
    source: "custody",
    sourceId: `custody:${record.id}`,
    status: "in_use",
    unit: record.unit || "",
  }];

  for (const event of recordHistory) {
    const mapped = custodyActionFromHistory(event.action);
    if (!mapped) continue;
    rows.push({
      action: mapped.action,
      actor: safeActor(event.actor),
      comment: record.comment?.trim() || formatHistoryDescription(event.description),
      createdAt: event.createdAt || record.closedAt || record.issuedAt,
      employeeName: record.employeeName || event.employeeName || "Без сотрудника",
      group,
      id: `custody:${record.id}:${mapped.action}`,
      itemName: record.itemName || event.itemName || "Без предмета",
      quantity: record.quantity,
      source: "custody",
      sourceId: `custody:${record.id}`,
      status: mapped.status,
      unit: record.unit || "",
    });
  }

  const terminal = custodyActionFromHistory(record.status);
  if (terminal && !rows.some((row) => row.id === `custody:${record.id}:${terminal.action}`)) {
    rows.push({
      action: terminal.action,
      actor: SYSTEM_ACTOR,
      comment: record.comment?.trim() || movementActionLabel(terminal.action),
      createdAt: record.closedAt || record.issuedAt,
      employeeName: record.employeeName || "Без сотрудника",
      group,
      id: `custody:${record.id}:${terminal.action}`,
      itemName: record.itemName || "Без предмета",
      quantity: record.quantity,
      source: "custody",
      sourceId: `custody:${record.id}`,
      status: terminal.status,
      unit: record.unit || "",
    });
  }

  return rows;
}

function documentActionFromType(type?: string | null): { action: InventoryMovementAction; status: InventoryMovementStatus } | null {
  if (!type) return null;
  if (["issue", "issued", "confirm_issue"].includes(type)) return { action: "issued", status: "in_use" };
  if (["return", "returned"].includes(type)) return { action: "returned", status: "returned" };
  if (["write_off", "written_off"].includes(type)) return { action: "written_off", status: "written_off" };
  if (["defective", "lost", "broken", "failure"].includes(type)) return { action: "lost", status: "lost" };
  if (["archive", "archived"].includes(type)) return { action: "archived", status: "archived" };
  return null;
}

function custodyActionFromHistory(action?: string | null): { action: InventoryMovementAction; status: InventoryMovementStatus } | null {
  if (!action) return null;
  if (action === "returned") return { action: "returned", status: "returned" };
  if (action === "written_off") return { action: "written_off", status: "written_off" };
  if (action === "lost") return { action: "lost", status: "lost" };
  if (action === "archived") return { action: "archived", status: "archived" };
  return null;
}

function groupHistoryByEntityId(history: InventoryHistoryDto[]) {
  const grouped = new Map<string, InventoryHistoryDto[]>();
  for (const row of history) {
    if (!row.entityId) continue;
    const current = grouped.get(row.entityId) ?? [];
    current.push(row);
    grouped.set(row.entityId, current);
  }
  return grouped;
}

function buildItemGroupByName(items: InventoryItemDto[]) {
  return new Map(items.map((item) => [normalize(item.name), detectCustodyGroup([item.category, item.itemKind, item.name, item.sku, item.article, item.comment])]));
}

function dedupeMovements(rows: InventoryMovementRow[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function latestMovementsBySubject(rows: InventoryMovementRow[]) {
  const latest = new Map<string, InventoryMovementRow>();
  for (const row of rows) {
    const current = latest.get(row.sourceId);
    if (!current || parseDate(row.createdAt) > parseDate(current.createdAt)) {
      latest.set(row.sourceId, row);
    }
  }
  return latest;
}

function groupCurrentRowsByEmployee(rows: InventoryMovementRow[]) {
  const grouped = new Map<string, { inUse: number; lost: number; movements: number; returned: number; writtenOff: number }>();
  for (const row of rows) {
    const key = row.employeeName || "Без сотрудника";
    const current = grouped.get(key) ?? { inUse: 0, lost: 0, movements: 0, returned: 0, writtenOff: 0 };
    current.movements += 1;
    if (row.status === "in_use") current.inUse += row.quantity;
    if (row.status === "returned") current.returned += row.quantity;
    if (row.status === "written_off") current.writtenOff += row.quantity;
    if (row.status === "lost") current.lost += row.quantity;
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([employeeName, value]) => ({ employeeName, ...value }))
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName, "ru"));
}

function groupCurrentRowsByGroup(rows: InventoryMovementRow[]) {
  const grouped = new Map<string, { inUse: number; lost: number; movements: number; writtenOff: number }>();
  for (const row of rows) {
    const key = row.group || "Прочее";
    const current = grouped.get(key) ?? { inUse: 0, lost: 0, movements: 0, writtenOff: 0 };
    current.movements += 1;
    if (row.status === "in_use") current.inUse += row.quantity;
    if (row.status === "written_off") current.writtenOff += row.quantity;
    if (row.status === "lost") current.lost += row.quantity;
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([group, value]) => ({ group, ...value }))
    .sort((left, right) => left.group.localeCompare(right.group, "ru"));
}

function matchesPeriod(value: string, filters: InventoryMovementFilters, now: Date) {
  const time = parseDate(value);
  if (!time) return false;
  const period = filters.period ?? "all";
  if (period === "today" && toDateKey(new Date(time)) !== toDateKey(now)) return false;
  if (period === "7d" && time < startOfRelativePeriod(now, 7).getTime()) return false;
  if (period === "30d" && time < startOfRelativePeriod(now, 30).getTime()) return false;
  if (filters.dateFrom && time < startOfDay(filters.dateFrom).getTime()) return false;
  if (filters.dateTo && time > endOfDay(filters.dateTo).getTime()) return false;
  return true;
}

function startOfRelativePeriod(now: Date, days: number) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date;
}

function startOfDay(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function parseDate(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function safeActor(value?: string | null) {
  return value?.trim() || SYSTEM_ACTOR;
}

function formatHistoryDescription(value?: string | null) {
  if (!value || value.trim() === "->") return "";
  return value.trim();
}
