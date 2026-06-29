import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardDto,
  InventoryPpeCardLineDto,
  InventoryPositionNormDto,
} from "../../../api/contracts";
import { INVENTORY_PPE_STATUS_LABELS, defaultIssuePeriodText } from "./ppeStatusCatalog";
import type { ApiFile, PickerLineInput, PpeCardCounts, PpeEmployeeCardDetails, PpeWizardState, PrintData, PrintLine } from "./ppeTypes";
import {
  escapeHtml,
  formatDate,
  formatMoney,
  formatQuantity,
  getInitials,
  moneyMinorToInput,
  parsePositiveQuantity,
  saveApiFile,
} from "./ppeFormatters";
import {
  getDefaultDueDate,
  getDefaultIssuePeriodText,
  isConsumableLine,
  isPpeSignatureLineStatus,
  itemModelDescription,
  printDataFromDetail,
  printDataFromWizard,
  toItemFromNorm,
  toItemFromPpeLine,
  toLineFromNorm,
} from "./ppePrintMapping";

export {
  escapeHtml,
  formatDate,
  formatMoney,
  formatQuantity,
  getInitials,
  moneyMinorToInput,
  parsePositiveQuantity,
  saveApiFile,
  getDefaultDueDate,
  getDefaultIssuePeriodText,
  isConsumableLine,
  isPpeSignatureLineStatus,
  itemModelDescription,
  printDataFromDetail,
  printDataFromWizard,
  toItemFromNorm,
  toItemFromPpeLine,
  toLineFromNorm,
};

const PPE_EMPLOYEE_PRINT_DETAIL_FIELDS = [
  ["gender", "Пол"],
  ["height", "Рост"],
  ["clothingSize", "Размер одежды"],
  ["shoeSize", "Размер обуви"],
  ["headSize", "Размер головного убора"],
  ["respiratorSize", "СИЗОД"],
  ["handProtectionSize", "СИЗ рук"],
] as const;

export function PpeKpi({
  label,
  tone = "blue",
  value,
}: {
  label: string;
  tone?: "blue" | "green" | "red" | "slate";
  value: number | string;
}) {
  return (
    <article className={`inventory-ppe-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function PpeStatus({ status }: { status: string }) {
  return <span className={`inventory-ppe-status ${status}`}>{statusLabel(status)}</span>;
}

export function PpeState({
  kind,
  text,
  title,
}: {
  kind: "empty" | "error" | "loading";
  text: string;
  title: string;
}) {
  return (
    <div className={`inventory-ppe-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <Meta label={label} value={value} />;
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="inventory-ppe-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function statusLabel(status?: string | null) {
  if (!status) return "Не указан";
  return INVENTORY_PPE_STATUS_LABELS[status] ?? status;
}

export function employeeStatusLabel(status: string) {
  if (status === "archived") return "Архив";
  if (status === "inactive") return "Неактивен";
  return "Активен";
}

export function validatePpeEmployeePrintDetails(details?: PpeEmployeeCardDetails | null) {
  return PPE_EMPLOYEE_PRINT_DETAIL_FIELDS.flatMap(([field, label]) => {
    const value = details?.[field];
    return value?.trim() ? [] : [`Заполните поле "${label}" в данных сотрудника.`];
  });
}

export function getPpeCardCounts(rows: InventoryPpeCardDto[]): PpeCardCounts {
  return rows.reduce<PpeCardCounts>(
    (accumulator, row) => ({
      active: accumulator.active + (row.status === "active" ? 1 : 0),
      amount: accumulator.amount + (row.amountMinor ?? 0),
      closed: accumulator.closed + (row.status === "returned" || row.status === "written_off" ? 1 : 0),
      issued: accumulator.issued + row.linesCount,
      problem:
        accumulator.problem +
        (row.status === "warning" || row.status === "overdue" || (row.zeroPriceLines ?? 0) > 0 ? 1 : 0),
      total: accumulator.total + 1,
      zeroPrice: accumulator.zeroPrice + (row.zeroPriceLines ?? 0),
    }),
    { active: 0, amount: 0, closed: 0, issued: 0, problem: 0, total: 0, zeroPrice: 0 },
  );
}

