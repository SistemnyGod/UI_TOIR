import { BookUser, ChevronDown, RotateCcw, Search, Star, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { EmuFavoriteEmployeeDto } from '../../../../api/contracts';
import type { EmuShiftReportEmployeeAssignment, EmuShiftReportEmployeeOptionDto } from '../../../../api/emuShiftReportContracts';
import { Button, ModalShell } from '../../../../shared/ui';
import {
  employeeCategoryLabel,
  filterAndSortEmployees,
  type EmployeeCategoryFilter,
} from '../employeeDirectorySearch';

const categoryFilters: Array<{ value: EmployeeCategoryFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'mechanic', label: 'Слесари' },
  { value: 'electrician', label: 'Электрики' },
  { value: 'other', label: 'Другие' },
];

const pageSizeOptions = [5, 10, 25, 50, 100] as const;

type EmployeeDirectoryPopoverProps = {
  employees: EmuShiftReportEmployeeOptionDto[];
  selectedEmployeeId: string;
  favoriteEmployees: EmuFavoriteEmployeeDto[];
  favoriteLoading: boolean;
  favoriteError: string;
  canManageFavorites: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetryFavorites: () => void;
  onAddFavorite: (employeeId: string) => Promise<unknown>;
  onRemoveFavorite: (employeeId: string) => Promise<unknown>;
  onSetEmployeeCategory: (employeeId: string, workerCategory: EmuShiftReportEmployeeAssignment) => Promise<unknown>;
  onSelectEmployee: (employee: EmuShiftReportEmployeeOptionDto) => void;
};

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function EmployeeDirectoryPopover({
  employees,
  selectedEmployeeId,
  favoriteEmployees,
  favoriteLoading,
  favoriteError,
  canManageFavorites,
  open,
  onOpen,
  onClose,
  onRetryFavorites,
  onAddFavorite,
  onRemoveFavorite,
  onSetEmployeeCategory,
  onSelectEmployee,
}: EmployeeDirectoryPopoverProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<EmployeeCategoryFilter>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [department, setDepartment] = useState('');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(pageSizeOptions[0]);
  const [pendingId, setPendingId] = useState('');
  const [categoryPendingId, setCategoryPendingId] = useState('');
  const [mutationError, setMutationError] = useState('');
  const favoriteIds = useMemo(
    () => new Set(favoriteEmployees.filter((item) => item.isActive).map((item) => item.employeeId)),
    [favoriteEmployees],
  );
  const departments = useMemo(
    () => Array.from(new Set(employees.map((employee) => employee.department.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'ru-RU')),
    [employees],
  );
  const categoryCounts = useMemo(() => ({
    all: employees.length,
    mechanic: employees.filter((employee) => employee.workerCategory === 'mechanic').length,
    electrician: employees.filter((employee) => employee.workerCategory === 'electrician').length,
    other: employees.filter((employee) => employee.workerCategory === null).length,
  }), [employees]);
  const visibleEmployees = useMemo(
    () => filterAndSortEmployees(employees, query, favoriteIds, { category, department, favoriteOnly }),
    [category, department, employees, favoriteIds, favoriteOnly, query],
  );
  const totalPages = Math.max(1, Math.ceil(visibleEmployees.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedEmployees = visibleEmployees.slice(pageStart, pageStart + pageSize);
  const activeFilterCount = Number(Boolean(query.trim())) + Number(category !== 'all') + Number(Boolean(department)) + Number(favoriteOnly);

  useEffect(() => {
    if (!open) return;
    setCategory('all');
    setFavoriteOnly(false);
    setDepartment('');
    setQuery('');
    setActiveIndex(0);
    setPage(1);
    setPageSize(pageSizeOptions[0]);
    setMutationError('');
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
    setPage(1);
  }, [category, department, favoriteOnly, query]);

  function resetFilters() {
    setCategory('all');
    setFavoriteOnly(false);
    setDepartment('');
    setQuery('');
    setActiveIndex(0);
    setPage(1);
    searchRef.current?.focus();
  }

  function choose(employee: EmuShiftReportEmployeeOptionDto) {
    onSelectEmployee(employee);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(pagedEmployees.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && pagedEmployees[activeIndex]) {
      event.preventDefault();
      choose(pagedEmployees[activeIndex]);
    }
  }

  async function toggleFavorite(employeeId: string) {
    if (!canManageFavorites || pendingId === employeeId) return;
    setPendingId(employeeId);
    setMutationError('');
    try {
      if (favoriteIds.has(employeeId)) await onRemoveFavorite(employeeId);
      else await onAddFavorite(employeeId);
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : 'Не удалось изменить избранного сотрудника.');
    } finally {
      setPendingId('');
    }
  }

  async function setEmployeeCategory(employeeId: string, value: string) {
    if (!canManageFavorites || categoryPendingId === employeeId) return;
    const workerCategory: EmuShiftReportEmployeeAssignment = value === 'auto'
      ? null
      : value as Exclude<EmuShiftReportEmployeeAssignment, null>;
    setCategoryPendingId(employeeId);
    setMutationError('');
    try {
      await onSetEmployeeCategory(employeeId, workerCategory);
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : 'Не удалось изменить группу сотрудника.');
    } finally {
      setCategoryPendingId('');
    }
  }
  return (
    <div className='emu-employee-directory'>
      <button type='button' className='emu-employee-directory-trigger' aria-expanded={open} aria-haspopup='dialog' onClick={onOpen}>
        <BookUser aria-hidden='true' size={16} />
        <span>Справочник сотрудников</span>
        <ChevronDown aria-hidden='true' className={open ? 'is-open' : ''} size={15} />
      </button>

      {open ? (
        <ModalShell
          className='emu-directory-dialog'
          title='Справочник сотрудников ЭМУ'
          subtitle='Все активные сотрудники предприятия. Категорию отчёта определяет выбранная вкладка формы.'
          onClose={onClose}
          actions={<Button onClick={onClose} variant='primary'>Готово</Button>}
        >
          <div className='emu-directory-toolbar'>
            <div className='emu-directory-tabs' role='tablist' aria-label='Категория сотрудников'>
              {categoryFilters.map((filter) => (
                <button key={filter.value} type='button' role='tab' aria-selected={category === filter.value} className={category === filter.value ? 'active' : ''} onClick={() => setCategory(filter.value)}>
                  {filter.label}<span>{categoryCounts[filter.value]}</span>
                </button>
              ))}
            </div>

            <label className='emu-directory-search'>
              <Search aria-hidden='true' size={17} />
              <span className='sr-only'>Поиск сотрудника</span>
              <input
                ref={searchRef}
                type='search'
                role='combobox'
                aria-label='Поиск сотрудника'
                aria-expanded='true'
                aria-controls='emu-directory-listbox'
                aria-activedescendant={pagedEmployees[activeIndex] ? `emu-directory-option-${pagedEmployees[activeIndex].id}` : undefined}
                value={query}
                placeholder='ФИО, табельный номер, должность или подразделение'
                autoComplete='off'
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {query ? <button type='button' className='emu-directory-search-clear' aria-label='Очистить поиск' onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X aria-hidden='true' size={15} /></button> : null}
            </label>

            <div className='emu-directory-filter-row'>
              <div className='emu-directory-modes' role='tablist' aria-label='Режим списка сотрудников'>
                <button type='button' role='tab' aria-selected={!favoriteOnly} className={!favoriteOnly ? 'active' : ''} onClick={() => setFavoriteOnly(false)}>Все сотрудники <span>{employees.length}</span></button>
                <button type='button' role='tab' aria-selected={favoriteOnly} className={favoriteOnly ? 'active' : ''} onClick={() => setFavoriteOnly(true)}><Star aria-hidden='true' size={14} fill='currentColor' />Избранные <span>{favoriteIds.size}</span></button>
              </div>
              <label className='emu-directory-department'>
                <span>Подразделение</span>
                <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                  <option value=''>Все подразделения</option>
                  {departments.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              {activeFilterCount ? <button type='button' className='emu-directory-reset' onClick={resetFilters}><RotateCcw aria-hidden='true' size={14} />Сбросить</button> : null}
            </div>
          </div>

          <div className='emu-directory-messages'>
            {favoriteLoading ? <div className='emu-directory-status' aria-live='polite'>Обновляем избранных сотрудников…</div> : null}
            {favoriteError ? <div className='emu-directory-error' role='alert'>{favoriteError}<button type='button' onClick={onRetryFavorites}>Повторить</button></div> : null}
            {mutationError ? <div className='emu-directory-error' role='alert'>{mutationError}</div> : null}
          </div>

          <div id='emu-directory-listbox' className='emu-directory-list' role='listbox' aria-label='Сотрудники' aria-live='polite'>
            {pagedEmployees.length ? pagedEmployees.map((employee, index) => {
              const isFavorite = favoriteIds.has(employee.id);
              const isSelected = selectedEmployeeId === employee.id;
  return (
                <div className={`emu-directory-item ${index === activeIndex ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`} key={employee.id}>
                  <button
                    id={`emu-directory-option-${employee.id}`}
                    type='button'
                    className='emu-directory-employee'
                    role='option'
                    aria-selected={isSelected}
                    data-employee-id={employee.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(employee)}
                  >
                    <span className='emu-directory-avatar' aria-hidden='true'>{initials(employee.fullName) || <UserRound size={15} />}</span>
                    <span className='emu-directory-copy'>
                      <strong>{employee.fullName}</strong>
                      <span className='emu-directory-meta'>
                        <small>{employee.position || 'Должность не указана'}</small>
                        <span className={`emu-directory-badge is-${employee.workerCategory ?? 'other'}`}>{employeeCategoryLabel(employee.workerCategory)}</span>
                        {employee.department ? <span className='emu-directory-badge is-department'>{employee.department}</span> : null}
                        <span className='emu-directory-personnel'>таб. № {employee.personnelNo || '—'}</span>
                      </span>
                    </span>
                  </button>
                  <label className='emu-directory-category-control' onClick={(event) => event.stopPropagation()}>
                    <span>Группа</span>
                    <select
                      aria-label={`Группа сотрудника ${employee.fullName}`}
                      value={employee.assignedWorkerCategory ?? 'auto'}
                      disabled={!canManageFavorites || categoryPendingId === employee.id}
                      onChange={(event) => void setEmployeeCategory(employee.id, event.target.value)}
                    >
                      <option value='auto'>Авто</option>
                      <option value='mechanic'>Слесари</option>
                      <option value='electrician'>Электрики</option>
                      <option value='none'>Без группы</option>
                    </select>
                  </label>                  <button
                    type='button'
                    className={`emu-directory-star ${isFavorite ? 'is-favorite' : ''}`}
                    aria-label={isFavorite ? `Убрать ${employee.fullName} из избранных` : `Добавить ${employee.fullName} в избранные`}
                    aria-pressed={isFavorite}
                    disabled={!canManageFavorites || pendingId === employee.id}
                    onClick={() => void toggleFavorite(employee.id)}
                  >
                    <Star aria-hidden='true' size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              );
            }) : (
              <div className='emu-directory-empty'>
                <strong>Сотрудники не найдены</strong>
                <small>Измените запрос или сбросьте выбранные фильтры.</small>
                <Button onClick={resetFilters} variant='secondary'>Сбросить фильтры</Button>
              </div>
            )}
          </div>

          <div className='emu-directory-footer'>
            <span className='emu-directory-footer-summary'>
              {visibleEmployees.length ? `${pageStart + 1}–${Math.min(pageStart + pageSize, visibleEmployees.length)} из ${visibleEmployees.length}` : '0'} сотрудников · {favoriteIds.size} избранных · фильтров: {activeFilterCount}
            </span>
            <div className='emu-directory-pagination' aria-label='Пагинация сотрудников'>
              <label>
                Показывать
                <select aria-label='Количество сотрудников на странице' value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setActiveIndex(0); }}>
                  {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button aria-label='Предыдущая страница' disabled={currentPage <= 1} type='button' onClick={() => { setPage((current) => Math.max(1, current - 1)); setActiveIndex(0); }}>Назад</button>
              <span aria-live='polite'>Стр. {currentPage} из {totalPages}</span>
              <button aria-label='Следующая страница' disabled={currentPage >= totalPages} type='button' onClick={() => { setPage((current) => Math.min(totalPages, current + 1)); setActiveIndex(0); }}>Вперёд</button>
              {activeFilterCount ? <button className='emu-directory-footer-reset' type='button' onClick={resetFilters}>Сбросить фильтры</button> : null}
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
