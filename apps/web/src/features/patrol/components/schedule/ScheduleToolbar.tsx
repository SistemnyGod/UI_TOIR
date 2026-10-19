import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { Button, IconButton } from "../../../../shared/ui";
import type { ScheduleMode } from "../../../../types";
import { dateInput, schedulePeriodLabel, shiftSchedulePeriod, type ScheduleStatusFilter } from "./schedulePresentation";

interface ScheduleToolbarProps {
  anchorDate: string;
  canManage?: boolean;
  canCreate: boolean;
  mode: ScheduleMode;
  shiftFilter: "all" | "day" | "night";
  exceptionCount: number;
  query: string;
  statusFilter: ScheduleStatusFilter;
  favoritesOnly: boolean;
  favoriteCount: number;
  onAnchorDateChange: (value: string) => void;
  onModeChange: (mode: ScheduleMode) => void;
  onCreate: () => void;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: ScheduleStatusFilter) => void;
  onFavoritesOnlyChange: (value: boolean) => void;
  onShiftFilterChange: (value: "all" | "day" | "night") => void;
}

export function ScheduleToolbar({
  anchorDate,
  canManage = true,
  canCreate,
  mode,
  shiftFilter,
  exceptionCount,
  query, statusFilter, favoritesOnly, favoriteCount,
  onAnchorDateChange,
  onModeChange,
  onCreate, onQueryChange, onStatusFilterChange, onFavoritesOnlyChange,
  onShiftFilterChange,
}: ScheduleToolbarProps) {
  return (
    <section className="plan-toolbar" aria-label="Управление расписанием">
      <div className="plan-toolbar-main">
        <div className="plan-modes" aria-label="Вид расписания">
          {([{ value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }, { value: "exceptions", label: "Исключения" }] as const).map(tab => (
            <button aria-pressed={mode === tab.value} key={tab.value} onClick={() => onModeChange(tab.value)} type="button">
              {tab.label}{tab.value === "exceptions" && exceptionCount > 0 ? <span>{exceptionCount}</span> : null}
            </button>
          ))}
        </div>
        <div className="plan-period-nav">
          <IconButton label="Предыдущий период" onClick={() => onAnchorDateChange(shiftSchedulePeriod(anchorDate, mode, -1))}><ChevronLeft size={18} /></IconButton>
          <strong aria-live="polite">{schedulePeriodLabel(anchorDate, mode)}</strong>
          <IconButton label="Следующий период" onClick={() => onAnchorDateChange(shiftSchedulePeriod(anchorDate, mode, 1))}><ChevronRight size={18} /></IconButton>
          <Button size="sm" variant="ghost" onClick={() => onAnchorDateChange(dateInput(new Date()))}>Сегодня</Button>
        </div>
        <Button className="plan-create" disabled={!canManage || !canCreate} onClick={onCreate} variant="primary"><Plus size={17} />Создать обход</Button>
      </div>
      <div className="plan-filters">
        <label className="plan-search"><Search aria-hidden="true" size={18} />
          <input aria-label="Поиск в расписании" value={query} onChange={e => onQueryChange(e.currentTarget.value)} placeholder="Сотрудник, маршрут или участок" type="search" />
          {query ? <button aria-label="Очистить поиск" onClick={() => onQueryChange("")} type="button"><X size={16} /></button> : null}
        </label>
        <label className="plan-filter"><span>Смена</span><select aria-label="Смена" value={shiftFilter} onChange={e => onShiftFilterChange(e.currentTarget.value as ScheduleToolbarProps["shiftFilter"])}><option value="all">Все смены</option><option value="day">Дневная</option><option value="night">Ночная</option></select></label>
        <label className="plan-filter"><span>Статус</span><select aria-label="Статус" value={statusFilter} onChange={e => onStatusFilterChange(e.currentTarget.value as ScheduleStatusFilter)}><option value="all">Все статусы</option><option value="planned">Запланированные</option><option value="active">В работе</option><option value="completed">Выполненные</option><option value="cancelled">Отменённые</option></select></label>
        <label className="plan-filter"><span>Сотрудники</span><select aria-label="Сотрудники" value={favoritesOnly && favoriteCount > 0 ? "favorites" : "all"} onChange={e => onFavoritesOnlyChange(e.currentTarget.value === "favorites")}><option value="all">Все сотрудники</option><option disabled={favoriteCount === 0} value="favorites">Избранные ({favoriteCount})</option></select></label>
        <label className="plan-filter plan-date"><span><CalendarDays aria-hidden="true" size={13} />Дата</span><input aria-label="Дата расписания" type="date" value={anchorDate} onChange={e => { if (e.currentTarget.value) onAnchorDateChange(e.currentTarget.value); }} /></label>
      </div>
    </section>
  );
}
