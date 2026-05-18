import { PlanningSummaryCards } from "../components/schedule/PlanningSummaryCards";
import { ScheduleEditPanel } from "../components/schedule/ScheduleEditPanel";
import { ScheduleGridPanel } from "../components/schedule/ScheduleGridPanel";
import { ScheduleSidePanels } from "../components/schedule/ScheduleSidePanels";
import { ScheduleToolbar } from "../components/schedule/ScheduleToolbar";
import { useSchedulePlanning } from "../hooks/useSchedulePlanning";
import type { ScheduleMode } from "../types";

export function ScheduleScreen({
  mode,
  onModeChange,
  onNotify,
  selectedCellId,
  onSelectCell,
}: {
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
  onNotify: (message: string) => void;
  selectedCellId: string;
  onSelectCell: (id: string) => void;
}) {
  const { scheduleCells, weekDays, selected, plannedCount, exceptionCount } = useSchedulePlanning(selectedCellId);

  return (
    <div className="screen-stack">
      <ScheduleToolbar
        mode={mode}
        plannedCount={plannedCount}
        exceptionCount={exceptionCount}
        onModeChange={onModeChange}
        onNotify={onNotify}
      />

      <PlanningSummaryCards
        plannedCount={plannedCount}
        exceptionCount={exceptionCount}
        onModeChange={onModeChange}
      />

      <div className="two-column wide-left">
        <ScheduleGridPanel
          mode={mode}
          scheduleCells={scheduleCells}
          weekDays={weekDays}
          selectedCellId={selectedCellId}
          onSelectCell={onSelectCell}
          onNotify={onNotify}
        />

        <ScheduleSidePanels
          exceptionCount={exceptionCount}
          onShowExceptions={() => onModeChange("exceptions")}
          onNotify={onNotify}
        />

        <ScheduleEditPanel selected={selected} onNotify={onNotify} />
      </div>
    </div>
  );
}
