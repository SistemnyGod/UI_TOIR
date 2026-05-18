import { SectionTabs } from "../ui";
import type { ScheduleMode } from "../../types";

interface ScheduleToolbarProps {
  mode: ScheduleMode;
  plannedCount: number;
  exceptionCount: number;
  onModeChange: (mode: ScheduleMode) => void;
  onNotify: (message: string) => void;
}

export function ScheduleToolbar({
  mode,
  plannedCount,
  exceptionCount,
  onModeChange,
  onNotify,
}: ScheduleToolbarProps) {
  return (
    <div className="planning-toolbar">
      <SectionTabs
        value={mode}
        onChange={onModeChange}
        tabs={[
          { id: "week", label: "Неделя", count: plannedCount },
          { id: "month", label: "Месяц", count: "май 2026" },
          { id: "exceptions", label: "Исключения", count: exceptionCount },
        ]}
      />
      <div className="toolbar-actions">
        <button className="button ghost" onClick={() => onModeChange("exceptions")} type="button">
          Корректировки
        </button>
        <button
          className="button primary"
          onClick={() => onNotify("План сохранен как локальный UI-черновик")}
          type="button"
        >
          Сохранить план
        </button>
      </div>
    </div>
  );
}
