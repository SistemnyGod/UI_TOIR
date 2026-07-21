import type {
  EmuEmployeeWorkHistoryReportDto,
  EmuListResponseDto,
  EmuWorkHistoryReportDto,
  EmuWorkSessionDto,
} from "../api/contracts";
import type { EmuWorkSessionParams } from "../repositories/emuRepository";
import type { EmployeeDirectoryItem } from "../types";
import { sortEmuHistoryRows } from "./emuWorkBoard";

const employeeStatusMistaken = "Добавлен ошибочно";
export function buildLocalWorkHistoryReport(rows: EmuWorkSessionDto[], params: EmuWorkSessionParams): EmuWorkHistoryReportDto {
  const participants = rows.flatMap((session) =>
    session.employees
      .filter((employee) => employee.status !== employeeStatusMistaken)
      .map((employee) => ({ employee, session })),
  );
  const problemRows = rows.filter(isLocalProblemSession);
  const employeeIds = new Set(participants.map((row) => row.employee.employeeId));
  const sectionIds = new Set(rows.map((row) => row.sectionId));

  return {
    appliedQuery: {
      allowedSectionIds: null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      employeeId: params.employeeId ?? null,
      employeeSearch: params.employeeSearch ?? null,
      includeDeleted: Boolean(params.includeDeleted),
      manualCorrectionsOnly: Boolean(params.manualCorrectionsOnly),
      notCompletedReasonId: params.notCompletedReasonId ?? null,
      operationalStatus: params.operationalStatus ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 0,
      problemOnly: Boolean(params.problemOnly),
      resultStatus: params.resultStatus ?? null,
      sectionId: params.sectionId ?? null,
      shiftType: params.shiftType ?? null,
      sortBy: params.sortBy ?? null,
      status: params.status ?? null,
      waitReasonId: params.waitReasonId ?? null,
    },
    employees: Array.from(groupBy(participants, (row) => row.employee.employeeId).entries())
      .map(([employeeId, group]) => {
        const first = group[0]?.employee;
        return {
          department: "",
          employeeId,
          employeeName: first?.fullNameSnapshot ?? "",
          otherWorkMinutes: group.reduce((sum, row) => sum + row.employee.otherWorkMinutes, 0),
          personnelNo: "",
          position: first?.positionSnapshot ?? "",
          sectionCount: new Set(group.map((row) => row.session.sectionId)).size,
          totalMinutes: group.reduce((sum, row) => sum + row.employee.workMinutes + row.employee.waitingMinutes + row.employee.otherWorkMinutes, 0),
          waitingMinutes: group.reduce((sum, row) => sum + row.employee.waitingMinutes, 0),
          workCount: new Set(group.map((row) => row.session.id)).size,
          workMinutes: group.reduce((sum, row) => sum + row.employee.workMinutes, 0),
        };
      })
      .sort((left, right) => right.totalMinutes - left.totalMinutes || left.employeeName.localeCompare(right.employeeName)),
    exceptions: problemRows.slice(0, 200).map((session) => ({
      otherWorkMinutes: session.otherWorkMinutes,
      reason: buildLocalExceptionReason(session),
      sectionId: session.sectionId,
      sectionName: session.sectionName,
      severity: session.deletedAt ? "danger" : "warning",
      waitingMinutes: session.waitingMinutes,
      workDate: session.workDate,
      workMinutes: session.workMinutes,
      workNumber: session.workNumber,
      workSessionId: session.id,
    })),
    generatedAt: new Date().toISOString(),
    sections: Array.from(groupBy(rows, (row) => row.sectionId).entries())
      .map(([sectionId, group]) => ({
        employeeCount: new Set(group.flatMap((row) => row.employees.map((employee) => employee.employeeId))).size,
        otherWorkMinutes: group.reduce((sum, row) => sum + row.otherWorkMinutes, 0),
        problemWorks: group.filter(isLocalProblemSession).length,
        sectionId,
        sectionName: group[0]?.sectionName ?? "",
        totalMinutes: group.reduce((sum, row) => sum + row.workMinutes + row.waitingMinutes + row.otherWorkMinutes, 0),
        waitingMinutes: group.reduce((sum, row) => sum + row.waitingMinutes, 0),
        workCount: group.length,
        workMinutes: group.reduce((sum, row) => sum + row.workMinutes, 0),
      }))
      .sort((left, right) => right.totalMinutes - left.totalMinutes || left.sectionName.localeCompare(right.sectionName)),
    totals: {
      averageWorkMinutes: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.workMinutes + row.waitingMinutes + row.otherWorkMinutes, 0) / rows.length) : 0,
      completedWorks: rows.filter((row) => !row.deletedAt && row.completedAt).length,
      deletedWorks: rows.filter((row) => row.deletedAt).length,
      employeeCount: employeeIds.size,
      otherWorkMinutes: rows.reduce((sum, row) => sum + row.otherWorkMinutes, 0),
      problemWorks: problemRows.length,
      sectionCount: sectionIds.size,
      totalMinutes: rows.reduce((sum, row) => sum + row.workMinutes + row.waitingMinutes + row.otherWorkMinutes, 0),
      totalWorks: rows.length,
      waitingMinutes: rows.reduce((sum, row) => sum + row.waitingMinutes, 0),
      workMinutes: rows.reduce((sum, row) => sum + row.workMinutes, 0),
    },
  };
}

export function buildLocalEmployeeWorkHistoryReport(
  employeeId: string,
  rows: EmuWorkSessionDto[],
  params: EmuWorkSessionParams,
  employeeDirectory: EmployeeDirectoryItem[],
): EmuEmployeeWorkHistoryReportDto {
  const report = buildLocalWorkHistoryReport(rows, { ...params, employeeId });
  const employee = report.employees.find((row) => row.employeeId === employeeId);
  const directoryEmployee = employeeDirectory.find((row) => row.id === employeeId);
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? Math.max(1, rows.length);
  return {
    appliedQuery: report.appliedQuery,
    employee: employee ?? {
      department: directoryEmployee?.department ?? "",
      employeeId,
      employeeName: directoryEmployee?.fullName ?? "",
      otherWorkMinutes: 0,
      personnelNo: directoryEmployee?.personnelNo ?? "",
      position: directoryEmployee?.position ?? "",
      sectionCount: 0,
      totalMinutes: 0,
      waitingMinutes: 0,
      workCount: 0,
      workMinutes: 0,
    },
    generatedAt: report.generatedAt,
    sections: report.sections,
    works: toList(rows.slice((page - 1) * pageSize, page * pageSize), rows.length, page, pageSize),
  };
}

function groupBy<T, TKey>(items: T[], getKey: (item: T) => TKey) {
  const map = new Map<TKey, T[]>();
  for (const item of items) {
    const key = getKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }

  return map;
}

function isLocalProblemSession(session: EmuWorkSessionDto) {
  return Boolean(session.deletedAt) || session.isCarriedOver || session.waitingMinutes > 0 || session.otherWorkMinutes > 0 || (session.resultStatus !== "" && session.resultStatus !== "Выполнено");
}

function buildLocalExceptionReason(session: EmuWorkSessionDto) {
  const reasons: string[] = [];
  if (session.deletedAt) reasons.push("deleted");
  if (session.isCarriedOver) reasons.push("carry-over");
  if (session.waitingMinutes > 0) reasons.push("pause");
  if (session.otherWorkMinutes > 0) reasons.push("other work");
  if (session.resultStatus) reasons.push(session.resultStatus);
  return reasons.length ? reasons.join(", ") : "check";
}

export function filterLocalSessions(sessions: EmuWorkSessionDto[], params: EmuWorkSessionParams) {
  const rows = sessions
    .filter((session) => (params.includeDeleted ? true : !session.deletedAt))
    .filter((session) => (params.dateFrom ? session.workDate >= params.dateFrom : true))
    .filter((session) => (params.dateTo ? session.workDate <= params.dateTo : true))
    .filter((session) => (params.sectionId ? session.sectionId === params.sectionId : true))
    .filter((session) => (params.operationalStatus ? session.operationalStatus === params.operationalStatus : true))
    .filter((session) => (params.resultStatus ? session.resultStatus === params.resultStatus : true))
    .filter((session) => (params.status ? session.status === params.status || session.operationalStatus === params.status || session.resultStatus === params.status : true))
    .filter((session) => (params.employeeId ? session.employees.some((employee) => employee.employeeId === params.employeeId) : true))
    .filter((session) => matchesLocalEmployeeSearch(session, params.employeeSearch))
    .filter((session) => matchesLocalShiftType(session, params.shiftType))
    .filter((session) =>
      params.problemOnly
        ? session.isCarriedOver ||
          session.waitingMinutes > 0 ||
          session.otherWorkMinutes > 0 ||
          (session.resultStatus !== "" && session.resultStatus !== "Выполнено")
        : true,
    );

  return sortEmuHistoryRows(rows, params.sortBy ?? "date");
}

function matchesLocalEmployeeSearch(session: EmuWorkSessionDto, employeeSearch?: string) {
  const search = (employeeSearch ?? "").trim().toLowerCase();
  if (!search) return true;

  return session.employees.some((employee) =>
    [
      employee.fullNameSnapshot,
      employee.positionSnapshot,
      employee.employeeId,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search),
  );
}

function matchesLocalShiftType(session: EmuWorkSessionDto, shiftType?: "day" | "night" | "") {
  if (!shiftType) return true;
  const source = session.arrivedAt ?? session.completedAt ?? `${session.workDate}T09:00:00`;
  const hour = new Date(source).getHours();
  const isNight = hour >= 20 || hour < 8;
  return shiftType === "night" ? isNight : !isNight;
}

function toList<T>(rows: T[], total: number, page = 1, pageSize = 100): EmuListResponseDto<T> {
  const safePageSize = Math.max(1, pageSize);
  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / safePageSize)),
    pageSize: safePageSize,
    rows,
    total,
  };
}

