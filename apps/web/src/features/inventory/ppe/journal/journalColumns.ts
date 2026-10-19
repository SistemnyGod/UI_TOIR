export const journalColumnNames = {
  department: "Подразделение",
  date: "Дата выдачи",
  status: "Статус документа",
  quantity: "Кол-во позиций",
  total: "Стоимость",
};
export type JournalColumn = keyof typeof journalColumnNames;
const defaults: JournalColumn[] = ["department", "date", "status", "quantity"];

export function readJournalColumns(userId: string): JournalColumn[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`ppe.journal.columns.${userId}`) ?? "null");
    if (!Array.isArray(value)) return [...defaults];
    return [...new Set(value.filter((item): item is JournalColumn =>
      typeof item === "string" && Object.prototype.hasOwnProperty.call(journalColumnNames, item)))];
  } catch { return [...defaults]; }
}

export function journalStatusName(status: string) {
  return status === "confirmed" ? "Выдано" : status === "draft" ? "Выдаётся" : "Отменено";
}

export function journalMoney(value: number | null) {
  return value === null ? "—" : `${(value / 100).toLocaleString("ru-RU")} ₽`;
}
