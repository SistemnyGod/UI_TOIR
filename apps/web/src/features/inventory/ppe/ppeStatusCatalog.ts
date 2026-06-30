export const PPE_STATUS = {
  active: "active",
  archived: "archived",
  closed: "closed",
  issueLater: "issue_later",
  issued: "issued",
  issuing: "issuing",
  lost: "lost",
  noStock: "no_stock",
  notIssued: "not_issued",
  overdue: "overdue",
  partial: "partial",
  reissued: "reissued",
  replacement: "replacement",
  returned: "returned",
  warning: "warning",
  writtenOff: "written_off",
} as const;

export const INVENTORY_PPE_STATUS_LABELS: Record<string, string> = {
  [PPE_STATUS.active]: "Активна",
  [PPE_STATUS.archived]: "Архив",
  [PPE_STATUS.closed]: "Закрыта",
  [PPE_STATUS.issueLater]: "Выдать позже",
  [PPE_STATUS.issued]: "Выдано",
  [PPE_STATUS.issuing]: "К выдаче",
  [PPE_STATUS.lost]: "Утеряно",
  [PPE_STATUS.noStock]: "Нет для выдачи",
  [PPE_STATUS.notIssued]: "Не выдано",
  [PPE_STATUS.overdue]: "Просрочено",
  [PPE_STATUS.partial]: "Частично",
  [PPE_STATUS.reissued]: "Переоформлено",
  [PPE_STATUS.replacement]: "Заменено аналогом",
  [PPE_STATUS.returned]: "Возвращено",
  [PPE_STATUS.warning]: "Требует внимания",
  [PPE_STATUS.writtenOff]: "Списано",
};

export const INVENTORY_PPE_MODULE_STATUSES = [
  PPE_STATUS.active,
  PPE_STATUS.archived,
  PPE_STATUS.closed,
  PPE_STATUS.issueLater,
  PPE_STATUS.issued,
  PPE_STATUS.issuing,
  PPE_STATUS.lost,
  PPE_STATUS.noStock,
  PPE_STATUS.notIssued,
  PPE_STATUS.overdue,
  PPE_STATUS.partial,
  PPE_STATUS.reissued,
  PPE_STATUS.replacement,
  PPE_STATUS.returned,
  PPE_STATUS.warning,
  PPE_STATUS.writtenOff,
] as const;

export const PPE_ISSUE_PERIOD_OPTIONS = [
  "на год",
  "1,5 года",
  "2 года",
  "2,5 года",
  "3 года",
  "до износа",
  "до окончания срока годности",
] as const;

export const PPE_ISSUE_STATUS_OPTIONS = [
  {
    value: PPE_STATUS.notIssued,
    description: "Остается в норме, но не попадает в лист подписи.",
  },
  {
    value: PPE_STATUS.issueLater,
    description: "Потребность есть, выдачу нужно выполнить позже.",
  },
  {
    value: PPE_STATUS.noStock,
    description: "Потребность есть, но подходящая позиция для выдачи сейчас не выбрана.",
  },
  {
    value: PPE_STATUS.replacement,
    description: "Выдан аналог, нормативное наименование остается прежним.",
  },
  {
    value: PPE_STATUS.issued,
    description: "Фактическая выдача попадет в лист подписи.",
  },
] as const;

export function ppeIssueStatusLabel(status: string) {
  return INVENTORY_PPE_STATUS_LABELS[status] ?? status;
}

export function ppeIssueStatusDescription(status: string) {
  return PPE_ISSUE_STATUS_OPTIONS.find((option) => option.value === status)?.description ?? "";
}

export function isPpeSignatureStatus(status: string) {
  return status === PPE_STATUS.issued || status === PPE_STATUS.replacement || status === PPE_STATUS.reissued;
}

export function defaultIssuePeriodText(lifeMonths?: number | null) {
  switch (lifeMonths) {
    case 12:
      return "на год";
    case 18:
      return "1,5 года";
    case 24:
      return "2 года";
    case 30:
      return "2,5 года";
    case 36:
      return "3 года";
    default:
      if (lifeMonths && lifeMonths >= 48 && lifeMonths % 12 === 0) {
        const years = lifeMonths / 12;
        return years >= 5 ? `${years} лет` : `${years} года`;
      }

      return "1 год";
  }
}
