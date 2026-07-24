import type {
  InventoryItemSetDetailDto,
  InventoryPpeCardNormRowDto,
} from "../../../api/contracts";

export type PpeIssueDraftLine = {
  brandModelArticle: string;
  cardNormRowId: string;
  issuedAt: string;
  issueMethod: "personal" | "dispenser";
  itemId: string;
  quantity: number;
  unitPriceMinor: number | null;
};

export type PpeIssueWorkflowCache = {
  basis: string;
  draftId?: string;
  employeeId: string;
  issueDate: string;
  issueLines: PpeIssueDraftLine[];
  issueType: "primary" | "planned" | "replacement" | "additional";
  responsibleName: string;
  source: "active_norms" | "previous_card" | "empty";
  step: 1 | 2 | 3 | 4;
};

export type PpeIssueLineProblem = {
  level: "error" | "warning";
  text: string;
};

export const PPE_ISSUE_WORKFLOW_STORAGE_KEY = "patrol360.inventory.ppe.issue-workflow.v2";

export function createIssueDraftLine(
  row: InventoryPpeCardNormRowDto,
  issuedAt: string,
  quantity = row.quantity || 1,
): PpeIssueDraftLine | null {
  if (row.rowType !== "item" || !row.mappedItemId) return null;
  return {
    brandModelArticle: row.brandModelArticle || row.mappedItemName,
    cardNormRowId: row.id,
    issuedAt,
    issueMethod: "personal",
    itemId: row.mappedItemId,
    quantity,
    unitPriceMinor: row.defaultUnitPriceMinor ?? null,
  };
}

export function validateIssueDraftLine(
  line: PpeIssueDraftLine,
  row?: InventoryPpeCardNormRowDto,
): PpeIssueLineProblem[] {
  const problems: PpeIssueLineProblem[] = [];
  if (!line.itemId) problems.push({ level: "error", text: "Не выбрана номенклатура" });
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) problems.push({ level: "error", text: "Количество должно быть больше нуля" });
  if (!line.issuedAt) problems.push({ level: "error", text: "Не указана дата выдачи" });
  if (row && line.quantity > row.quantity && row.quantity > 0) problems.push({ level: "warning", text: "Количество превышает норму" });
  if (row && line.quantity < row.quantity && row.quantity > 0) problems.push({ level: "warning", text: "Количество ниже нормы" });
  return problems;
}

export function applyItemSetToDraft(
  sourceRows: InventoryPpeCardNormRowDto[],
  sourceLines: PpeIssueDraftLine[],
  set: InventoryItemSetDetailDto,
  issuedAt: string,
  idFactory: () => string = () => crypto.randomUUID(),
) {
  const rows = sourceRows.map((row) => ({ ...row }));
  const lines = sourceLines.map((line) => ({ ...line }));
  const selectedItemIds = new Set(lines.map((line) => line.itemId));
  let extraGroup = rows.find((row) => row.rowType === "group" && row.normItemName === "Дополнительная выдача") ?? null;
  let matched = 0;
  let added = 0;
  let skipped = 0;

  for (const setLine of set.items) {
    if (selectedItemIds.has(setLine.item.id)) {
      skipped += 1;
      continue;
    }
    const normRow = rows.find((row) => row.rowType === "item" && row.mappedItemId === setLine.item.id);
    if (normRow) {
      const issueLine = createIssueDraftLine(normRow, issuedAt, setLine.quantity);
      if (issueLine) {
        lines.push(issueLine);
        selectedItemIds.add(issueLine.itemId);
        matched += 1;
      }
      continue;
    }

    if (!extraGroup) {
      extraGroup = {
        brandModelArticle: "",
        coverageStatus: "not_issued",
        defaultUnitPriceMinor: null,
        id: idFactory(),
        issuePeriodText: "",
        issuedQuantity: 0,
        lifeMonths: null,
        mappedItemId: null,
        mappedItemName: "",
        mappings: [],
        normItemName: "Дополнительная выдача",
        normPoint: "",
        parentRowId: null,
        quantity: 0,
        quantityText: "",
        rowType: "group",
        sortOrder: rows.length,
        sourceNormRowId: null,
      };
      rows.push(extraGroup);
    }

    const model = [setLine.item.brandName, setLine.item.modelName, setLine.item.article, setLine.item.protectionClass]
      .filter(Boolean)
      .join(" · ");
    const row: InventoryPpeCardNormRowDto = {
      brandModelArticle: model,
      coverageStatus: "not_issued",
      defaultUnitPriceMinor: setLine.item.defaultUnitPriceMinor ?? null,
      id: idFactory(),
      issuePeriodText: "Дополнительная выдача",
      issuedQuantity: 0,
      lifeMonths: setLine.item.defaultLifeMonths ?? null,
      mappedItemId: setLine.item.id,
      mappedItemName: setLine.item.name,
      mappings: [],
      normItemName: setLine.item.normItemName || setLine.item.name,
      normPoint: "Дополнительная выдача",
      parentRowId: extraGroup.id,
      quantity: setLine.quantity,
      quantityText: `${setLine.quantity} ${setLine.item.unit || "шт."}`,
      rowType: "item",
      sortOrder: rows.length,
      sourceNormRowId: null,
    };
    rows.push(row);
    lines.push(createIssueDraftLine(row, issuedAt, setLine.quantity)!);
    selectedItemIds.add(setLine.item.id);
    added += 1;
  }

  return {
    added,
    lines,
    matched,
    rows: rows.map((row, index) => ({ ...row, sortOrder: index })),
    skipped,
  };
}

export function readPpeIssueWorkflowCache(): PpeIssueWorkflowCache | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PPE_ISSUE_WORKFLOW_STORAGE_KEY) ?? "null");
    return isPpeIssueWorkflowCache(value) ? value : null;
  } catch {
    return null;
  }
}

function isPpeIssueWorkflowCache(value: unknown): value is PpeIssueWorkflowCache {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PpeIssueWorkflowCache>;
  const issueTypes = ["primary", "planned", "replacement", "additional"];
  const sources = ["active_norms", "previous_card", "empty"];
  if (
    typeof candidate.employeeId !== "string" ||
    typeof candidate.issueDate !== "string" ||
    typeof candidate.basis !== "string" ||
    typeof candidate.responsibleName !== "string" ||
    (candidate.draftId !== undefined && typeof candidate.draftId !== "string") ||
    !issueTypes.includes(candidate.issueType ?? "") ||
    !sources.includes(candidate.source ?? "") ||
    !Number.isInteger(candidate.step) || candidate.step! < 1 || candidate.step! > 4 ||
    !Array.isArray(candidate.issueLines)
  ) return false;

  return candidate.issueLines.every((line) => {
    if (!line || typeof line !== "object") return false;
    const draftLine = line as Partial<PpeIssueDraftLine>;
    return (
      typeof draftLine.brandModelArticle === "string" &&
      typeof draftLine.cardNormRowId === "string" &&
      typeof draftLine.itemId === "string" &&
      typeof draftLine.issuedAt === "string" &&
      (draftLine.issueMethod === "personal" || draftLine.issueMethod === "dispenser") &&
      typeof draftLine.quantity === "number" && Number.isFinite(draftLine.quantity) && draftLine.quantity > 0 &&
      (draftLine.unitPriceMinor === null || (typeof draftLine.unitPriceMinor === "number" && Number.isFinite(draftLine.unitPriceMinor)))
    );
  });
}

export function writePpeIssueWorkflowCache(value: PpeIssueWorkflowCache) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PPE_ISSUE_WORKFLOW_STORAGE_KEY, JSON.stringify(value));
}

export function clearPpeIssueWorkflowCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PPE_ISSUE_WORKFLOW_STORAGE_KEY);
}