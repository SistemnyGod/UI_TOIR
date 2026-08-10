import type {
  InventoryItemDto,
  InventoryItemSetDetailDto,
  InventoryPpeCardNormRowDto,
} from "../../../api/contracts";
import { createClientUuid } from "../../../shared/clientUuid";

export type PpeIssueDraftLine = {
  brandModelArticle: string;
  cardNormRowId: string;
  issuedAt: string;
  issueMethod: "personal" | "dispenser";
  itemId: string;
  quantity: number;
  unitPriceMinor: number | null;
  sizeText: string;
  warehouseId: string | null;
  comment: string;
};

export type PpeSelectedCatalogItem = {
  localId: string;
  item: InventoryItemDto;
  quantity: number;
  sizeText: string;
  warehouseId: string | null;
  unitPriceMinor: number | null;
  comment: string;
  normRowId: string | null;
  mappingId: string | null;
  normResolutionStatus: "unresolved" | "confirmed" | "additional";
};

export type PpeIssueWorkflowCache = {
  basis: string;
  draftId?: string;
  employeeId: string;
  issueDate: string;
  issueLines: PpeIssueDraftLine[];
  selectedCatalogItems?: PpeSelectedCatalogItem[];
  issueType: "primary" | "planned" | "replacement" | "additional";
  responsibleName: string;
  source: "active_norms" | "previous_card" | "empty";
  idempotencyKey?: string;
  step: 1 | 2 | 3 | 4;
};

export type PpeIssueLineProblem = {
  level: "error" | "warning";
  text: string;
};

export const PPE_ISSUE_WORKFLOW_STORAGE_KEY = "patrol360.inventory.ppe.issue-workflow.v3";
const LEGACY_PPE_ISSUE_WORKFLOW_STORAGE_KEY = "patrol360.inventory.ppe.issue-workflow.v2";

export function getPpeIssueWorkflowStorageKey(userId = "", employeeId?: string | null, draftId?: string | null) {
  const ownerKey = userId.trim() ? `${PPE_ISSUE_WORKFLOW_STORAGE_KEY}.${encodeURIComponent(userId.trim())}` : PPE_ISSUE_WORKFLOW_STORAGE_KEY;
  if (!employeeId && !draftId) return ownerKey;
  return `${ownerKey}.${encodeURIComponent(employeeId || "new")}.${encodeURIComponent(draftId || "new")}`;
}

function getPpeIssueWorkflowIndexKey(userId: string) {
  return `${getPpeIssueWorkflowStorageKey(userId)}.active`;
}

export function createIssueDraftLine(
  row: InventoryPpeCardNormRowDto,
  issuedAt: string,
  quantity = row.quantity || 1,
): PpeIssueDraftLine | null {
  if (row.rowType !== "item" || !row.mappedItemId) return null;
  return {
    brandModelArticle: row.draftBrandModelArticle || row.brandModelArticle || row.mappedItemName,
    cardNormRowId: row.id,
    issuedAt,
    issueMethod: row.draftIssueMethod === "dispenser" ? "dispenser" : "personal",
    itemId: row.mappedItemId,
    quantity: row.draftQuantity ?? quantity,
    unitPriceMinor: row.draftUnitPriceMinor ?? row.defaultUnitPriceMinor ?? null,
    sizeText: row.draftSizeText ?? "",
    warehouseId: row.draftWarehouseId ?? null,
    comment: row.draftComment ?? "",
  };
}

export function mergeIssueDraftLine(created: PpeIssueDraftLine, existing?: PpeIssueDraftLine): PpeIssueDraftLine {
  if (!existing) return created;
  return {
    ...created,
    brandModelArticle: existing.brandModelArticle || created.brandModelArticle,
    issuedAt: existing.issuedAt,
    issueMethod: existing.issueMethod,
    quantity: existing.quantity,
    unitPriceMinor: existing.unitPriceMinor,
    sizeText: existing.sizeText ?? created.sizeText,
    warehouseId: existing.warehouseId ?? created.warehouseId,
    comment: existing.comment ?? created.comment,
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
  if (!line.warehouseId) problems.push({ level: "error", text: "Не выбран склад" });
  if (line.unitPriceMinor === null || !Number.isFinite(line.unitPriceMinor) || line.unitPriceMinor <= 0) problems.push({ level: "error", text: "Не указана цена за единицу" });
  if (row && line.quantity > row.quantity && row.quantity > 0) problems.push({ level: "warning", text: "Количество превышает норму" });
  if (row && line.quantity < row.quantity && row.quantity > 0) problems.push({ level: "warning", text: "Количество ниже нормы" });
  if (row?.sourceNormRowId && row.entitlementStatus === "manual_control_required") {
    problems.push({ level: "error", text: "Период нормы требует ручной проверки до выдачи" });
  }
  if (row?.sourceNormRowId && typeof row.availableQuantity === "number" && line.quantity > row.availableQuantity) {
    problems.push({ level: "error", text: `Доступно по норме: ${row.availableQuantity}; выбрано: ${line.quantity}` });
  }
  return problems.filter((problem) => !(row && line.quantity < row.quantity && problem.level === "warning"));
}

export function applyItemSetToDraft(
  sourceRows: InventoryPpeCardNormRowDto[],
  sourceLines: PpeIssueDraftLine[],
  set: InventoryItemSetDetailDto,
  issuedAt: string,
  idFactory: () => string = createClientUuid,
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

export function readPpeIssueWorkflowCache(userId = ""): PpeIssueWorkflowCache | null {
  if (typeof window === "undefined") return null;
  const normalizedUserId = userId.trim();
  const activeKey = normalizedUserId ? window.localStorage.getItem(getPpeIssueWorkflowIndexKey(normalizedUserId)) : null;
  const keys = normalizedUserId
    ? Array.from(new Set([activeKey, getPpeIssueWorkflowStorageKey(normalizedUserId)].filter((key): key is string => Boolean(key))))
    : [PPE_ISSUE_WORKFLOW_STORAGE_KEY, LEGACY_PPE_ISSUE_WORKFLOW_STORAGE_KEY];
  for (const key of keys) {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
      if (isPpeIssueWorkflowCache(value)) return value;
    } catch {
      // A damaged local copy must not prevent loading the server draft.
    }
  }
  return null;
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
    (candidate.idempotencyKey !== undefined && typeof candidate.idempotencyKey !== "string") ||
    !issueTypes.includes(candidate.issueType ?? "") ||
    !sources.includes(candidate.source ?? "") ||
    !Number.isInteger(candidate.step) || candidate.step! < 1 || candidate.step! > 4 ||
    !Array.isArray(candidate.issueLines) ||
    (candidate.selectedCatalogItems !== undefined && !Array.isArray(candidate.selectedCatalogItems))
  ) return false;

  const validLines = candidate.issueLines.every((line) => {
    if (!line || typeof line !== "object") return false;
    const draftLine = line as Partial<PpeIssueDraftLine>;
    return (
      typeof draftLine.brandModelArticle === "string" &&
      typeof draftLine.cardNormRowId === "string" &&
      typeof draftLine.itemId === "string" &&
      typeof draftLine.issuedAt === "string" &&
      (draftLine.issueMethod === "personal" || draftLine.issueMethod === "dispenser") &&
      typeof draftLine.quantity === "number" && Number.isFinite(draftLine.quantity) && draftLine.quantity > 0 &&
      (draftLine.unitPriceMinor === null || draftLine.unitPriceMinor === undefined || (typeof draftLine.unitPriceMinor === "number" && Number.isFinite(draftLine.unitPriceMinor))) &&
      (draftLine.sizeText === undefined || typeof draftLine.sizeText === "string") &&
      (draftLine.warehouseId === undefined || draftLine.warehouseId === null || typeof draftLine.warehouseId === "string") &&
      (draftLine.comment === undefined || typeof draftLine.comment === "string")
    );
  });
  if (!validLines) return false;
  return (candidate.selectedCatalogItems ?? []).every((selected) => {
    if (!selected || typeof selected !== "object") return false;
    const row = selected as Partial<PpeSelectedCatalogItem>;
    return typeof row.localId === "string" &&
      row.item !== null && typeof row.item === "object" &&
      typeof row.quantity === "number" && Number.isFinite(row.quantity) && row.quantity > 0 &&
      typeof row.sizeText === "string" &&
      (row.warehouseId === null || typeof row.warehouseId === "string") &&
      (row.unitPriceMinor === undefined || row.unitPriceMinor === null || (typeof row.unitPriceMinor === "number" && Number.isFinite(row.unitPriceMinor) && row.unitPriceMinor >= 0)) &&
      typeof row.comment === "string" &&
      (row.normRowId === null || typeof row.normRowId === "string") &&
      (row.mappingId === null || typeof row.mappingId === "string") &&
      ["unresolved", "confirmed", "additional"].includes(row.normResolutionStatus ?? "");
  });
}

export function writePpeIssueWorkflowCache(value: PpeIssueWorkflowCache, userId = "") {
  if (typeof window === "undefined") return;
  const normalizedUserId = userId.trim();
  const key = getPpeIssueWorkflowStorageKey(normalizedUserId, value.employeeId, value.draftId);
  window.localStorage.setItem(key, JSON.stringify(value));
  if (normalizedUserId) window.localStorage.setItem(getPpeIssueWorkflowIndexKey(normalizedUserId), key);
}

export function clearPpeIssueWorkflowCache(userId = "") {
  if (typeof window === "undefined") return;
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    for (const key of [PPE_ISSUE_WORKFLOW_STORAGE_KEY, LEGACY_PPE_ISSUE_WORKFLOW_STORAGE_KEY]) window.localStorage.removeItem(key);
    return;
  }
  const indexKey = getPpeIssueWorkflowIndexKey(normalizedUserId);
  const activeKey = window.localStorage.getItem(indexKey);
  if (activeKey) window.localStorage.removeItem(activeKey);
  window.localStorage.removeItem(indexKey);
  window.localStorage.removeItem(getPpeIssueWorkflowStorageKey(normalizedUserId));
}
