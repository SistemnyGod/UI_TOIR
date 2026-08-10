import { describe, expect, it } from "vitest";
import type { InventoryItemDto, InventoryPpeNormCandidateDto, InventoryPpeNormRowDto } from "../api/contracts";
import { matchesPpeNormCandidate, rankPpeCatalogItemsForNorm } from "../features/inventory/ppe/ppeNormSearch";

const winterFootwear: InventoryPpeNormCandidateDto = {
  normRowId: "norm-winter-footwear",
  normSetId: "set-1",
  normSetVersion: 1,
  normItemName: "Сапоги для защиты от механических воздействий, утепленные мехом, для эксплуатации в III климатическом поясе",
  normPoint: "п. 4.7 приложения № 2",
  quantity: 1,
  quantityText: "1 пара",
  issuePeriodText: "1 пара на 1,5 года",
  lifeMonths: 18,
  alreadyIssuedQuantity: 0,
  availableQuantity: 1,
  mappingId: null,
  previouslyConfirmedCount: 0,
  status: "candidate",
  reasons: [],
  warnings: [],
};

describe("PPE norm search", () => {
  it("matches a winter boots norm for a natural-language footwear query", () => {
    expect(matchesPpeNormCandidate(winterFootwear, "обувь специальная для работ зимние")).toBe(true);
  });

  it("matches by norm point", () => {
    expect(matchesPpeNormCandidate(winterFootwear, "4.7")).toBe(true);
  });

  it("does not match an unrelated PPE kind", () => {
    expect(matchesPpeNormCandidate(winterFootwear, "каска защитная")).toBe(false);
  });

  it("puts winter footwear before unrelated and summer catalog items", () => {
    const matches = rankPpeCatalogItemsForNorm(winterFootwearRow, [summerSuit, winterBoots, safetyHelmet]);

    expect(matches.map((match) => match.item.id)).toEqual(["winter-boots"]);
    expect(matches[0]?.reasons).toContain("Зимнее исполнение");
  });

  it("allows an explicit search through other items only after manual expansion", () => {
    expect(rankPpeCatalogItemsForNorm(winterFootwearRow, [safetyHelmet], "каска")).toHaveLength(0);
    expect(rankPpeCatalogItemsForNorm(winterFootwearRow, [safetyHelmet], "каска", true)[0]?.reasons)
      .toContain("Требует ручной проверки");
  });

  it("narrows a catalog query for boots without hiding broader footwear recommendations", () => {
    expect(rankPpeCatalogItemsForNorm(winterFootwearRow, [winterShoes, winterBoots]).map((match) => match.item.id).sort())
      .toEqual(["winter-boots", "winter-shoes"]);
    expect(rankPpeCatalogItemsForNorm(winterFootwearRow, [winterShoes, winterBoots], "сапоги зимние").map((match) => match.item.id))
      .toEqual(["winter-boots"]);
  });
});

const winterFootwearRow: InventoryPpeNormRowDto = {
  id: "row-1",
  parentRowId: "group-1",
  rowType: "item",
  sortOrder: 1,
  normItemName: winterFootwear.normItemName,
  normPoint: winterFootwear.normPoint,
  issuePeriodText: winterFootwear.issuePeriodText,
  quantity: 1,
  quantityText: "1 пара",
  lifeMonths: 18,
  mappings: [],
};

function item(id: string, name: string, category: string): InventoryItemDto {
  return {
    id,
    name,
    sku: "",
    categoryId: null,
    category,
    unitId: null,
    unit: "пара",
    balance: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockAvailable: 0,
    stockStatus: "out_of_stock",
    minStockQty: null,
    itemKind: "ppe",
    normItemName: "",
    actualItemName: name,
    brandName: "",
    modelName: "",
    article: "",
    protectionClass: "",
    clothingSize: "",
    heightSize: "",
    shoeSize: "",
    headSize: "",
    gloveSize: "",
    respiratorSize: "",
    defaultLifeMonths: null,
    defaultUnitPriceMinor: null,
    trackingType: "quantity",
    comment: "",
    isConsumable: false,
    trackLife: false,
    isActive: true,
    status: "active",
  };
}

const winterBoots = item("winter-boots", "Сапоги кожаные зимние утепленные мехом", "Спецобувь");
const winterShoes = item("winter-shoes", "Ботинки кожаные зимние", "Спецобувь");
const summerSuit = item("summer-suit", "Костюм рабочий летний", "Спецодежда");
const safetyHelmet = item("helmet", "Каска защитная белая", "Защита головы");
