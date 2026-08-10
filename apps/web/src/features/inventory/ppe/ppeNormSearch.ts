import type { InventoryItemDto, InventoryPpeNormCandidateDto, InventoryPpeNormRowDto } from "../../../api/contracts";

const ignoredStems = ["атом", "выдач", "для", "норм", "пункт", "работ", "сиз", "специал"];

const synonymGroups = [
  ["обув", "ботин", "полуботин", "сапог"],
  ["зим", "утепл", "мех"],
];

const catalogKindGroups = [
  { label: "Обувь", stems: ["обув", "ботин", "полуботин", "сапог", "туфл"] },
  { label: "Одежда", stems: ["костюм", "куртк", "брюк", "комбинез", "халат", "плащ"] },
  { label: "Защита рук", stems: ["перчат", "рукавиц", "краг"] },
  { label: "Защита головы", stems: ["каск", "шлем", "подшлем", "шапк"] },
  { label: "Защита глаз и лица", stems: ["очк", "щиток", "маск свар"] },
  { label: "Защита дыхания", stems: ["респиратор", "противогаз", "полумаск", "самоспас"] },
  { label: "Защита слуха", stems: ["наушник", "беруш"] },
  { label: "Защита от падения", stems: ["привяз", "строп", "пояс"] },
];

const winterStems = ["зим", "утепл", "мех", "тинсулейт", "поляр"];
const summerStems = ["летн", "лето"];
const catalogSearchStems = ["обув", "ботин", "полуботин", "сапог", "туфл", "зим", "утепл", "мех", "каск", "костюм", "куртк", "перчат"];
const catalogIgnoredTokens = new Set(["для", "сиз", "специальный", "специальная", "специальные", "защиты", "работ", "работы", "норма", "нормы"]);

function normalize(value: string) {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function searchGroups(query: string) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const groups: string[][] = [];
  for (const token of tokens) {
    if (ignoredStems.some((stem) => token.startsWith(stem))) continue;
    const synonymGroup = synonymGroups.find((group) => group.some((stem) => token.startsWith(stem)));
    const group = synonymGroup ?? [token.length > 5 ? token.slice(0, -2) : token];
    if (!groups.some((existing) => existing.join("|") === group.join("|"))) groups.push(group);
  }
  return groups;
}

export function matchesPpeSearchText(values: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  const haystack = normalize(values.filter(Boolean).join(" "));
  const groups = searchGroups(query);
  if (!groups.length) return haystack.includes(normalizedQuery);
  return groups.every((group) => group.some((stem) => haystack.includes(stem)));
}

export function matchesPpeNormCandidate(candidate: InventoryPpeNormCandidateDto, query: string) {
  return matchesPpeSearchText([candidate.normItemName, candidate.normPoint, candidate.issuePeriodText], query);
}

function catalogItemText(item: InventoryItemDto) {
  return normalize([
    item.name,
    item.normItemName,
    item.actualItemName,
    item.itemKind,
    item.category,
    item.sku,
    item.article,
    item.brandName,
    item.modelName,
    item.protectionClass,
  ].filter(Boolean).join(" "));
}

function detectedKinds(value: string) {
  return catalogKindGroups.filter((group) => group.stems.some((stem) => value.includes(stem)));
}

function hasAnyStem(value: string, stems: string[]) {
  return stems.some((stem) => value.includes(stem));
}

function significantTokens(value: string) {
  return normalize(value).split(" ").filter((token) => token.length >= 4 && !catalogIgnoredTokens.has(token));
}

function matchesCatalogQuery(itemText: string, query: string) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  return tokens.every((token) => {
    const knownStem = catalogSearchStems.find((stem) => token.startsWith(stem));
    const stem = knownStem ?? (token.length > 5 ? token.slice(0, -2) : token);
    return itemText.includes(stem);
  });
}

export interface PpeCatalogNormMatch {
  item: InventoryItemDto;
  reasons: string[];
  score: number;
}

export function rankPpeCatalogItemsForNorm(
  normRow: InventoryPpeNormRowDto,
  items: InventoryItemDto[],
  query = "",
  includeOther = false,
  limit = 12,
): PpeCatalogNormMatch[] {
  const normText = normalize([normRow.normItemName, normRow.issuePeriodText].filter(Boolean).join(" "));
  const normKinds = detectedKinds(normText);
  const normWinter = hasAnyStem(normText, winterStems);
  const normSummer = hasAnyStem(normText, summerStems);
  const queryText = query.trim();
  const normTokens = significantTokens(normText);

  return items.flatMap((item) => {
    const itemText = catalogItemText(item);
    if (queryText && !matchesCatalogQuery(itemText, queryText)) return [];

    const itemKinds = detectedKinds(itemText);
    const sharedKind = normKinds.find((kind) => itemKinds.some((candidate) => candidate.label === kind.label));
    const itemWinter = hasAnyStem(itemText, winterStems);
    const itemSummer = hasAnyStem(itemText, summerStems);
    const seasonConflict = (normWinter && itemSummer && !itemWinter) || (normSummer && itemWinter && !itemSummer);
    const sharedTokens = normTokens.filter((token) => itemText.includes(token));
    const compatible = !seasonConflict && (Boolean(sharedKind) || sharedTokens.length >= 2);
    if (!compatible && !includeOther) return [];

    const reasons: string[] = [];
    let score = compatible ? 10 : 0;
    if (sharedKind) {
      score += 100;
      reasons.push(sharedKind.label);
    }
    if (normWinter && itemWinter) {
      score += 60;
      reasons.push("Зимнее исполнение");
    } else if (normSummer && itemSummer) {
      score += 60;
      reasons.push("Летнее исполнение");
    }
    if (sharedTokens.length) {
      score += Math.min(sharedTokens.length, 5) * 8;
      reasons.push("Совпадают характеристики");
    }
    if (seasonConflict) {
      score -= 100;
      reasons.push("Сезонность не совпадает");
    }
    if (!compatible) reasons.push("Требует ручной проверки");

    return [{ item, reasons: [...new Set(reasons)], score }];
  }).sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name, "ru"))
    .slice(0, limit);
}
