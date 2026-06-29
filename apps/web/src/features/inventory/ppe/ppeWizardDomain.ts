import type { InventoryItemDto } from "../../../api/contracts";
import {
  getDefaultDueDate,
  getDefaultIssuePeriodText,
  itemModelDescription,
  moneyMinorToInput,
  parsePositiveQuantity,
} from "./ppeCommon";
import { isPpeSignatureStatus } from "./ppeStatusCatalog";
import type { PpeWizardLine } from "./ppeTypes";

export type PickerSelectedDraft = {
  brandModelArticle: string;
  dueAt: string;
  issuePeriodText: string;
  priceText: string;
  printItemName: string;
};

export type ManualNormDraft = {
  brandModelArticle: string;
  catalogItemId: string;
  issuePeriodText: string;
  normName: string;
  normPoint: string;
  quantityText: string;
};

export type StoredManualNorm = {
  issuePeriodText: string;
  normName: string;
  normPoint: string;
  quantityText: string;
};

const MANUAL_NORMS_STORAGE_KEY = "patrol360:inventory-ppe-manual-norms:v1";
const MODEL_SUGGESTIONS_STORAGE_KEY = "patrol360:inventory-ppe-model-suggestions:v1";

export const PPE_WIZARD_STEP_DETAILS = [
  {
    description: "Выберите сотрудника и проверьте должность, подразделение и табельный номер.",
    short: "Сотрудник",
    title: "Сотрудник",
  },
  {
    description: "Проверьте основание, дату оформления и параметры карточки.",
    short: "Параметры",
    title: "Параметры карточки",
  },
  {
    description: "Разделите норму, номенклатуру, модель и факт выдачи.",
    short: "Выдача",
    title: "Выдача и чек-лист",
  },
  {
    description: "Проверьте личную карточку и лист подписи перед печатью.",
    short: "Печать",
    title: "Печать и предпросмотр",
  },
] as const;

export function createSelectedDraft(item: InventoryItemDto): PickerSelectedDraft {
  return {
    brandModelArticle: itemModelDescription(item),
    dueAt: getDefaultDueDate(item.defaultLifeMonths),
    issuePeriodText: getDefaultIssuePeriodText(item.defaultLifeMonths),
    priceText: moneyMinorToInput(item.defaultUnitPriceMinor),
    printItemName: item.normItemName || item.name,
  };
}

export function createEmptySelectedDraft(): PickerSelectedDraft {
  return {
    brandModelArticle: "",
    dueAt: "",
    issuePeriodText: getDefaultIssuePeriodText(),
    priceText: "0",
    printItemName: "",
  };
}

export function createManualNormDraft(): ManualNormDraft {
  return {
    brandModelArticle: "",
    catalogItemId: "",
    issuePeriodText: getDefaultIssuePeriodText(),
    normName: "",
    normPoint: "",
    quantityText: "1",
  };
}

export function isPpeSectionLine(line: PpeWizardLine) {
  const normName = line.printItemName.trim();
  return Boolean(line.isSectionTitle || (normName && normName.endsWith(":")));
}

export function validatePpeIssueLine(line: PpeWizardLine) {
  const errors: string[] = [];
  const isSection = isPpeSectionLine(line);
  const isIssued = isPpeSignatureStatus(line.status);
  const normName = line.printItemName.trim();
  const quantity = parsePositiveQuantity(line.quantityText);

  if (!normName) {
    errors.push("Укажите полное наименование СИЗ по норме.");
  }

  if (isSection) {
    if (isIssued) {
      errors.push("Разделитель нормы нельзя выдать. Оставьте строку как невыданную.");
    }

    return errors;
  }

  if (!line.normPoint.trim()) {
    errors.push("Укажите пункт нормы.");
  }

  if (!line.issuePeriodText.trim()) {
    errors.push("Укажите периодичность выдачи.");
  }

  if (!line.catalogName?.trim() && !line.item.name.trim()) {
    errors.push("Выберите номенклатуру.");
  }

  if (!quantity) {
    errors.push("Укажите количество больше нуля.");
  }

  if (isIssued && !line.issuedAt) {
    errors.push("Для выданной позиции нужна дата выдачи.");
  }

  return errors;
}

export function loadManualNorms(): StoredManualNorm[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MANUAL_NORMS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function saveManualNorms(rows: StoredManualNorm[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MANUAL_NORMS_STORAGE_KEY, JSON.stringify(rows.slice(0, 20)));
}

export function loadModelSuggestions(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MODEL_SUGGESTIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((row): row is string => typeof row === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function saveModelSuggestion(value: string, existing: string[]) {
  const normalized = value.trim();
  if (!normalized || typeof window === "undefined") {
    return existing;
  }

  const next = [normalized, ...existing.filter((row) => row !== normalized)].slice(0, 50);
  window.localStorage.setItem(MODEL_SUGGESTIONS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function isPpeCatalogItem(item: InventoryItemDto) {
  if (!item.isActive) {
    return false;
  }

  const kind = item.itemKind.trim().toLowerCase();
  const category = item.category.trim().toLowerCase();
  const tracking = (item.trackingType ?? "").trim().toLowerCase();

  return (
    tracking === "ppe" ||
    kind === "ppe" ||
    kind === "siz" ||
    kind.includes("сиз") ||
    kind.includes("спец") ||
    category.includes("сиз") ||
    category.includes("спецодеж") ||
    category.includes("ppe")
  );
}

export function parsePriceText(value?: string) {
  if (!value) return 0;
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
