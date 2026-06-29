import { describe, expect, it } from "vitest";
import type { InventoryItemDto, InventoryPpeCardDetailDto } from "../api/contracts";
import { buildPrintHtml } from "../features/inventory/ppe/ppePrint";
import { printDataFromDetail } from "../features/inventory/ppe/ppePrintMapping";
import { defaultIssuePeriodText } from "../features/inventory/ppe/ppeStatusCatalog";

describe("ppe print mapping", () => {
  it("formats supported PPE issue periods", () => {
    expect(defaultIssuePeriodText(12)).toBe("1 год");
    expect(defaultIssuePeriodText(18)).toBe("1,5 года");
    expect(defaultIssuePeriodText(24)).toBe("2 года");
    expect(defaultIssuePeriodText(30)).toBe("2,5 года");
    expect(defaultIssuePeriodText(36)).toBe("3 года");
  });

  it("keeps employee details and norm lines in the personal card", () => {
    const data = printDataFromDetail(cardDetail(), inventoryItems());
    const html = buildPrintHtml(data, "card");

    expect(data.employeeDetails).toMatchObject({
      clothingSize: "52-54",
      gender: "муж.",
      handProtectionSize: "10",
      headSize: "58",
      height: "176",
      respiratorSize: "К3",
      shoeSize: "43",
    });
    expect(html).toContain("Каска защитная от механических воздействий");
    expect(html).toContain("Средства защиты головы:");
    expect(html).toContain("Перчатки диэлектрические");
    expect(html).toContain("1,5 года");
  });

  it("prints actual issued PPE in the signature sheet without norm-only rows", () => {
    const data = printDataFromDetail(cardDetail(), inventoryItems());
    const html = buildPrintHtml(data, "sheet");

    expect(html).toContain("Каска защитная от механических воздействий");
    expect(html).toContain("Форвард, Эксперт К3/SIM-06/K");
    expect(html).toContain("10.06.2026");
    expect(html).not.toContain("Средства защиты головы:");
    expect(html).not.toContain("Перчатки диэлектрические");
  });

  it("keeps not-issued rows out of the signature sheet but does not break empty employee details", () => {
    const detail = cardDetail({
      employeeDetails: {
        clothingSize: "",
        gender: "",
        handProtectionSize: "",
        headSize: "",
        height: "",
        respiratorSize: "",
        shoeSize: "",
      },
      lines: [notIssuedLine()],
    });
    const data = printDataFromDetail(detail, inventoryItems());

    expect(() => buildPrintHtml(data, "card")).not.toThrow();
    expect(buildPrintHtml(data, "card")).toContain("Перчатки диэлектрические");
    expect(buildPrintHtml(data, "sheet")).toContain("Нет строк со статусом");
  });
});

function cardDetail(patch: Partial<InventoryPpeCardDetailDto> = {}): InventoryPpeCardDetailDto {
  return {
    comment: "Тестовая карточка СИЗ",
    createdAt: "2026-06-01T00:00:00.000Z",
    employeeDepartment: "Энергоучасток",
    employeeDetails: {
      clothingSize: "52-54",
      gender: "муж.",
      handProtectionSize: "10",
      headSize: "58",
      height: "176",
      respiratorSize: "К3",
      shoeSize: "43",
    },
    employeeId: "emp-1",
    employeeName: "Иванов Иван Иванович",
    employeePersonnelNo: "T-001",
    id: "ppe-card-test",
    lines: [sectionLine(), issuedLine(), notIssuedLine()],
    position: "Электрик",
    status: "issued",
    ...patch,
  };
}

function sectionLine() {
  return {
    amountMinor: 0,
    brandModelArticle: "",
    dueAt: null,
    id: "ppe-line-section",
    issuedAt: null,
    issuePeriodText: "",
    itemId: "item-section",
    itemName: "Средства защиты головы:",
    modelDescription: "",
    normPoint: "",
    printItemName: "Средства защиты головы:",
    quantity: 1,
    status: "not_issued",
    unit: "",
    unitPriceMinor: 0,
    warehouseId: null,
    warehouseName: "",
  };
}

function issuedLine() {
  return {
    amountMinor: 250000,
    brandModelArticle: "Форвард, Эксперт К3/SIM-06/K",
    dueAt: "2028-06-10T00:00:00.000Z",
    id: "ppe-line-issued",
    issuedAt: "2026-06-10T00:00:00.000Z",
    issuePeriodText: "2 года",
    itemId: "item-helmet",
    itemName: "Каска защитная",
    modelDescription: "Форвард, Эксперт К3/SIM-06/K",
    normPoint: "п. 1645",
    printItemName: "Каска защитная от механических воздействий",
    quantity: 1,
    status: "issued",
    unit: "шт.",
    unitPriceMinor: 250000,
    warehouseId: "wh-ppe",
    warehouseName: "Склад СИЗ",
  };
}

function notIssuedLine() {
  return {
    amountMinor: 0,
    brandModelArticle: "Класс 0",
    dueAt: null,
    id: "ppe-line-not-issued",
    issuedAt: null,
    issuePeriodText: "1,5 года",
    itemId: "item-gloves",
    itemName: "Перчатки диэлектрические",
    modelDescription: "Класс 0",
    normPoint: "п. 1646",
    printItemName: "Перчатки диэлектрические",
    quantity: 1,
    status: "not_issued",
    unit: "пар",
    unitPriceMinor: 0,
    warehouseId: "wh-ppe",
    warehouseName: "Склад СИЗ",
  };
}

function inventoryItems(): InventoryItemDto[] {
  return [
    inventoryItem("item-helmet", "Каска защитная", "Каска защитная от механических воздействий", "Форвард", "Эксперт К3/SIM-06/K", 24),
    inventoryItem("item-gloves", "Перчатки диэлектрические", "Перчатки диэлектрические", "", "Класс 0", 18),
  ];
}

function inventoryItem(
  id: string,
  name: string,
  normItemName: string,
  brandName: string,
  modelName: string,
  lifeMonths: number,
): InventoryItemDto {
  return {
    actualItemName: name,
    article: id,
    balance: 0,
    brandName,
    category: "СИЗ",
    categoryId: "cat-ppe",
    clothingSize: "",
    comment: "",
    defaultLifeMonths: lifeMonths,
    defaultUnitPriceMinor: 0,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id,
    isActive: true,
    isConsumable: false,
    itemKind: "ppe",
    minStockQty: null,
    modelName,
    name,
    normItemName,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: id,
    status: "active",
    stockAvailable: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockStatus: "normal",
    trackLife: true,
    trackingType: "ppe",
    unit: "шт.",
    unitId: "unit",
  };
}
