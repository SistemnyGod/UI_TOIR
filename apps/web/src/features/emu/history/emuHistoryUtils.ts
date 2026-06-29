import type { EmuAuditEventDto, EmuWorkSessionDto } from "../../../api/contracts";
import { normalizeEmuText } from "../../../domain/emuWorkBoard";

export function formatMinutes(value: number) {
  const safe = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

export function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" });
}

export function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "Э") + (parts[1]?.[0] ?? "");
}

export function operationalStatus(work: EmuWorkSessionDto) {
  return normalizeEmuText(work.operationalStatus || (work.deletedAt ? "Удалено" : work.completedAt ? "Завершено" : work.status));
}

export function formatScopedEmployees(work: EmuWorkSessionDto, employeeId: string) {
  const employees = employeeId ? work.employees.filter((employee) => employee.employeeId === employeeId) : work.employees;
  return employees.map((employee) => employee.fullNameSnapshot).join(", ");
}

export function auditEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    arrived_at_changed: "Корректировка времени прихода",
    carried_over: "Перенос на следующие сутки",
    completed: "Завершение работы",
    completed_at_changed: "Корректировка времени окончания",
    created: "Создание карточки",
    deleted: "Удаление карточки",
    employee_added: "Добавлен сотрудник",
    employee_finished: "Завершено участие сотрудника",
    employees_changed: "Изменение сотрудников",
    marked_mistaken: "Сотрудник добавлен ошибочно",
    other_work: "На другой работе",
    paused: "Пауза",
    resumed: "Продолжение работы",
    section_changed: "Изменение участка",
    task_changed: "Изменение задачи",
    updated: "Изменение карточки",
    work_date_changed: "Корректировка рабочей даты",
  };
  return labels[eventType] ?? eventType;
}

export function auditEventClass(eventType: string) {
  if (eventType === "deleted" || eventType === "marked_mistaken") return "audit-danger";
  if (eventType.includes("changed") || eventType.includes("adjusted")) return "audit-manual";
  return "";
}

export function formatStatusChange(event: EmuAuditEventDto) {
  return [normalizeEmuText(event.fromStatus), normalizeEmuText(event.toStatus)].filter(Boolean).join(" -> ") || "-";
}
