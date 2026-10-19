import type { MobileEmployeeDto, MobileEmuSectionDto, WorkTaskDto } from "@/domain/emu/emuTypes";

export type WorkTab = "tasks" | "remarks";
export type TaskFilter = "active" | "history";

export type TaskModalState = { mode: "create" | "edit"; task?: WorkTaskDto; repeated?: boolean } | null;
export type RemarkAttachmentTarget = { remarkId: string; title: string } | null;
export type MediaSource = "photo" | "video" | "gallery";

/** Screen-wide busy flag and notice, shared by every form and action. */
export type WorkStatusSetters = {
  setLoading: (value: boolean) => void;
  setMessage: (value: string | null) => void;
};

export const REFRESH_FAILED_MESSAGE = "Показаны сохранённые данные. Обновление с сервера не удалось.";

export function listScope(kind: "tasks" | "remarks", contextKey: string) {
  return `local:${kind}:${contextKey}`;
}

export function defaultEmployeeId(employees: MobileEmployeeDto[]) {
  return employees.length === 1 ? employees[0].employeeId : "";
}

export function defaultSectionId(sections: MobileEmuSectionDto[]) {
  return sections[0]?.sectionId ?? "";
}
