export {
  INVENTORY_PPE_MODULE_STATUSES,
  INVENTORY_PPE_STATUS_LABELS,
  PPE_ISSUE_PERIOD_OPTIONS,
  PPE_ISSUE_STATUS_OPTIONS,
  defaultIssuePeriodText,
  isPpeSignatureStatus,
  ppeIssueStatusDescription,
  ppeIssueStatusLabel,
} from "./ppeStatusCatalog";

export const INVENTORY_PPE_WIZARD_STEPS = [
  "Сотрудник",
  "Параметры",
  "Выдача и чек-лист",
  "Печать и предпросмотр",
] as const;

export const INVENTORY_PPE_DEFAULT_NORM_TEXT =
  "Выдача предусмотрена типовыми нормами бесплатной выдачи специальной одежды, специальной обуви и других средств индивидуальной защиты, а также правилами обеспечения работников СИЗ.";
