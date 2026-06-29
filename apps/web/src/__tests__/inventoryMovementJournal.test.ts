import { describe, expect, it } from "vitest";
import type { InventoryCustodyRecordDto, InventoryDocumentDto, InventoryHistoryDto, InventoryItemDto } from "../api/contracts";
import {
  buildInventoryMovementJournal,
  buildInventoryMovementReport,
  filterInventoryMovements,
  movementActionLabel,
  movementStatusLabel,
} from "../features/inventory/history/inventoryMovementJournal";

describe("inventoryMovementJournal", () => {
  const items = [
    item("item-key", "Ключ гаечный 24", "Инструмент"),
    item("item-radio", "Рация Motorola", "Рации"),
    item("item-helmet", "Каска защитная", "СИЗ"),
  ];
  const documents = [
    documentRow("doc-1", "issue", "2026-06-28T10:00:00.000Z", "Иванов Иван Иванович", "Рация Motorola", -2, "шт"),
    documentRow("doc-2", "write_off", "2026-06-29T10:00:00.000Z", "Иванов Иван Иванович", "Ключ гаечный 24", -1, "шт"),
  ];
  const custodyRecords = [
    custodyRecord("cust-1", "returned", "2026-06-27T10:00:00.000Z", "2026-06-29T09:00:00.000Z", "Петров Петр Петрович", "Ключ гаечный 24", 1),
    custodyRecord("cust-2", "lost", "2026-06-29T08:00:00.000Z", "2026-06-29T11:00:00.000Z", "Сидоров Алексей Петрович", "Каска защитная", 1),
  ];
  const history = [
    historyRow("h-1", "cust-1", "created", "2026-06-27T10:00:00.000Z"),
    historyRow("h-2", "cust-1", "returned", "2026-06-29T09:00:00.000Z"),
    historyRow("h-3", "cust-2", "created", "2026-06-29T08:00:00.000Z"),
    historyRow("h-4", "cust-2", "lost", "2026-06-29T11:00:00.000Z"),
    historyRow("h-4", "cust-2", "lost", "2026-06-29T11:00:00.000Z"),
  ];

  it("builds deduplicated movements sorted newest first", () => {
    const rows = buildInventoryMovementJournal({ custodyRecords, documents, history, items });

    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows[0]).toMatchObject({ action: "lost", itemName: "Каска защитная" });
    expect(rows.map((row) => row.createdAt)).toEqual([...rows.map((row) => row.createdAt)].sort((a, b) => Date.parse(b) - Date.parse(a)));
  });

  it("filters by period, action, source, and group", () => {
    const rows = buildInventoryMovementJournal({ custodyRecords, documents, history, items });
    const filtered = filterInventoryMovements(rows, {
      action: "lost",
      group: "Прочее",
      period: "today",
      source: "custody",
    }, new Date("2026-06-29T12:00:00.000Z"));

    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("lost");
  });

  it("filters by free text and status", () => {
    const rows = buildInventoryMovementJournal({ custodyRecords, documents, history, items });
    const filtered = filterInventoryMovements(rows, {
      query: "петров",
      status: "returned",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ employeeName: "Петров Петр Петрович", action: "returned" });
  });

  it("builds report totals from current status per subject", () => {
    const rows = buildInventoryMovementJournal({ custodyRecords, documents, history, items });
    const report = buildInventoryMovementReport(rows);

    expect(report.totals.issued).toBe(4);
    expect(report.totals.returned).toBe(1);
    expect(report.totals.writtenOff).toBe(1);
    expect(report.totals.lost).toBe(1);
    expect(report.byEmployee.find((row) => row.employeeName === "Петров Петр Петрович")?.returned).toBe(1);
    expect(report.byGroup.find((row) => row.group === "Ключи")?.writtenOff).toBe(1);
  });

  it("uses Russian status labels with lost as defective", () => {
    expect(movementStatusLabel("in_use")).toBe("На руках");
    expect(movementStatusLabel("lost")).toBe("Неисправно");
    expect(movementActionLabel("lost")).toBe("Неисправно");
    expect(movementActionLabel("archived")).toBe("Архив");
  });
});

function documentRow(
  id: string,
  type: string,
  createdAt: string,
  employeeName: string,
  itemName: string,
  quantity: number,
  unit: string,
): InventoryDocumentDto {
  return {
    createdAt,
    employeeName,
    id,
    itemName,
    number: id,
    quantity,
    status: "posted",
    type,
    unit,
  };
}

function custodyRecord(
  id: string,
  status: string,
  issuedAt: string,
  closedAt: string | null,
  employeeName: string,
  itemName: string,
  quantity: number,
): InventoryCustodyRecordDto {
  return {
    closedAt,
    comment: "",
    documentId: `${id}-doc`,
    employeeName,
    id,
    issuedAt,
    itemId: `${id}-item`,
    itemName,
    quantity,
    status,
    unit: "шт",
    warehouseId: "",
    warehouseName: "",
  };
}

function historyRow(id: string, entityId: string, action: string, createdAt: string): InventoryHistoryDto {
  return {
    action,
    actor: "Mock",
    createdAt,
    description: action,
    entityId,
    entityType: "custody_record",
    id,
  };
}

function item(id: string, name: string, category: string): InventoryItemDto {
  return {
    actualItemName: name,
    article: id,
    balance: 0,
    brandName: "",
    category,
    categoryId: category,
    clothingSize: "",
    comment: "",
    defaultLifeMonths: null,
    defaultUnitPriceMinor: null,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id,
    isActive: true,
    isConsumable: false,
    itemKind: category,
    minStockQty: null,
    modelName: "",
    name,
    normItemName: name,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: id,
    status: "active",
    stockAvailable: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockStatus: "normal",
    trackLife: false,
    trackingType: "stock",
    unit: "шт",
    unitId: "unit",
  };
}
