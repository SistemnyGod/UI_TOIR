import type { ScheduleMode } from "../../types";

interface PlanningSummaryCardsProps {
  plannedCount: number;
  exceptionCount: number;
  onModeChange: (mode: ScheduleMode) => void;
}

export function PlanningSummaryCards({
  plannedCount,
  exceptionCount,
  onModeChange,
}: PlanningSummaryCardsProps) {
  const coveragePercent = plannedCount > 0
    ? Math.max(0, Math.round(((plannedCount - exceptionCount) / plannedCount) * 100))
    : 0;

  return (
    <div className="planning-summary-grid">
      <button className="planning-summary-card day" onClick={() => onModeChange("week")} type="button">
        <span>День</span>
        <strong>{plannedCount}</strong>
        <small>запланировано</small>
      </button>
      <button className="planning-summary-card night" onClick={() => onModeChange("week")} type="button">
        <span>Ночь</span>
        <strong>0</strong>
        <small>ожидает правил</small>
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
        <small>по локальному плану</small>
      </button>
    </div>
  );
}
