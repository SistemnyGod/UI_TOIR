export type HistoryView = "summary" | "employees" | "sections" | "details";

export type DisplayMode = "detailed" | "compact";

export type EmuHistoryPreferences = {
  activeView: HistoryView;
  dateFrom: string;
  dateTo: string;
  displayMode: DisplayMode;
  employeeId: string;
  employeeMonth: string;
  employeeSearch: string;
  includeDeleted: boolean;
  manualCorrectionsOnly: boolean;
  notCompletedReasonId: string;
  pageSize: number;
  problemOnly: boolean;
  sectionId: string;
  shiftType: "" | "day" | "night";
  sortBy: string;
  status: string;
  waitReasonId: string;
};

export const statusFilterOptions = [
  { label: "Завершено", value: "op:Завершено" },
  { label: "Удалено", value: "op:Удалено" },
  { label: "Выполнено", value: "result:Выполнено" },
  { label: "Частично выполнено", value: "result:Частично выполнено" },
  { label: "Не выполнено", value: "result:Не выполнено" },
  { label: "Отменено", value: "result:Отменено" },
] as const;
