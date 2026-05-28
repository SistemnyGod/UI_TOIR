import { SectionTabs } from "../ui";
import type { ScheduleMode } from "../../types";

interface ScheduleToolbarProps {
  anchorDate: string;
  canManage?: boolean;
  mode: ScheduleMode;
  shiftFilter: "all" | "day" | "night";
  plannedCount: number;
  exceptionCount: number;
  onAnchorDateChange: (value: string) => void;
  onModeChange: (mode: ScheduleMode) => void;
  onNotify: (message: string) => void;
  onShiftFilterChange: (value: "all" | "day" | "night") => void;
}

export function ScheduleToolbar({
  anchorDate,
  canManage = true,
  mode,
  shiftFilter,
  plannedCount,
  exceptionCount,
  onAnchorDateChange,
  onModeChange,
  onNotify,
  onShiftFilterChange,
}: ScheduleToolbarProps) {
  return (
    <div className="planning-toolbar">
      <SectionTabs
        value={mode}
        onChange={onModeChange}
        tabs={[
          { id: "week", label: "Неделя", count: plannedCount },
          { id: "month", label: "Месяц", count: formatMonth(anchorDate) },
          { id: "exceptions", label: "Исключения", count: exceptionCount },
        ]}
      />
      <div className="toolbar-actions">
        <label className="toolbar-field">
          Дата
          <input
            disabled={!canManage}
            onChange={(event) => onAnchorDateChange(event.currentTarget.value)}
            type="date"
            value={anchorDate}
          />
        </label>
        <label className="toolbar-field">
          Смена
          <select
            disabled={!canManage}
            onChange={(event) => onShiftFilterChange(event.currentTarget.value as "all" | "day" | "night")}
            value={shiftFilter}
          >
            <option value="all">Все смены</option>
            <option value="day">Дневная</option>
            <option value="night">Ночная</option>
          </select>
        </label>
        <button className="button ghost" onClick={() => onModeChange("exceptions")} type="button">
          Корректировки
        </button>
        <button
          className="button primary"
          disabled={!canManage}
          onClick={() => onNotify("Выберите ячейку расписания и сохраните заявку на обход")}
          type="button"
        >
          Создать обход
        </button>
      </div>
    </div>
  );
}

function formatMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}
