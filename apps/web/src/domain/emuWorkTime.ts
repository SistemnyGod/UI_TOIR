import type { EmuWorkParticipationIntervalDto, EmuWorkSessionDto, EmuWorkSessionEmployeeDto } from "../api/contracts";

export interface EmuLiveEmployeeMinutes {
  employeeId: string;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  personalWorkMinutes: number;
  personalPauseMinutes: number;
}

export interface EmuLiveWorkSessionMinutes {
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  employeesById: Map<string, EmuLiveEmployeeMinutes>;
}

export function calculateLiveWorkSessionMinutes(work: EmuWorkSessionDto, now = new Date()): EmuLiveWorkSessionMinutes {
  const employeesById = new Map<string, EmuLiveEmployeeMinutes>();
  const workingRanges: Array<[number, number]> = [];
  let legacyWorkMinutes = 0;
  let waitingMinutes = 0;
  let otherWorkMinutes = 0;
  let hasIntervals = false;

  for (const employee of work.employees) {
    const minutes = calculateLiveEmployeeMinutes(work, employee, now);
    employeesById.set(employee.employeeId, minutes);
    legacyWorkMinutes += minutes.workMinutes;
    waitingMinutes += minutes.waitingMinutes;
    otherWorkMinutes += minutes.otherWorkMinutes;

    if (isMistaken(employee)) {
      continue;
    }

    const intervals = employee.intervals ?? [];
    if (intervals.length > 0) {
      hasIntervals = true;
    }

    for (const interval of intervals) {
      if (!isWorkingStatus(interval.status)) {
        continue;
      }

      const startedAt = parseDate(interval.startedAt);
      const endedAt = interval.endedAt ? parseDate(interval.endedAt) : now;
      if (!startedAt || !endedAt) {
        continue;
      }

      workingRanges.push([startedAt.getTime(), endedAt.getTime()]);
    }
  }

  const workMinutes = hasIntervals ? calculateMergedMinutes(workingRanges) : legacyWorkMinutes;
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
    personalPauseMinutes: employee.personalPauseMinutes ?? employee.waitingMinutes + employee.otherWorkMinutes,
    personalWorkMinutes: employee.personalWorkMinutes ?? employee.workMinutes,
    waitingMinutes: employee.waitingMinutes,
    workMinutes: employee.workMinutes,
  };

  if (isMistaken(employee)) {
    return {
      ...stored,
      otherWorkMinutes: 0,
      personalPauseMinutes: 0,
      personalWorkMinutes: 0,
      waitingMinutes: 0,
      workMinutes: 0,
    };
  }

  const intervals = employee.intervals ?? [];
  if (intervals.length > 0) {
    const workMinutes = calculateIntervalMinutes(intervals, now, isWorkingStatus);
    const pauseMinutes = calculateIntervalMinutes(intervals, now, isPausedStatus);
    return {
      ...stored,
      personalPauseMinutes: pauseMinutes,
      personalWorkMinutes: workMinutes,
      waitingMinutes: pauseMinutes,
      workMinutes,
    };
  }

  if (work.completedAt || employee.finishedAt) {
    return stored;
  }

  const arrivedAt = parseDate(employee.arrivedAt);
  if (!arrivedAt) {
    return stored;
  }

  const elapsedMinutes = diffRoundedMinutes(arrivedAt, now);
  const storedPausedMinutes = employee.waitingMinutes + employee.otherWorkMinutes;

  const status = activeEmployeeStatus(employee);
  if (isWorkingStatus(status)) {
    const workMinutes = Math.max(employee.workMinutes, elapsedMinutes - storedPausedMinutes);
    return {
      ...stored,
      personalWorkMinutes: workMinutes,
      workMinutes,
    };
  }

  const pausedDelta = Math.max(0, elapsedMinutes - employee.workMinutes - storedPausedMinutes);
  if (isOtherWorkStatus(status)) {
    return {
      ...stored,
      otherWorkMinutes: employee.otherWorkMinutes + pausedDelta,
      personalPauseMinutes: stored.personalPauseMinutes + pausedDelta,
    };
  }

  return {
    ...stored,
    personalPauseMinutes: stored.personalPauseMinutes + pausedDelta,
    waitingMinutes: employee.waitingMinutes + pausedDelta,
  };
}

function calculateIntervalMinutes(
  intervals: EmuWorkParticipationIntervalDto[],
  now: Date,
  predicate: (status: string) => boolean,
) {
  return intervals
    .filter((interval) => predicate(interval.status))
    .reduce((total, interval) => {
      const startedAt = parseDate(interval.startedAt);
      const endedAt = interval.endedAt ? parseDate(interval.endedAt) : now;
      if (!startedAt || !endedAt) {
        return total;
      }

      return total + diffRoundedMinutes(startedAt, endedAt);
    }, 0);
}

function calculateMergedMinutes(ranges: Array<[number, number]>) {
  const normalized = ranges
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)] as [number, number])
    .filter(([start, end]) => end > start)
    .sort(([left], [right]) => left - right);

  let totalMs = 0;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  for (const [start, end] of normalized) {
    if (currentStart === null || currentEnd === null) {
      currentStart = start;
      currentEnd = end;
      continue;
    }

    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
      continue;
    }

    totalMs += currentEnd - currentStart;
    currentStart = start;
    currentEnd = end;
  }

  if (currentStart !== null && currentEnd !== null) {
    totalMs += currentEnd - currentStart;
  }

  return Math.max(0, Math.round(totalMs / 60_000));
}

function isWorkingStatus(status: string) {
  return status === "Работает" || status === "В работе";
}

function isPausedStatus(status: string) {
  return status === "На паузе" || status === "В ожидании" || isOtherWorkStatus(status);
}

function isOtherWorkStatus(status: string) {
  return status === "На другой работе";
}

function isMistaken(employee: EmuWorkSessionEmployeeDto) {
  return employee.status === "Добавлен ошибочно" || activeEmployeeStatus(employee) === "Добавлен ошибочно";
}

function activeEmployeeStatus(employee: EmuWorkSessionEmployeeDto) {
  return employee.participationStatus?.trim() ? employee.participationStatus : employee.status;
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffRoundedMinutes(from: Date, to: Date) {
  if (Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}
