import type { MobileEmployeeDto, MobileEmuSectionDto, WorkItemDto } from "@/domain/emu/emuTypes";

/** The fields of a "task" form draft. Nothing else may be copied from history. */
export type RepeatWorkPrefill = { employeeId: string; sectionId: string; text: string };
export type RepeatWorkDroppedField = "employee" | "section";

const historyStatuses = new Set<WorkItemDto["status"]>(["completedLocal", "completedServer", "cancelled"]);

function sourceText(item: Pick<WorkItemDto, "description" | "title">) {
  return (item.description?.trim() || item.title?.trim() || "");
}

export function canRepeatWorkItem(item: Pick<WorkItemDto, "status" | "description" | "title">) {
  return historyStatuses.has(item.status) && sourceText(item).length > 0;
}

/**
 * Builds a new create-work form from a past item. Only the description, the
 * section and one performer are copied: dates, photos, statuses, revisions and
 * server identifiers always belong to the new work. A performer or section is
 * copied only when this account may still create work for it (the server
 * rejects createWorkTask for employees not bound to the mobile account and for
 * inactive sections), otherwise the user has to choose again.
 */
export function buildRepeatWorkPrefill(
  item: Pick<WorkItemDto, "description" | "title" | "sectionId" | "employeeId" | "actualParticipants" | "assignedEmployees">,
  employees: Pick<MobileEmployeeDto, "employeeId">[],
  sections: Pick<MobileEmuSectionDto, "sectionId">[]
): { prefill: RepeatWorkPrefill; dropped: RepeatWorkDroppedField[] } {
  const allowedEmployees = new Set(employees.map(employee => employee.employeeId));
  const candidates = [
    item.employeeId,
    ...item.actualParticipants.filter(participant => participant.isCurrentMobileEmployee).map(participant => participant.employeeId),
    ...item.actualParticipants.map(participant => participant.employeeId),
    ...item.assignedEmployees.map(participant => participant.employeeId)
  ].filter((id): id is string => Boolean(id));
  const copiedEmployee = candidates.find(id => allowedEmployees.has(id));
  // Same default as a blank form: a single bound employee is preselected.
  const employeeId = copiedEmployee ?? (employees.length === 1 ? employees[0].employeeId : "");
  const sectionId = item.sectionId && sections.some(section => section.sectionId === item.sectionId) ? item.sectionId : "";
  const dropped: RepeatWorkDroppedField[] = [];
  if (!copiedEmployee && candidates.length > 0) dropped.push("employee");
  if (!sectionId && item.sectionId) dropped.push("section");
  return { prefill: { employeeId, sectionId, text: sourceText(item) }, dropped };
}

export function repeatWorkDroppedNotice(dropped: RepeatWorkDroppedField[]) {
  if (dropped.length === 0) return null;
  const parts = dropped.map(field => field === "employee" ? "исполнитель" : "участок");
  return `Недоступно для новой работы: ${parts.join(" и ")}. Выберите заново.`;
}
