import type { ApiFileResponse } from "../api/client";
import type {
  InventoryItemDto,
  InventoryLegacyImportRunDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardNormRowDto,
  InventoryPpeNormMappingDto,
  InventoryPpeSummaryDto,
  InventoryReportDto,
  InventorySettingsDto,
} from "../api/contracts";
import { createClientUuid } from "../shared/clientUuid";

type InventoryPpeNormStore = {
  items: InventoryItemDto[];
  ppeMappings: Record<string, InventoryPpeNormMappingDto[]>;
  settings: InventorySettingsDto;
};

const emptyPpeSummary: InventoryPpeSummaryDto = {
  active: 0,
  issued: 0,
  issuedLines: 0,
  issuing: 0,
  linesTotal: 0,
  notIssued: 0,
  notIssuedLines: 0,
  partial: 0,
  problem: 0,
  returned: 0,
  total: 0,
  writtenOff: 0,
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}
export function buildMockPpeNormRows(
  store: InventoryPpeNormStore,
  position: string,
  card: InventoryPpeCardDetailDto | null,
): InventoryPpeCardNormRowDto[] {
  const sourceRows: InventoryPpeCardNormRowDto[] = card?.normRows?.length
    ? card.normRows
    : store.settings.positionNorms
        .filter((row) => normalize(row.positionName) === normalize(position))
        .map((row, index) => ({
          brandModelArticle: "",
          coverageStatus: "not_issued" as const,
          defaultUnitPriceMinor: store.items.find((item) => item.id === row.itemId)?.defaultUnitPriceMinor ?? null,
          id: `mock-norm-${row.id}`,
          issuePeriodText: row.issuePeriodText ?? "",
          issuedQuantity: 0,
          lifeMonths: row.lifeMonths,
          mappedItemId: row.isSectionTitle ? null : row.itemId,
          mappedItemName: row.isSectionTitle ? "" : row.itemName,
          mappings: [],
          normItemName: row.normItemName || row.itemName,
          normPoint: row.normPoint ?? "",
          parentRowId: null,
          quantity: row.quantity,
          quantityText: row.quantityText ?? "",
          rowType: row.isSectionTitle ? "group" as const : "item" as const,
          sortOrder: index,
          sourceNormRowId: row.id,
        }));

  if (!sourceRows.length && card?.lines.length) {
    sourceRows.push(...card.lines.map((line, index) => ({
      brandModelArticle: line.brandModelArticle ?? line.modelDescription ?? "",
      coverageStatus: "not_issued" as const,
      defaultUnitPriceMinor: line.unitPriceMinor ?? null,
      id: line.cardNormRowId ?? `mock-legacy-norm-${line.id}`,
      issuePeriodText: line.issuePeriodText ?? "",
      issuedQuantity: 0,
      lifeMonths: null,
      mappedItemId: line.itemId,
      mappedItemName: line.itemName,
      mappings: [],
      normItemName: line.printItemName || line.itemName,
      normPoint: line.normPoint ?? "",
      parentRowId: null,
      quantity: line.quantity,
      quantityText: line.quantityText ?? `${line.quantity} ${line.unit}`,
      rowType: line.isSectionTitle ? "group" as const : "item" as const,
      sortOrder: index,
      sourceNormRowId: null,
    })));
  }

  let currentGroupId: string | null = null;
  return [...sourceRows]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((row) => {
      if (row.rowType === "group") currentGroupId = row.id;
      const issues = card?.lines.filter((line) =>
        line.cardNormRowId === row.id ||
        (!line.cardNormRowId && line.itemId === row.mappedItemId),
      ) ?? [];
      const issuedQuantity = issues
        .filter((line) => !["returned", "written_off", "archived"].includes(line.status))
        .reduce((sum, line) => sum + line.quantity, 0);
      const mappings = row.sourceNormRowId ? store.ppeMappings[row.sourceNormRowId] ?? [] : row.mappings;
      const defaultMapping = mappings.find((mapping) => mapping.isDefault) ?? mappings[0];
      return {
        ...row,
        brandModelArticle: defaultMapping?.brandModelArticle ?? row.brandModelArticle,
        coverageStatus: row.rowType === "group"
          ? "not_issued"
          : issuedQuantity <= 0
            ? "not_issued"
            : issuedQuantity < row.quantity
              ? "partial"
              : "issued",
        defaultUnitPriceMinor: defaultMapping?.defaultUnitPriceMinor ?? row.defaultUnitPriceMinor,
        alreadyIssuedQuantity: row.sourceNormRowId ? issuedQuantity : 0,
        availableQuantity: row.sourceNormRowId ? Math.max(0, row.quantity - issuedQuantity) : Number.MAX_SAFE_INTEGER,
        entitlementStatus: row.sourceNormRowId ? "resolved" : "not_applicable",
        issuedQuantity,
        mappedItemId: defaultMapping?.itemId ?? row.mappedItemId,
        mappedItemName: defaultMapping?.itemName ?? row.mappedItemName,
        mappings,
        parentRowId: row.rowType === "item" && !row.parentRowId ? currentGroupId : row.parentRowId,
      };
    });
}

export function addMonthsIso(value: string, months: number) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

export function ppeSummary(cards: InventoryPpeCardDetailDto[]): InventoryPpeSummaryDto {
  return cards.reduce<InventoryPpeSummaryDto>((summary, card) => {
    const activeLines = card.lines.filter((line) => line.status !== "archived");
    const hasLineStatus = (status: string) => activeLines.some((line) => line.status === status);
    const hasProblem =
      card.status === "warning" ||
      card.status === "overdue" ||
      card.status === "lost" ||
      activeLines.some((line) => (line.unitPriceMinor ?? 0) <= 0) ||
      activeLines.some((line) => ["lost", "overdue"].includes(line.status));

    return {
      active: summary.active + (card.status === "active" ? 1 : 0),
      issued: summary.issued + (card.status === "issued" || hasLineStatus("issued") ? 1 : 0),
      issuedLines: summary.issuedLines + activeLines.filter((line) => line.status === "issued").length,
      issuing: summary.issuing + (card.status === "issuing" || hasLineStatus("issuing") ? 1 : 0),
      linesTotal: summary.linesTotal + activeLines.length,
      notIssued: summary.notIssued + (card.status === "not_issued" || hasLineStatus("not_issued") ? 1 : 0),
      notIssuedLines: summary.notIssuedLines + activeLines.filter((line) => line.status === "not_issued").length,
      partial: summary.partial + (card.status === "partial" || hasLineStatus("partial") ? 1 : 0),
      problem: summary.problem + (hasProblem ? 1 : 0),
      returned: summary.returned + (card.status === "returned" || hasLineStatus("returned") ? 1 : 0),
      total: summary.total + 1,
      writtenOff: summary.writtenOff + (card.status === "written_off" || hasLineStatus("written_off") ? 1 : 0),
    };
  }, { ...emptyPpeSummary });
}

export function mockReports(): InventoryReportDto[] {
  return [
    { description: "Остатки по складам", format: "xlsx", id: "stock", title: "Остатки" },
    { description: "Движения и операции", format: "xlsx", id: "movements", title: "Движения" },
    { description: "Карточки СИЗ", format: "xlsx", id: "ppe", title: "СИЗ" },
    { description: "Под запись", format: "xlsx", id: "custody", title: "Под запись" },
    { description: "Сотрудники учета", format: "xlsx", id: "employees", title: "Сотрудники" },
    { description: "Системный журнал", format: "xlsx", id: "system_log", title: "Системный журнал" },
  ];
}

export function buildLegacyRun(dryRun: boolean): InventoryLegacyImportRunDto {
  return {
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    dryRun,
    error: "",
    id: id("legacy"),
    rowsInserted: dryRun ? 0 : 1,
    rowsRead: 1,
    rowsSkipped: 0,
    rowsUpdated: 0,
    status: "completed",
    stockChecksum: "mock",
    tables: [
      {
        insertedRows: dryRun ? 0 : 1,
        message: "Mock legacy import",
        skippedRows: 0,
        sourceRows: 1,
        status: "completed",
        tableName: "inventory_items",
        updatedRows: 0,
      },
    ],
    tablesScanned: 1,
  };
}

export function fileResponse(fileName: string, text: string): ApiFileResponse {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  return {
    blob,
    contentType: "text/plain;charset=utf-8",
    downloadName: fileName,
    fileName,
    headers: {},
  };
}

export function nextNumber(prefix: string, value: number) {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

export function operationLabel(type: string) {
  const labels: Record<string, string> = {
    issue: "Выдача",
    receipt: "Поступление",
    return: "Возврат",
    write_off: "Списание",
  };
  return labels[type] ?? type;
}

export function id(prefix: string) {
  return `${prefix}-${createClientUuid()}`;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
