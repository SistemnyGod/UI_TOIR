import type { EmployeeDirectoryItem } from "../../../types";

export type ModalKind =
  | "create"
  | "edit"
  | "pause"
  | "resume"
  | "complete"
  | "carryOver"
  | "addEmployee"
  | "finishEmployee"
  | "mistakenEmployee"
  | "delete"
  | "details"
  | "plan"
  | "catalogs"
  | "favorites"
  | null;

export type EmuEmployeeOption = Pick<EmployeeDirectoryItem, "department" | "fullName" | "id" | "personnelNo" | "position" | "status">;
export type EmployeeWorkState = "Работает" | "На другой работе" | "В ожидании" | "На паузе" | "Завершил" | "Частично выполнено" | "Добавлен ошибочно" | "Свободен";
export type WorkCardFilter = "all" | "working" | "mixed" | "paused" | "attention";
export type WorkCardState = "working" | "mixed" | "paused" | "attention";
export type WorkDensity = "compact" | "comfortable";
export type WorkSideSelection =
  | { kind: "employee"; employeeId: string }
  | { kind: "work"; workId: string }
  | null;

export type EmuWorkAccountingPreferences = {
  collapsedSections: string[];
  density: WorkDensity;
  sectionFilter: string;
  workFilter: WorkCardFilter;
};

export type EmuCreateWorkDraft = {
  employeeIds: string[];
  sectionId: string;
  taskDescription: string;
  time: string;
  workDate: string;
};

export const workBoardRefreshMs = 10_000;
export const planBoardRefreshMs = 30_000;
export const realtimeJitterMs = 3_000;
export const emuWorkAccountingPreferencesKey = "patrol360.emu.workAccounting.preferences.v1";
export const emuCreateWorkDraftKey = "patrol360.emu.workAccounting.createDraft.v1";
