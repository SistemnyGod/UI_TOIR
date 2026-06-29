import type {
  EmuDecisionDto,
  EmuEmployeeShiftSummaryDto,
  EmuReferenceDto,
  EmuWorkSessionDto,
  EmuWorkSessionEmployeeDto,
} from "../../../api/contracts";
import type { EmuWorkspace } from "../../../hooks/useEmuWorkspace";
import { normalizeEmuText, type EmuEmployeeWorkloadStatus } from "../../../domain/emuWorkBoard";
import type {
  EmuCreateWorkDraft,
  EmuEmployeeOption,
  EmuWorkAccountingPreferences,
  EmployeeWorkState,
  WorkCardFilter,
  WorkCardState,
  WorkDensity,
} from "./types";

export function activeSections(workspace: EmuWorkspace) {
  return workspace.settings.sections.filter((section) => section.isActive);
}

export function getSystemOtherSection(workspace: EmuWorkspace) {
  return activeSections(workspace).find((section) => isSystemOtherSection(section));
}

export function isSystemOtherSection(item: EmuReferenceDto) {
  return item.code === "prochee" || item.name.trim().toLowerCase() === "прочее";
}

export function filterEmployees(employees: EmuEmployeeOption[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return employees;
  return employees.filter((employee) =>
    [employee.fullName, employee.position, employee.department, employee.personnelNo].some((value) => value.toLowerCase().includes(query)),
  );
}

export function getEmployeeWorkState(employeeId: string, sessions: EmuWorkSessionDto[], currentWorkId = ""): EmployeeWorkState {
  for (const session of sessions) {
    if (session.id === currentWorkId || session.deletedAt || session.completedAt) continue;
    const employee = session.employees.find((item) => item.employeeId === employeeId && !item.finishedAt);
    if (!employee) continue;
    const status = activeEmployeeStatus(employee);
    if (status === "Работает") return "Работает";
    if (status === "На другой работе") return "На другой работе";
    if (status === "В ожидании") return "В ожидании";
    return "На паузе";
  }

  return "Свободен";
}

export function selectedConflicts(employeeIds: string[], sessions: EmuWorkSessionDto[], currentWorkId = "") {
  return employeeIds
    .map((employeeId) => {
      const session = sessions.find((item) =>
        item.id !== currentWorkId &&
        !item.deletedAt &&
        !item.completedAt &&
        item.employees.some((employee) => employee.employeeId === employeeId && !employee.finishedAt && activeEmployeeStatus(employee) === "Работает"),
      );
      return session?.employees.find((employee) => employee.employeeId === employeeId)?.fullNameSnapshot ?? "";
    })
    .filter(Boolean);
}

export function isVisibleOnDailyBoard(work: EmuWorkSessionDto) {
  const status = normalizeEmuText(work.operationalStatus || work.status);
  if (work.deletedAt || status === "Удалено") return false;
  return !work.completedAt && status !== "Завершено" && status !== "Выполнено";
}

export function isEmuWorkAccountingPreferences(value: unknown): value is EmuWorkAccountingPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EmuWorkAccountingPreferences>;
  return (
    Array.isArray(candidate.collapsedSections) &&
    candidate.collapsedSections.every((item) => typeof item === "string") &&
    isWorkDensity(candidate.density) &&
    typeof candidate.sectionFilter === "string" &&
    isWorkCardFilter(candidate.workFilter)
  );
}

export function isEmuCreateWorkDraft(value: unknown): value is EmuCreateWorkDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EmuCreateWorkDraft>;
  return (
    Array.isArray(candidate.employeeIds) &&
    candidate.employeeIds.every((item) => typeof item === "string") &&
    typeof candidate.sectionId === "string" &&
    typeof candidate.taskDescription === "string" &&
    typeof candidate.time === "string" &&
    typeof candidate.workDate === "string"
  );
}

export function isWorkDensity(value: unknown): value is WorkDensity {
  return value === "compact" || value === "comfortable";
}

export function isWorkCardFilter(value: unknown): value is WorkCardFilter {
  return value === "all" || value === "working" || value === "mixed" || value === "paused" || value === "attention";
}

export function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hasOpenEmployees(work: EmuWorkSessionDto) {
  return work.employees.some((employee) => !employee.finishedAt);
}

export function hasWorkingEmployees(work: EmuWorkSessionDto) {
  return work.employees.some((employee) => !employee.finishedAt && activeEmployeeStatus(employee) === "Работает");
}

export function hasPausedEmployees(work: EmuWorkSessionDto) {
  return work.employees.some((employee) => {
    const status = activeEmployeeStatus(employee);
    return !employee.finishedAt && status !== "Работает" && status !== "Добавлен ошибочно";
  });
}

export function resolveWorkCardState(work: EmuWorkSessionDto): WorkCardState {
  const status = normalizeEmuText(work.operationalStatus || work.status);
  if (status === "В ожидании") return hasWorkingEmployees(work) ? "mixed" : "paused";
  if (hasWorkingEmployees(work) && hasPausedEmployees(work)) return "mixed";
  if (hasPausedEmployees(work)) return "paused";
  if (hasWorkingEmployees(work)) return "working";
  if (work.isCarriedOver || hasOpenEmployees(work)) return "attention";
  return "working";
}

export function buildWorkFilterCounts(work: EmuWorkSessionDto[]): Record<WorkCardFilter, number> {
  return work.reduce<Record<WorkCardFilter, number>>(
    (counts, item) => {
      counts.all += 1;
      counts[resolveWorkCardState(item)] += 1;
      return counts;
    },
    { all: 0, attention: 0, mixed: 0, paused: 0, working: 0 },
  );
}

export function buildBoardSections(work: EmuWorkSessionDto[]) {
  const sections: Array<{ hint: string; items: EmuWorkSessionDto[]; state: WorkCardState; title: string }> = [
    { hint: "сотрудники сейчас выполняют работу", items: [], state: "working", title: "В работе" },
    { hint: "часть сотрудников работает, часть на паузе или на другой работе", items: [], state: "mixed", title: "Частично на паузе" },
    { hint: "работа ожидает продолжения", items: [], state: "paused", title: "На паузе" },
    { hint: "перенос, конфликт или карточка без активных исполнителей", items: [], state: "attention", title: "Требует внимания" },
  ];
  const byState = new Map(sections.map((section) => [section.state, section]));

  for (const item of work) {
    byState.get(resolveWorkCardState(item))?.items.push(item);
  }

  return sections.filter((section) => section.items.length > 0);
}

export function collectWorkingConflicts(sessions: EmuWorkSessionDto[]) {
  const byEmployee = new Map<string, { employeeName: string; workNumbers: string[] }>();

  for (const session of sessions) {
    if (session.deletedAt || session.completedAt) continue;
    for (const employee of session.employees) {
      if (employee.finishedAt || activeEmployeeStatus(employee) !== "Работает") continue;
      const existing = byEmployee.get(employee.employeeId) ?? { employeeName: employee.fullNameSnapshot, workNumbers: [] };
      existing.workNumbers.push(session.workNumber);
      byEmployee.set(employee.employeeId, existing);
    }
  }

  return Array.from(byEmployee.values()).filter((item) => item.workNumbers.length > 1);
}

export function workFilterLabel(filter: WorkCardFilter) {
  if (filter === "mixed") return "Частично";
  if (filter === "working") return "В работе";
  if (filter === "paused") return "Пауза";
  if (filter === "attention") return "Внимание";
  return "Все";
}

export function workStateLabel(state: WorkCardState) {
  if (state === "mixed") return "Частично";
  if (state === "paused") return "Пауза";
  if (state === "attention") return "Внимание";
  return "В работе";
}

export function statusClass(status: EmployeeWorkState | string) {
  if (status === "Работает") return "emu-status-working";
  if (status === "На другой работе") return "emu-status-other";
  if (status === "В ожидании" || status === "На паузе") return "emu-status-waiting";
  if (status === "Завершил" || status === "Частично выполнено") return "emu-status-finished";
  if (status === "Добавлен ошибочно") return "emu-status-mistaken";
  return "emu-status-free";
}

export function shouldShowEmployeeState(status: EmployeeWorkState | string) {
  return statusClass(status) !== "emu-status-free";
}

export function employeeStatusLabel(status: EmployeeWorkState | string) {
  if (status === "Работает") return "Работает";
  if (status === "На другой работе") return "На другой работе";
  if (status === "В ожидании") return "На паузе";
  if (status === "На паузе") return "На паузе";
  if (status === "Завершил") return "Завершил";
  if (status === "Частично выполнено") return "Частично выполнено";
  if (status === "Добавлен ошибочно") return "Добавлен ошибочно";
  return status;
}

export function activeEmployeeStatus(employee: EmuWorkSessionEmployeeDto): EmployeeWorkState | string {
  return normalizeEmuText(employee.participationStatus || employee.status);
}

export function employeeWorkloadLabel(status: EmuEmployeeWorkloadStatus | "all") {
  if (status === "free") return "Доступные";
  if (status === "working") return "В работе";
  if (status === "waiting") return "На паузе";
  if (status === "conflict") return "Конфликт";
  return "Все";
}

export function decisionTypeLabel(decision: EmuDecisionDto) {
  if (decision.decisionType === "lunch_overlap") return "Работа пересекла обед";
  if (decision.decisionType === "employee_conflict") return "Конфликт занятости";
  if (decision.decisionType === "perco_exit_during_work") return "Выход во время работы";
  if (decision.decisionType === "perco_missing_presence_for_work") return "Нет присутствия по PERCo";
  if (decision.decisionType === "perco_lunch_exit_during_work") return "PERCo-выход в обед";
  if (decision.decisionType === "perco_absent_after_shift") return "Нет присутствия после смены";
  return "Требует решения";
}

export function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function formatEmployeeShortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const initialsValue = parts.slice(1).map((part) => `${part[0]}.`).join("");
  return `${parts[0]} ${initialsValue}`;
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatShiftSource(value: string) {
  if (value === "manual") return "Ручная корректировка";
  if (value === "perco") return "PERCo";
  return "По умолчанию";
}

export function buildShiftInsights(summary: EmuEmployeeShiftSummaryDto) {
  const plannedStart = new Date(summary.shift.plannedStartAt).getTime();
  const actualStart = new Date(summary.shift.actualStartAt).getTime();
  const actualEnd = new Date(summary.shift.actualEndAt).getTime();
  const lateMinutes = Math.max(0, Math.round((actualStart - plannedStart) / 60_000));
  const presenceMinutes = Math.max(0, Math.round((actualEnd - actualStart) / 60_000));

  return {
    lateMinutes,
    presenceMinutes,
  };
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" });
}

export function formatMinutes(value: number) {
  if (value < 60) return `${value} мин`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours} ч ${minutes} мин`;
}

export function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toTimeInput(date: Date) {
  return date.toTimeString().slice(0, 5);
}

export function toLocalIso(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}:00`).toISOString();
}

export function addDays(dateValue: string, days: number) {
  const date = parseDateInput(dateValue);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

export function mondayOf(dateValue: string) {
  const date = parseDateInput(dateValue);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return toDateInput(date);
}

export function parseDateInput(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date(`${dateValue}T00:00:00`);
  }

  return new Date(year, month - 1, day);
}
