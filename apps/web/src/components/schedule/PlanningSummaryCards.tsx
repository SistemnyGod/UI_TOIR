import type { ScheduleMode } from "../../types";

interface PlanningSummaryCardsProps {
  coveragePercent: number;
  dayCount: number;
  plannedCount: number;
  exceptionCount: number;
  nightCount: number;
  onModeChange: (mode: ScheduleMode) => void;
}

export function PlanningSummaryCards({
  coveragePercent,
  dayCount,
  plannedCount,
  exceptionCount,
  nightCount,
  onModeChange,
}: PlanningSummaryCardsProps) {
  return (
    <div className="planning-summary-grid">
      <button className="planning-summary-card day" onClick={() => onModeChange("week")} type="button">
        <span>День</span>
        <strong>{dayCount}</strong>
        <small>запланировано</small>
      </button>
      <button className="planning-summary-card night" onClick={() => onModeChange("week")} type="button">
        <span>Ночь</span>
        <strong>{nightCount}</strong>
        <small>запланировано</small>
      </button>
      <button className="planning-summary-card warning" onClick={() => onModeChange("exceptions")} type="button">
        <span>Исключения</span>
        <strong>{exceptionCount}</strong>
        <small>отпуск, больничный, перенос</small>
      </button>
      <button
        className="planning-summary-card neutral"
        onClick={() => onModeChange("week")}
        type="button"
      >
        <span>Покрытие смен</span>
        <strong>{coveragePercent}%</strong>
        <small>{plannedCount} ячеек в недельном плане</small>
      </button>
    </div>
  );
}
