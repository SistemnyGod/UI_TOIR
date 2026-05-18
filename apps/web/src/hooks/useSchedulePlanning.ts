import { useMemo } from "react";
import { scheduleCellsFallback, weekDaysFallback } from "../repositories/scheduleRepository";
import type { ScheduleCell } from "../types";

function isPlannedCell(cell: ScheduleCell) {
  return cell.state === "planned" || cell.state === "alternate";
}

function isExceptionCell(cell: ScheduleCell) {
  return cell.state === "transfer" || cell.state === "vacation" || cell.state === "sick";
}

export function useSchedulePlanning(selectedCellId: string) {
  const scheduleCells = scheduleCellsFallback;
  const weekDays = weekDaysFallback;

  return useMemo(() => {
    const selected = scheduleCells.find((cell) => cell.id === selectedCellId);
    const plannedCount = scheduleCells.filter(isPlannedCell).length;
    const exceptionCount = scheduleCells.filter(isExceptionCell).length;

    return {
      scheduleCells,
      weekDays,
      selected,
      plannedCount,
      exceptionCount,
    };
  }, [scheduleCells, selectedCellId, weekDays]);
}
