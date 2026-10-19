import type { EmuPlanTaskDto } from "../../../../api/contracts";
import { parseDateInput, toDateInput } from "../workAccountingUtils";

export const planColumns = [
  { id: "draft", title: "Черновик / отклонено" },
  { id: "approved", title: "Согласовано" },
  { id: "active", title: "В работе" },
  { id: "done", title: "Закрыто" },
] as const;
export type PlanColumn = typeof planColumns[number]["id"];

export function planColumn(task: EmuPlanTaskDto): PlanColumn {
  if (task.status === "В работе") return "active";
  if (task.status !== "Запланировано") return "done";
  return task.approvalStatus === "Согласовано" ? "approved" : "draft";
}
export function shiftPlanWeek(start: string, weeks: number) {
  const date = parseDateInput(start); date.setDate(date.getDate() + weeks * 7);
  return toDateInput(date);
}
export function tasksInWeek(tasks: EmuPlanTaskDto[], start: string) {
  const end = shiftPlanWeek(start, 1);
  return tasks.filter(task => task.plannedDate >= start && task.plannedDate < end)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
export function approvalFingerprint(tasks: EmuPlanTaskDto[]) {
  return tasks.filter(task => task.approvalStatus !== "Согласовано")
    .map(task => `${task.id}:${task.rowVersion}`).sort().join("|");
}
export function snapshotPlanTask(task: EmuPlanTaskDto) {
  return { ...task, employeeIds: [...task.employeeIds] };
}
