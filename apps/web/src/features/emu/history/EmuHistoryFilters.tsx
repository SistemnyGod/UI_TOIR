import { CalendarDays, Download, Filter, RotateCcw, Search } from "lucide-react";
import { statusFilterOptions } from "./emuHistoryTypes";

type ShiftType = "" | "day" | "night";

interface HistoryEmployeeOption {
  department?: string;
  fullName: string;
  id: string;
  personnelNo?: string;
  position?: string;
}

interface IdNameOption {
  id: string;
  name: string;
}

export function EmuHistoryFilters({
  canExportReports,
  canSeeDeleted,
  dateFrom,
  dateTo,
  employeeId,
  employeeSearch,
  filteredEmployeeOptions,
  includeDeleted,
  manualCorrectionsOnly,
  notCompletedReasonId,
  onApply,
  onExport,
  onReset,
  problemOnly,
  sectionId,
  sections,
  selectedEmployee,
  setDateFrom,
  setDateTo,
  setEmployeeId,
  setEmployeeSearch,
  setIncludeDeleted,
  setManualCorrectionsOnly,
  setNotCompletedReasonId,
  setProblemOnly,
  setSectionId,
  setShiftType,
  setSortBy,
  setStatus,
  setWaitReasonId,
  shiftType,
  sortBy,
  status,
  waitReasonId,
  waitReasons,
  notCompletedReasons,
}: {
  canExportReports: boolean;
  canSeeDeleted: boolean;
  dateFrom: string;
  dateTo: string;
  employeeId: string;
  employeeSearch: string;
  filteredEmployeeOptions: HistoryEmployeeOption[];
  includeDeleted: boolean;
  manualCorrectionsOnly: boolean;
  notCompletedReasonId: string;
  onApply: () => void;
  onExport: () => void;
  onReset: () => void;
  problemOnly: boolean;
  sectionId: string;
  sections: IdNameOption[];
  selectedEmployee?: HistoryEmployeeOption;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setEmployeeId: (value: string) => void;
  setEmployeeSearch: (value: string) => void;
  setIncludeDeleted: (value: boolean) => void;
  setManualCorrectionsOnly: (value: boolean) => void;
  setNotCompletedReasonId: (value: string) => void;
  setProblemOnly: (value: boolean) => void;
  setSectionId: (value: string) => void;
  setShiftType: (value: ShiftType) => void;
  setSortBy: (value: string) => void;
  setStatus: (value: string) => void;
  setWaitReasonId: (value: string) => void;
  shiftType: ShiftType;
  sortBy: string;
  status: string;
  waitReasonId: string;
  waitReasons: IdNameOption[];
  notCompletedReasons: IdNameOption[];
}) {
  return (
    <section className="emu-history-filter-card">
      <label>
        <span>Период</span>
        <div className="emu-history-period">
          <CalendarDays size={16} />
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <b>-</b>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </label>
      <label>
        <span>Смена</span>
        <select value={shiftType} onChange={(event) => setShiftType(event.target.value as ShiftType)}>
          <option value="">Все смены</option>
          <option value="day">День</option>
          <option value="night">Ночь</option>
        </select>
      </label>
      <div className="emu-history-employee-filter">
        <label htmlFor="emu-history-employee-search">Сотрудник</label>
        <div className="emu-history-search-box">
          <Search size={16} />
          <input
            id="emu-history-employee-search"
            placeholder="Поиск сотрудника..."
            type="search"
            value={employeeSearch}
            onChange={(event) => {
              setEmployeeSearch(event.target.value);
              if (employeeId) setEmployeeId("");
            }}
          />
        </div>
        {employeeId && selectedEmployee ? (
          <button className="emu-history-selected-employee" onClick={() => { setEmployeeId(""); setEmployeeSearch(""); }} type="button">
            {selectedEmployee.fullName}
            <span>Сбросить</span>
          </button>
        ) : employeeSearch.trim().length >= 2 ? (
          <div className="emu-history-employee-results">
            {filteredEmployeeOptions.map((employee) => (
              <button
                key={employee.id}
                onClick={() => {
                  setEmployeeId(employee.id);
                  setEmployeeSearch(employee.fullName);
                }}
                type="button"
              >
                <strong>{employee.fullName}</strong>
                <span>{[employee.personnelNo, employee.position, employee.department].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
            {filteredEmployeeOptions.length === 0 ? <em>Ничего не найдено</em> : null}
          </div>
        ) : null}
      </div>
      <label>
        <span>Участок</span>
        <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          <option value="">Все участки</option>
          {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
        </select>
      </label>
      <label>
        <span>Статус работы</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Все статусы</option>
          {statusFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>Причина ожидания</span>
        <select value={waitReasonId} onChange={(event) => setWaitReasonId(event.target.value)}>
          <option value="">Все причины</option>
          {waitReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
        </select>
      </label>
      <label>
        <span>Причина невыполнения</span>
        <select value={notCompletedReasonId} onChange={(event) => setNotCompletedReasonId(event.target.value)}>
          <option value="">Все причины</option>
          {notCompletedReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
        </select>
      </label>
      <label>
        <span>Сортировка</span>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="date">Дата завершения</option>
          <option value="shift">Дата смены</option>
          <option value="section">Участок</option>
          <option value="employee">Сотрудник</option>
          <option value="duration">Длительность</option>
          <option value="waiting">Паузы</option>
          <option value="result">Результат</option>
        </select>
      </label>
      <div className="emu-history-filter-flags">
        <label><input checked={problemOnly} onChange={(event) => setProblemOnly(event.target.checked)} type="checkbox" /> Только проблемные</label>
        <label><input checked={manualCorrectionsOnly} onChange={(event) => setManualCorrectionsOnly(event.target.checked)} type="checkbox" /> Только ручные корректировки</label>
        {canSeeDeleted ? <label><input checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} type="checkbox" /> Удаленные</label> : null}
      </div>
      <div className="emu-history-filter-buttons">
        <button className="emu-primary-button" onClick={onApply} type="button"><Filter size={16} /> Применить</button>
        <button className="emu-secondary-button" onClick={onReset} type="button"><RotateCcw size={16} /> Сбросить</button>
        {canExportReports ? <button className="emu-secondary-button" onClick={onExport} type="button"><Download size={16} /> Экспорт</button> : null}
      </div>
    </section>
  );
}
