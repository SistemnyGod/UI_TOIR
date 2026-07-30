import { ChevronDown, Search, Settings2, Star, UserRound, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { EmuFavoriteEmployeeDto } from '../../../../api/contracts';
import type { EmuShiftReportEmployeeOptionDto } from '../../../../api/emuShiftReportContracts';
import { employeeCategoryLabel, filterAndSortEmployees } from '../employeeDirectorySearch';

type EmployeePickerProps = {
  employees: EmuShiftReportEmployeeOptionDto[];
  favoriteEmployees: EmuFavoriteEmployeeDto[];
  favoriteLoading: boolean;
  favoriteError: string;
  selectedId: string;
  error?: string;
  canManageFavorites: boolean;
  onChange: (employeeId: string) => void;
  onManageFavorites?: () => void;
  onRetryFavorites?: () => void;
};

export function EmployeePicker({
  employees,
  favoriteEmployees,
  favoriteLoading,
  favoriteError,
  selectedId,
  error,
  canManageFavorites,
  onChange,
  onManageFavorites,
  onRetryFavorites,
}: EmployeePickerProps) {
  const pickerId = useId();
  const shellRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'favorites' | 'all'>('all');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const favoriteIds = useMemo(() => new Set(favoriteEmployees.filter((item) => item.isActive).map((item) => item.employeeId)), [favoriteEmployees]);
  const selectedEmployee = employees.find((employee) => employee.id === selectedId);
  const favoriteOptions = useMemo(() => employees.filter((employee) => favoriteIds.has(employee.id)), [employees, favoriteIds]);
  const visibleEmployees = useMemo(
    () => filterAndSortEmployees(employees, query, favoriteIds, { favoriteOnly: mode === 'favorites' }),
    [employees, favoriteIds, mode, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [mode, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (shellRef.current && !shellRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function choose(employeeId: string) {
    onChange(employeeId);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleEmployees.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open && visibleEmployees[activeIndex]) {
      event.preventDefault();
      choose(visibleEmployees[activeIndex].id);
    }
  }

  return (
    <div className='emu-shift-employee-field' ref={shellRef}>
      <div className='emu-employee-picker-label-row'>
        <label htmlFor={pickerId}>Сотрудник *</label>
        {canManageFavorites && onManageFavorites ? (
          <button type='button' className='emu-favorites-manage-button' onClick={onManageFavorites}>
            <Settings2 aria-hidden='true' size={14} />Открыть справочник
          </button>
        ) : null}
      </div>

      {selectedEmployee ? (
        <div className='emu-selected-employee-card' data-selected-employee-id={selectedEmployee.id} aria-live='polite'>
          <span className='emu-selected-employee-avatar' aria-hidden='true'><UserRound size={17} /></span>
          <span className='emu-selected-employee-copy'>
            <strong>{selectedEmployee.fullName}</strong>
            <small>{selectedEmployee.position} · {selectedEmployee.department || 'Подразделение не указано'} · таб. № {selectedEmployee.personnelNo || '—'}</small>
          </span>
          <button type='button' className='emu-selected-employee-clear' aria-label='Очистить выбранного сотрудника' onClick={() => onChange('')}>
            <X aria-hidden='true' size={16} />
          </button>
        </div>
      ) : (
        <div className='emu-selected-employee-empty'>Сотрудник не выбран</div>
      )}

      <div className={`emu-employee-picker ${open ? 'is-open' : ''}`}>
        <div className='emu-employee-search-row'>
          <Search aria-hidden='true' size={16} />
          <input
            id={pickerId}
            type='search'
            role='combobox'
            value={query}
            placeholder='ФИО, табельный номер, должность…'
            autoComplete='off'
            aria-autocomplete='list'
            aria-expanded={open}
            aria-controls={`${pickerId}-listbox`}
            aria-activedescendant={open && visibleEmployees[activeIndex] ? `${pickerId}-option-${visibleEmployees[activeIndex].id}` : undefined}
            aria-haspopup='listbox'
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${pickerId}-error` : undefined}
            onFocus={() => setOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onKeyDown={handleKeyDown}
          />
          {query ? <button type='button' className='emu-employee-search-clear' aria-label='Очистить поиск сотрудника' onClick={() => setQuery('')}><X aria-hidden='true' size={14} /></button> : null}
          <ChevronDown aria-hidden='true' className={`emu-employee-picker-chevron ${open ? 'is-open' : ''}`} size={17} />
        </div>

        {open ? (
          <div className='emu-employee-picker-popover'>
            <div className='emu-employee-picker-tabs' role='tablist' aria-label='Источник сотрудников'>
              <button type='button' role='tab' aria-selected={mode === 'all'} className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>
                Все сотрудники <span>{employees.length}</span>
              </button>
              <button type='button' role='tab' aria-selected={mode === 'favorites'} className={mode === 'favorites' ? 'active' : ''} onClick={() => setMode('favorites')}>
                <Star aria-hidden='true' size={14} fill='currentColor' />Избранные <span>{favoriteOptions.length}</span>
              </button>
            </div>
            {favoriteLoading ? <div className='emu-favorites-inline-loading' aria-live='polite'>Загружаем избранных…</div> : null}
            {favoriteError ? <div className='emu-favorites-inline-error' role='alert'>{favoriteError}{onRetryFavorites ? <button type='button' onClick={onRetryFavorites}>Повторить</button> : null}</div> : null}
            <div id={`${pickerId}-listbox`} className='emu-employee-picker-list' role='listbox' aria-label={mode === 'favorites' ? 'Избранные сотрудники' : 'Все сотрудники'}>
              {visibleEmployees.length ? visibleEmployees.map((employee, index) => (
                <button
                  id={`${pickerId}-option-${employee.id}`}
                  key={employee.id}
                  type='button'
                  data-employee-id={employee.id}
                  role='option'
                  aria-selected={employee.id === selectedId}
                  className={`emu-employee-option ${index === activeIndex ? 'is-active' : ''} ${employee.id === selectedId ? 'is-selected' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(employee.id)}
                >
                  <span className='emu-employee-option-avatar' aria-hidden='true'><UserRound size={15} /></span>
                  <span className='emu-employee-option-copy'>
                    <strong>{employee.fullName}</strong>
                    <small>{employee.position || 'Должность не указана'} · {employee.department || 'Подразделение не указано'} · таб. № {employee.personnelNo || '—'}</small>
                  </span>
                  <span className={`emu-employee-option-category is-${employee.workerCategory ?? 'other'}`}>{employeeCategoryLabel(employee.workerCategory)}</span>
                  {favoriteIds.has(employee.id) ? <Star aria-label='В избранном' className='emu-employee-option-star' size={14} fill='currentColor' /> : null}
                </button>
              )) : <div className='emu-employee-picker-empty'>Сотрудники не найдены.<small>{mode === 'favorites' ? 'Откройте справочник и добавьте сотрудников в избранное.' : 'Измените поиск по ФИО, табельному номеру, должности или подразделению.'}</small></div>}
            </div>
            <p className='emu-employee-picker-hint'>↑↓ выбрать · Enter подтвердить · Esc закрыть</p>
          </div>
        ) : null}
      </div>
      {error ? <small id={`${pickerId}-error`} className='emu-employee-picker-error'>{error}</small> : null}
    </div>
  );
}