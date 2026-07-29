import type { EmuShiftReportCategory, EmuShiftType } from '../../../../api/emuShiftReportContracts';

export function ShiftReportHistoryFilters({
  date,
  shiftType,
  category,
  search,
  onDateChange,
  onShiftChange,
  onCategoryChange,
  onSearchChange,
}: {
  date: string;
  shiftType: EmuShiftType | '';
  category: EmuShiftReportCategory | '';
  search: string;
  onDateChange: (value: string) => void;
  onShiftChange: (value: EmuShiftType | '') => void;
  onCategoryChange: (value: EmuShiftReportCategory | '') => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <section className='emu-shift-card emu-history-filters' aria-label='Фильтры истории'>
      <label>Дата<input type='date' value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
      <label>Смена<select value={shiftType} onChange={(event) => onShiftChange(event.target.value as EmuShiftType | '')}><option value=''>Все смены</option><option value='day'>Дневная</option><option value='night'>Ночная</option></select></label>
      <label>Профессия<select value={category} onChange={(event) => onCategoryChange(event.target.value as EmuShiftReportCategory | '')}><option value=''>Все профессии</option><option value='mechanic'>Слесари</option><option value='electrician'>Электрики</option></select></label>
      <label className='search'>Поиск<span className='emu-search-control'><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder='Сотрудник, работа, участок' /></span></label>
    </section>
  );
}
