import type { EmuFavoriteEmployeeDto, EmuWorkSessionDto } from "../api/contracts";
import type { EmployeeDirectoryItem } from "../types";

export type EmuEmployeeWorkloadStatus = "free" | "working" | "waiting" | "conflict";

export type EmuEmployeeWorkload = {
  department: string;
  employeeId: string;
  fullName: string;
  personnelNo: string;
  position: string;
  sectionNames: string[];
  status: EmuEmployeeWorkloadStatus;
  workNumbers: string[];
  workSessionIds: string[];
};

export type EmuSectionWorkGroup = {
  count: number;
  items: EmuWorkSessionDto[];
  sectionId: string;
  sectionName: string;
};

const textAliases = new Map<string, string>([
  ["Работает", "Работает"],
  ["В работе", "Работает"],
  ["Работа", "Работает"],
  ["На паузе", "На паузе"],
  ["Пауза", "На паузе"],
  ["В ожидании", "В ожидании"],
  ["Ожидание", "В ожидании"],
  ["На другой работе", "На другой работе"],
  ["Завершено", "Завершено"],
  ["Выполнено", "Выполнено"],
  ["Не выполнено", "Не выполнено"],
  ["Частично выполнено", "Частично выполнено"],
  ["Удалено", "Удалено"],
  ["Прочее", "Прочее"],
]);

const workingStatuses = new Set(["Работает"]);
const pausedStatuses = new Set(["На паузе", "В ожидании", "На другой работе"]);
const mojibakeTrail = "\\u0080-\\u00BF\\u0402-\\u040F\\u0452-\\u045F\\u2013\\u2014\\u2018\\u2019\\u201A\\u201C\\u201D\\u2020\\u2021\\u2026\\u20AC\\u2116";
const mojibakePattern = new RegExp(`(?:\\u0420[${mojibakeTrail}]|\\u0421[${mojibakeTrail}]|\\u00D0|\\u00D1|\\u00C2|\\uFFFD)`);

export function normalizeEmuText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return "";

  const aliased = textAliases.get(text);
  if (aliased) return aliased;

  return mojibakePattern.test(text) ? "" : text;
}

export function filterEmuWorkBySection(rows: EmuWorkSessionDto[], sectionId: string) {
  return sectionId ? rows.filter((work) => work.sectionId === sectionId) : rows;
}

export function groupEmuWorkBySection(rows: EmuWorkSessionDto[]) {
  const bySection = new Map<string, EmuSectionWorkGroup>();

  for (const work of rows) {
    const key = work.sectionId || "section-other";
    const group = bySection.get(key) ?? {
      count: 0,
      items: [],
      sectionId: key,
      sectionName: normalizeEmuText(work.sectionName) || "Прочее",
    };
    group.items.push(work);
    group.count = group.items.length;
    if (!group.sectionName && work.sectionName) group.sectionName = normalizeEmuText(work.sectionName);
    bySection.set(key, group);
  }

  return Array.from(bySection.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort(compareWorkByCreatedAt),
    }))
    .sort((a, b) => a.sectionName.localeCompare(b.sectionName, "ru"));
}

export function buildEmuEmployeeWorkload(
  favorites: EmuFavoriteEmployeeDto[],
  workSessions: EmuWorkSessionDto[],
  employeeDirectory: Pick<EmployeeDirectoryItem, "department" | "fullName" | "id" | "personnelNo" | "position">[] = [],
  sectionId = "",
) {
  const directoryById = new Map(employeeDirectory.map((employee) => [employee.id, employee]));
  const activeSessions = filterEmuWorkBySection(workSessions, sectionId).filter((work) => !work.deletedAt && !work.completedAt);

  return favorites
    .filter((favorite) => favorite.isActive)
    .map<EmuEmployeeWorkload>((favorite) => {
      const directoryItem = directoryById.get(favorite.employeeId);
      const assignments = activeSessions
        .filter((work) => work.employees.some((employee) => employee.employeeId === favorite.employeeId && !employee.finishedAt))
        .map((work) => {
          const participant = work.employees.find((employee) => employee.employeeId === favorite.employeeId && !employee.finishedAt);
          return { participantStatus: normalizeEmuText(participant?.participationStatus || participant?.status || ""), work };
        });

      return {
        department: directoryItem?.department || favorite.department,
        employeeId: favorite.employeeId,
        fullName: directoryItem?.fullName || favorite.fullName,
        personnelNo: directoryItem?.personnelNo || favorite.personnelNo,
        position: directoryItem?.position || favorite.position,
        sectionNames: Array.from(new Set(assignments.map((assignment) => normalizeEmuText(assignment.work.sectionName) || "Прочее"))),
        status: resolveEmployeeWorkloadStatus(assignments.map((assignment) => assignment.participantStatus)),
        workNumbers: assignments.map((assignment) => assignment.work.workNumber),
        workSessionIds: assignments.map((assignment) => assignment.work.id),
      };
    })
    .sort(compareEmployeeWorkload);
}

export function filterEmuEmployeeWorkload(
  rows: EmuEmployeeWorkload[],
  query: string,
  status: EmuEmployeeWorkloadStatus | "all",
) {
  const normalized = query.trim().toLowerCase();
  return rows
    .filter((employee) => (status === "all" ? true : employee.status === status))
    .filter((employee) => {
      if (!normalized) return true;
      return [employee.fullName, employee.personnelNo, employee.position, employee.department]
        .filter(Boolean)
        .some((text) => text.toLowerCase().includes(normalized));
    });
}

export function sortEmuHistoryRows(rows: EmuWorkSessionDto[], sort: string) {
  const copy = [...rows];
  if (sort === "shift") return copy.sort((a, b) => b.workDate.localeCompare(a.workDate) || sectionName(a).localeCompare(sectionName(b), "ru") || compareCompletedDesc(a, b));
  if (sort === "section") return copy.sort((a, b) => sectionName(a).localeCompare(sectionName(b), "ru") || compareCompletedDesc(a, b));
  if (sort === "employee") return copy.sort((a, b) => firstEmployeeName(a).localeCompare(firstEmployeeName(b), "ru") || compareCompletedDesc(a, b));
  if (sort === "duration") return copy.sort((a, b) => totalMinutes(b) - totalMinutes(a) || compareCompletedDesc(a, b));
  if (sort === "waiting") return copy.sort((a, b) => b.waitingMinutes + b.otherWorkMinutes - (a.waitingMinutes + a.otherWorkMinutes) || compareCompletedDesc(a, b));
  if (sort === "result") return copy.sort((a, b) => normalizeEmuText(a.resultStatus).localeCompare(normalizeEmuText(b.resultStatus), "ru") || compareCompletedDesc(a, b));
  return copy.sort(compareCompletedDesc);
}

export function buildEmuHistoryCsv(rows: EmuWorkSessionDto[]) {
  const header = [
    "Дата",
    "Номер",
    "Участок",
    "Задача",
    "Сотрудники",
    "Приход",
    "Завершение",
    "Работа, мин",
    "Пауза, мин",
    "Прочее, мин",
    "Итого, мин",
    "Статус карточки",
    "Результат",
    "Комментарий",
  ];
  const lines = rows.map((work) =>
    [
      work.workDate,
      work.workNumber,
      normalizeEmuText(work.sectionName) || "Прочее",
      normalizeEmuText(work.taskDescription),
      work.employees.map((employee) => employee.fullNameSnapshot).join(", "),
      work.arrivedAt,
      work.completedAt ?? "",
      work.workMinutes,
      work.waitingMinutes,
      work.otherWorkMinutes,
      totalMinutes(work),
      normalizeEmuText(work.operationalStatus || work.status),
      normalizeEmuText(work.resultStatus),
      normalizeEmuText(work.resultComment),
    ].map(csvCell).join(";"),
  );

  return `\uFEFF${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`;
}

function resolveEmployeeWorkloadStatus(statuses: string[]): EmuEmployeeWorkloadStatus {
  if (statuses.length === 0) return "free";
  if (statuses.filter((status) => workingStatuses.has(status)).length > 1) return "conflict";
  if (statuses.some((status) => pausedStatuses.has(status) || (status && !workingStatuses.has(status)))) return "waiting";
  return "working";
}

function compareEmployeeWorkload(a: EmuEmployeeWorkload, b: EmuEmployeeWorkload) {
  const rank: Record<EmuEmployeeWorkloadStatus, number> = { conflict: 0, waiting: 1, working: 2, free: 3 };
  return rank[a.status] - rank[b.status] || a.fullName.localeCompare(b.fullName, "ru");
}

function compareWorkByCreatedAt(a: EmuWorkSessionDto, b: EmuWorkSessionDto) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function compareCompletedDesc(a: EmuWorkSessionDto, b: EmuWorkSessionDto) {
  return new Date(b.completedAt || b.updatedAt || b.createdAt).getTime() - new Date(a.completedAt || a.updatedAt || a.createdAt).getTime();
}

function firstEmployeeName(work: EmuWorkSessionDto) {
  return work.employees[0]?.fullNameSnapshot ?? "";
}

function sectionName(work: EmuWorkSessionDto) {
  return normalizeEmuText(work.sectionName) || "Прочее";
}

function totalMinutes(work: EmuWorkSessionDto) {
  return work.workMinutes + work.waitingMinutes + work.otherWorkMinutes;
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
