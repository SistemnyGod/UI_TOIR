import { beforeEach, describe, expect, it } from "vitest";
import type {
  InventoryItemDto,
  InventoryItemSetDetailDto,
  InventoryPpeCardNormRowDto,
} from "../api/contracts";
import {
  applyItemSetToDraft,
  createIssueDraftLine,
  readPpeIssueWorkflowCache,
  PPE_ISSUE_WORKFLOW_STORAGE_KEY,
  validateIssueDraftLine,
} from "../features/inventory/ppe/ppeIssueDraft";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() });
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() });
});

function item(id: string, name = id): InventoryItemDto {
  return {
    actualItemName: name,
    article: `${id}-article`,
    balance: 10,
    brandName: "Тест",
    category: "СИЗ",
    categoryId: "category-ppe",
    clothingSize: "",
    comment: "",
    defaultLifeMonths: 12,
    defaultUnitPriceMinor: 10000,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id,
    isActive: true,
    isConsumable: false,
    itemKind: "ppe",
    minStockQty: null,
    modelName: "Модель",
    name,
    normItemName: name,
    protectionClass: "1",
    respiratorSize: "",
    shoeSize: "",
    sku: `${id}-sku`,
    status: "active",
    stockAvailable: 10,
    stockPhysical: 10,
    stockReserved: 0,
    stockStatus: "in_stock",
    trackLife: true,
    trackingType: "quantity",
    unit: "шт.",
    unitId: "unit-piece",
  };
}

function normRow(id: string, mappedItemId: string | null, quantity = 2): InventoryPpeCardNormRowDto {
  return {
    brandModelArticle: mappedItemId ? "Тест · Модель" : "",
    coverageStatus: "not_issued",
    defaultUnitPriceMinor: 10000,
    id,
    issuePeriodText: "1 год",
    issuedQuantity: 0,
    lifeMonths: 12,
    mappedItemId,
    mappedItemName: mappedItemId ?? "",
    mappings: [],
    normItemName: `Норма ${id}`,
    normPoint: "п. 1",
    parentRowId: null,
    quantity,
    quantityText: `${quantity} шт.`,
    rowType: "item",
    sortOrder: 0,
    sourceNormRowId: `source-${id}`,
  };
}

describe("PPE issue workflow draft", () => {
  it("ignores a malformed persisted draft instead of restoring invalid issue rows", () => {
    window.localStorage.setItem(PPE_ISSUE_WORKFLOW_STORAGE_KEY, JSON.stringify({
      employeeId: "employee-1",
      issueDate: "2026-07-23",
      issueLines: [{ cardNormRowId: "row-1", quantity: "not-a-number" }],
    }));

    expect(readPpeIssueWorkflowCache()).toBeNull();
  });

  it("applies a set without duplicate products and separates matched and additional rows", () => {
    const mapped = item("item-mapped", "Костюм");
    const extra = item("item-extra", "Очки");
    const row = normRow("norm-1", mapped.id);
    const existing = createIssueDraftLine(row, "2026-07-23", 1)!;
    const set: InventoryItemSetDetailDto = {
      id: "set-1",
      isActive: true,
      name: "Комплект",
      items: [
        { id: "set-line-1", item: mapped, quantity: 2 },
        { id: "set-line-2", item: extra, quantity: 1 },
        { id: "set-line-3", item: extra, quantity: 1 },
      ],
    };

    const result = applyItemSetToDraft([row], [existing], set, "2026-07-23", (() => {
      let id = 0;
      return () => `generated-${++id}`;
    })());

    expect(result.skipped).toBe(2);
    expect(result.added).toBe(1);
    expect(result.lines.map((line) => line.itemId)).toEqual([mapped.id, extra.id]);
    expect(result.rows.some((candidate) => candidate.normItemName === "Дополнительная выдача")).toBe(true);
  });

  it("keeps actual quantity independent from the normative quantity", () => {
    const row = normRow("norm-quantity", "item-1", 2);
    const line = createIssueDraftLine(row, "2026-07-23", 1)!;

    expect(row.quantity).toBe(2);
    expect(line.quantity).toBe(1);
    expect(validateIssueDraftLine(line, row)).toContainEqual({
      level: "warning",
      text: "Количество ниже нормы",
    });
  });
});

describe("PPE issue mock API", () => {
  it("persists draft requisites and creates issue rows atomically", async () => {
    const repository = createMockInventoryRepository();
    const [employees, settings] = await Promise.all([
      repository.getEmployees({ pageSize: 100 }),
      repository.getSettings(),
    ]);
    const employee = employees.rows.find((candidate) =>
      settings.positionNorms.some((norm) => norm.positionName.trim().toLocaleLowerCase("ru") === candidate.position.trim().toLocaleLowerCase("ru")),
    );
    expect(employee).toBeTruthy();

    const draft = await repository.createPpeCardDraft({
      basis: "Приказ № 100",
      cardDate: "2026-07-23T12:00:00.000Z",
      employeeId: employee!.id,
      issueType: "planned",
      responsibleName: "Иванов И.И.",
      source: "active_norms",
    });
    const updated = await repository.updatePpeCardDraft(draft.id, {
      basis: "Приказ № 101",
      cardDate: "2026-07-24T12:00:00.000Z",
      employeeDetails: draft.employeeDetails,
      expectedVersion: draft.version ?? 0,
      issueType: "replacement",
      responsibleName: "Петров П.П.",
    });
    expect(updated).toMatchObject({
      basis: "Приказ № 101",
      issueType: "replacement",
      responsibleName: "Петров П.П.",
    });

    const rows = (updated.normRows ?? []).filter((row) => row.rowType === "item" && row.mappedItemId).slice(0, 2);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const before = await repository.getPpeHistory({ employeeId: employee!.id, pageSize: 100 });
    await expect(repository.createPpeIssueBatch(updated.id, {
      expectedVersion: updated.version ?? 0,
      lines: [
        {
          cardNormRowId: rows[0].id,
          issueMethod: "personal",
          issuedAt: "2026-07-24T12:00:00.000Z",
          itemId: rows[0].mappedItemId!,
          quantity: 1,
          unitPriceMinor: null,
        },
        {
          cardNormRowId: rows[1].id,
          issueMethod: "personal",
          issuedAt: "2026-07-24T12:00:00.000Z",
          itemId: "missing-item",
          quantity: 1,
          unitPriceMinor: null,
        },
      ],
    })).rejects.toThrow();
    const afterFailure = await repository.getPpeHistory({ employeeId: employee!.id, pageSize: 100 });
    expect(afterFailure.total).toBe(before.total);

    const saved = await repository.createPpeIssueBatch(updated.id, {
      expectedVersion: updated.version ?? 0,
      lines: rows.map((row) => ({
        cardNormRowId: row.id,
        issueMethod: "personal" as const,
        issuedAt: "2026-07-24T12:00:00.000Z",
        itemId: row.mappedItemId!,
        quantity: 1,
        unitPriceMinor: null,
      })),
    });
    expect(saved.lines.filter((line) => line.status === "issued")).toHaveLength(rows.length);
  });
});
function createMemoryStorage(): Storage {
  const rows = new Map<string, string>();
  return {
    clear: () => rows.clear(),
    getItem: (key: string) => rows.get(key) ?? null,
    key: (index: number) => Array.from(rows.keys())[index] ?? null,
    get length() { return rows.size; },
    removeItem: (key: string) => { rows.delete(key); },
    setItem: (key: string, value: string) => { rows.set(key, value); },
  };
}