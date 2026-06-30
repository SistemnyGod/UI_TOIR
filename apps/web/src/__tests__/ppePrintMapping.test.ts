import { describe, expect, it } from "vitest";
import type { InventoryItemDto, InventoryPpeCardDetailDto, InventoryPositionNormDto } from "../api/contracts";
import { buildPrintHtml } from "../features/inventory/ppe/ppePrint";
import { parsePositiveQuantity } from "../features/inventory/ppe/ppeFormatters";
import { printDataFromDetail, printDataFromWizard, toLineFromNorm } from "../features/inventory/ppe/ppePrintMapping";
import { loadPpeNormMappings, ppeNormKeyFromNorm, savePpeNormMapping } from "../features/inventory/ppe/ppeNormMapping";
import { defaultIssuePeriodText } from "../features/inventory/ppe/ppeStatusCatalog";
import { buildWizardLinePayloads } from "../features/inventory/ppe/ppeWizardPayloads";

describe("ppe print mapping", () => {
  it("formats supported PPE issue periods", () => {
    expect(defaultIssuePeriodText(12)).toBe("на год");
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
    expect(html).toContain("Выдача предусмотрена Приказом Минтруда России от 27.12.2017 N 882н");
    expect(html).toContain("Зарегистрировано в Минюсте России 01.03.2018 N 50193");
    expect(html).toContain("1,5 года");
    expect(html).toContain("1 пара");
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

  it("keeps returned issued PPE in the signature sheet return block", () => {
    const returnedLine = {
      ...issuedLine(),
      dueAt: "2026-07-01T00:00:00.000Z",
      id: "ppe-line-returned",
      status: "returned",
    };
    const data = printDataFromDetail(cardDetail({ lines: [sectionLine(), returnedLine, notIssuedLine()] }), inventoryItems());
    const html = buildPrintHtml(data, "sheet");

    expect(html).toContain(returnedLine.printItemName);
    expect(html).toContain("01.07.2026");
    expect(html).not.toContain(notIssuedLine().printItemName);
  });

  it("keeps written off issued PPE in the signature sheet with an act marker", () => {
    const writtenOffLine = {
      ...issuedLine(),
      dueAt: "2026-07-02T00:00:00.000Z",
      id: "ppe-line-written-off",
      status: "written_off",
    };
    const data = printDataFromDetail(cardDetail({ lines: [sectionLine(), writtenOffLine, notIssuedLine()] }), inventoryItems());
    const html = buildPrintHtml(data, "sheet");

    expect(html).toContain(writtenOffLine.printItemName);
    expect(html).toContain("02.07.2026");
    expect(html).toContain("Требуется акт");
    expect(html).not.toContain(notIssuedLine().printItemName);
  });

  it("uses explicit issue method in the signature sheet when available", () => {
    const data = printDataFromDetail(cardDetail(), inventoryItems());
    data.lines = data.lines.map((line) =>
      line.status === "issued" && !line.isSectionTitle ? { ...line, issueMethod: "dispenser" } : line,
    );

    expect(buildPrintHtml(data, "sheet")).toContain("дозатор");
  });

  it("keeps section rows as personal-card separators only", () => {
    const data = printDataFromDetail(cardDetail(), inventoryItems());
    const cardHtml = buildPrintHtml(data, "card");
    const sheetHtml = buildPrintHtml(data, "sheet");
    const section = data.lines.find((line) => line.printItemName === "Средства защиты головы:");

    expect(section).toMatchObject({
      amount: 0,
      dueAt: null,
      issuedAt: null,
      isSectionTitle: true,
      issuePeriodText: "",
      normPoint: "",
      quantityText: "",
      unitPrice: 0,
    });
    expect(cardHtml).toContain('<tr class="is-section-title"><td>Средства защиты головы:</td><td></td><td></td><td></td></tr>');
    expect(sheetHtml).not.toContain("Средства защиты головы:");
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

  it("preserves printable quantity text from position norms through wizard payload and preview", () => {
    const item = { ...inventoryItem("item-test-gloves", "Test gloves", "Test gloves norm", "", "", 12), unit: "pair" };
    const norm: InventoryPositionNormDto = {
      id: "norm-print-quantity",
      itemId: item.id,
      itemName: item.name,
      lifeMonths: 12,
      normItemName: "Test gloves norm",
      normPoint: "p. 1.2",
      positionName: "Electrician",
      quantity: 2,
      quantityText: "2 pair per year",
      issuePeriodText: "pair, per year",
      isSectionTitle: false,
    };
    const line = toLineFromNorm(norm, new Map([[item.id, item]]));

    expect(line.quantityText).toBe("2 pair per year");
    expect(parsePositiveQuantity(line.quantityText ?? "")).toBe(2);

    const wizardLine = {
      brandModelArticle: line.brandModelArticle ?? "",
      catalogName: line.catalogName ?? item.name,
      dueAt: line.dueAt ?? "",
      issuePeriodText: line.issuePeriodText ?? "",
      issuedAt: "",
      isSectionTitle: false,
      item,
      normPoint: line.normPoint ?? "",
      priceText: "0",
      printItemName: line.printItemName ?? item.normItemName,
      quantityText: line.quantityText ?? "",
      status: "not_issued",
      warehouseId: "",
    };
    const payloads = buildWizardLinePayloads([wizardLine], false);
    const printData = printDataFromWizard(
      { comment: "", employeeId: "emp-test", lines: [wizardLine], mode: "create", step: 2 },
      null,
    );

    expect("payloads" in payloads ? payloads.payloads[0].payload.quantityText : "").toBe("2 pair per year");
    expect(printData.lines[0].quantityText).toBe("2 pair per year");
  });

  it("keeps position norm section rows clean before wizard save", () => {
    const item = { ...inventoryItem("item-section-source", "Source item", "Source item", "Brand", "Model", 12), defaultUnitPriceMinor: 12345 };
    const norm: InventoryPositionNormDto = {
      id: "norm-section-source",
      itemId: item.id,
      itemName: item.name,
      lifeMonths: 12,
      normItemName: "Head protection:",
      normPoint: "p. ignored",
      positionName: "Electrician",
      quantity: 3,
      quantityText: "3 pcs",
      issuePeriodText: "ignored period",
      isSectionTitle: true,
    };
    const line = toLineFromNorm(norm, new Map([[item.id, item]]));

    expect(line).toMatchObject({
      brandModelArticle: "",
      dueAt: "",
      isSectionTitle: true,
      issuePeriodText: "",
      normPoint: "",
      priceText: "0",
      printItemName: "Head protection:",
      quantityText: "",
    });
  });

  it("stores norm-to-catalog mapping in the web mock layer", () => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    const norm: InventoryPositionNormDto = {
      id: "norm-map",
      itemId: "item-helmet",
      itemName: "Helmet catalog",
      lifeMonths: 24,
      normItemName: "Helmet by norm",
      normPoint: "p. 1.3.1",
      positionName: "Electrician",
      quantity: 1,
      quantityText: "1 pcs",
      issuePeriodText: "2 years",
      isSectionTitle: false,
    };
    const normKey = ppeNormKeyFromNorm(norm);

    savePpeNormMapping({
      brandModelArticle: "SOMZ, Expert",
      itemId: "item-helmet",
      normKey,
      priceText: "123,45",
    });

    expect(loadPpeNormMappings()[normKey]).toMatchObject({
      brandModelArticle: "SOMZ, Expert",
      itemId: "item-helmet",
      priceText: "123,45",
    });
  });

  it("keeps section wizard rows out of issue quantity and price validation", () => {
    const item = inventoryItem("item-section-head", "Head protection:", "Head protection:", "", "", 0);
    const payloads = buildWizardLinePayloads(
      [
        {
          brandModelArticle: "",
          catalogName: item.name,
          dueAt: "",
          issuePeriodText: "",
          issuedAt: "",
          isSectionTitle: true,
          item,
          normPoint: "",
          priceText: "",
          printItemName: "Head protection:",
          quantityText: "",
          status: "issuing",
          warehouseId: "",
        },
      ],
      true,
    );

    if ("error" in payloads) {
      throw new Error(payloads.error);
    }

    expect(payloads.payloads[0].payload).toMatchObject({
      dueAt: null,
      issuedAt: null,
      isSectionTitle: true,
      issuePeriodText: null,
      printItemName: "Head protection:",
      quantity: 1,
      quantityText: "",
      status: "not_issued",
      unitPriceMinor: 0,
      warehouseId: null,
    });
  });

  it("normalizes colon section rows in wizard print preview", () => {
    const item = inventoryItem("item-section-manual", "Head protection:", "Head protection:", "", "", 0);
    const data = printDataFromWizard(
      {
        comment: "",
        employeeId: "emp-test",
        lines: [
          {
            brandModelArticle: "Ignored model",
            catalogName: item.name,
            dueAt: "2027-01-01",
            issuePeriodText: "1 year",
            issuedAt: "2026-06-01",
            item,
            normPoint: "ignored point",
            priceText: "123.45",
            printItemName: "Head protection:",
            quantityText: "2 pcs",
            status: "issued",
            warehouseId: "wh-ppe",
          },
        ],
        mode: "create",
        step: 2,
      },
      null,
    );

    expect(data.lines[0]).toMatchObject({
      amount: 0,
      dueAt: null,
      issuedAt: null,
      isSectionTitle: true,
      issuePeriodText: "",
      printItemName: "Head protection:",
      quantity: 2,
      quantityText: "",
      unitPrice: 0,
    });
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
    quantityText: "",
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
    quantityText: "1 шт.",
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
    quantityText: "1 пара",
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
