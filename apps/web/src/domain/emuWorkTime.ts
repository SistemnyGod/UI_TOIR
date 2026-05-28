import type { EmuWorkSessionDto, EmuWorkSessionEmployeeDto } from "../api/contracts";

export interface EmuLiveEmployeeMinutes {
  employeeId: string;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
}

export interface EmuLiveWorkSessionMinutes {
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  employeesById: Map<string, EmuLiveEmployeeMinutes>;
}

export function calculateLiveWorkSessionMinutes(work: EmuWorkSessionDto, now = new Date()): EmuLiveWorkSessionMinutes {
  const employeesById = new Map<string, EmuLiveEmployeeMinutes>();
  let workMinutes = 0;
  let waitingMinutes = 0;
  let otherWorkMinutes = 0;

  for (const employee of work.employees) {
    const minutes = calculateLiveEmployeeMinutes(work, employee, now);
    employeesById.set(employee.employeeId, minutes);
    workMinutes += minutes.workMinutes;
    waitingMinutes += minutes.waitingMinutes;
    otherWorkMinutes += minutes.otherWorkMinutes;
  }

  return { employeesById, otherWorkMinutes, waitingMinutes, workMinutes };
}

export function calculateLiveEmployeeMinutes(
  work: EmuWorkSessionDto,
  employee: EmuWorkSessionEmployeeDto,
  now = new Date(),
): EmuLiveEmployeeMinutes {
  const stored = {
    employeeId: employee.employeeId,
    otherWorkMinutes: employee.otherWorkMinutes,
    waitingMinutes: employee.waitingMinutes,
    workMinutes: employee.workMinutes,
  };

  if (work.completedAt || employee.finishedAt) {
    return stored;
  }

  const arrivedAt = parseDate(employee.arrivedAt);
  if (!arrivedAt) {
    return stored;
  }

  const elapsedMinutes = diffRoundedMinutes(arrivedAt, now);
  const storedPausedMinutes = employee.waitingMinutes + employee.otherWorkMinutes;

  if (employee.status === "Работает") {
    return {
      ...stored,
      workMinutes: Math.max(employee.workMinutes, elapsedMinutes - storedPausedMinutes),
    };
  }

  const pausedDelta = Math.max(0, elapsedMinutes - employee.workMinutes - storedPausedMinutes);
  if (employee.status === "На другой работе") {
    return {
      ...stored,
      otherWorkMinutes: employee.otherWorkMinutes + pausedDelta,
    };
  }

  return {
    ...stored,
    waitingMinutes: employee.waitingMinutes + pausedDelta,
  };
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffRoundedMinutes(from: Date, to: Date) {
  if (Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}
