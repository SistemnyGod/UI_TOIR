import { Search, Star, X } from 'lucide-react';
import type { EmuShiftReportCategory, EmuShiftType } from '../../../../api/emuShiftReportContracts';
import { FilterBar } from '../../../../shared/ui';
import { ShiftReportDateRangePicker } from './ShiftReportDateRangePicker';

export function ShiftReportHistoryFilters({
  dateFrom,
  dateTo,
  shiftType,
  category,
  search,
  favoriteOnly,
  onDateRangeChange,
  onPresetChange,
  onShiftChange,
  onCategoryChange,
  onSearchChange,
  onFavoriteOnlyChange,
  onReset,
}: {
  dateFrom: string;
  dateTo: string;
  shiftType: EmuShiftType | '';
  category: EmuShiftReportCategory | '';
  search: string;
  favoriteOnly: boolean;
  onDateRangeChange: (dateFrom: string, dateTo: string) => void;
  onPresetChange: (days: 1 | 7 | 30) => void;
  onShiftChange: (value: EmuShiftType | '') => void;
  onCategoryChange: (value: EmuShiftReportCategory | '') => void;
  onSearchChange: (value: string) => void;
  onFavoriteOnlyChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const hasAdditionalFilters = Boolean(shiftType || category || search.trim() || favoriteOnly);
  return (
    <FilterBar ariaLabel='Фильтры истории' className='emu-shift-card emu-history-filters'>
      <div className='emu-history-period'>
        <ShiftReportDateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={onDateRangeChange} />
        <div className='emu-history-presets' aria-label='Быстрый выбор периода'>
          <button type='button' onClick={() => onPresetChange(1)}>Сегодня</button>
          <button type='button' onClick={() => onPresetChange(7)}>7 дней</button>
          <button type='button' onClick={() => onPresetChange(30)}>30 дней</button>
        </div>
      </div>

      <div className='emu-history-main-filters'>
        <label>Смена<select value={shiftType} onChange={(event) => onShiftChange(event.target.value as EmuShiftType | '')}><option value=''>Все смены</option><option value='day'>Дневная</option><option value='night'>Ночная</option></select></label>
        <label>Профессия<select value={category} onChange={(event) => onCategoryChange(event.target.value as EmuShiftReportCategory | '')}><option value=''>Все профессии</option><option value='mechanic'>Слесари</option><option value='electrician'>Электрики</option></select></label>
        <label className='search'>Поиск<span className='emu-search-control'><Search aria-hidden='true' size={15} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder='Сотрудник, работа, участок' />{search ? <button type='button' aria-label='Очистить поиск истории' onClick={() => onSearchChange('')}><X aria-hidden='true' size={14} /></button> : null}</span></label>
        <label className='emu-history-favorite-filter'><input type='checkbox' checked={favoriteOnly} onChange={(event) => onFavoriteOnlyChange(event.target.checked)} /><Star aria-hidden='true' size={14} fill={favoriteOnly ? 'currentColor' : 'none'} />Только избранные</label>
        {hasAdditionalFilters ? <button type='button' className='emu-history-reset-button' onClick={onReset}>Сбросить фильтры</button> : null}
      </div>
    </FilterBar>
  );
}
