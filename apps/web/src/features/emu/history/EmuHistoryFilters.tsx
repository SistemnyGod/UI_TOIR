import { ChevronDown, ChevronUp, Download, Filter, RotateCcw, Search, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button, DateRangePicker, FilterBar } from "../../../shared/ui";
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

type VisibleFilterKey = "waitReason" | "notCompletedReason" | "sort" | "flags";

const visibleFilterOptions: Array<{ key: VisibleFilterKey; label: string }> = [
  { key: "waitReason", label: "Причина ожидания" },
  { key: "notCompletedReason", label: "Причина невыполнения" },
  { key: "sort", label: "Сортировка" },
  { key: "flags", label: "Флаги проверки" },
];

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
  const [filterSettingsOpen, setFilterSettingsOpen] = useState(false);
  const [visibleFilters, setVisibleFilters] = useState<Record<VisibleFilterKey, boolean>>({
    flags: true,
    notCompletedReason: true,
    sort: true,
    waitReason: true,
  });
  const visibleFilterCount = visibleFilterOptions.filter((option) => visibleFilters[option.key]).length;

  return (
    <FilterBar ariaLabel="Фильтры истории выполненных работ" className="emu-history-filter-card">
      <div className="emu-history-period-field">
        <span>Период</span>
        <DateRangePicker allowClear dateFrom={dateFrom} dateTo={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} triggerClassName="emu-history-period-trigger" />
      </div>
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
          <Button className="emu-history-selected-employee" onClick={() => { setEmployeeId(""); setEmployeeSearch(""); }} variant="ghost">
            {selectedEmployee.fullName}
            <span>Сбросить</span>
          </Button>
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
      {visibleFilters.waitReason ? (
        <label className="emu-history-advanced-filter">
          <span>Причина ожидания</span>
          <select value={waitReasonId} onChange={(event) => setWaitReasonId(event.target.value)}>
            <option value="">Все причины</option>
            {waitReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
          </select>
        </label>
      ) : null}
      {visibleFilters.notCompletedReason ? (
        <label className="emu-history-advanced-filter">
          <span>Причина невыполнения</span>
          <select value={notCompletedReasonId} onChange={(event) => setNotCompletedReasonId(event.target.value)}>
            <option value="">Все причины</option>
            {notCompletedReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
          </select>
        </label>
      ) : null}
      {visibleFilters.sort ? (
        <label className="emu-history-advanced-filter">
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
      ) : null}
      <div className="emu-history-filter-settings">
        <Button className="emu-history-filter-settings-toggle" onClick={() => setFilterSettingsOpen((value) => !value)} variant="ghost">
          <Settings2 size={15} /> Настроить фильтры <span>{visibleFilterCount}/{visibleFilterOptions.length}</span>
          {filterSettingsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </Button>
        {filterSettingsOpen ? (
          <div className="emu-history-filter-settings-menu" role="group" aria-label="Видимые дополнительные фильтры">
            {visibleFilterOptions.map((option) => (
              <label key={option.key}>
                <input checked={visibleFilters[option.key]} onChange={(event) => setVisibleFilters((current) => ({ ...current, [option.key]: event.target.checked }))} type="checkbox" />
                {option.label}
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <div className="emu-history-filter-lower">
        {visibleFilters.flags ? (
          <div className="emu-history-filter-flags">
            <label><input checked={problemOnly} onChange={(event) => setProblemOnly(event.target.checked)} type="checkbox" /> Только проблемные</label>
            <label><input checked={manualCorrectionsOnly} onChange={(event) => setManualCorrectionsOnly(event.target.checked)} type="checkbox" /> Только ручные корректировки</label>
            {canSeeDeleted ? <label><input checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} type="checkbox" /> Удаленные</label> : null}
          </div>
        ) : <span className="emu-history-filter-hidden-note">Дополнительные флаги скрыты</span>}
        <div className="emu-history-filter-buttons">
          <Button onClick={onApply} variant="primary"><Filter size={16} /> Применить</Button>
          <Button onClick={onReset} variant="secondary"><RotateCcw size={16} /> Сбросить</Button>
          {canExportReports ? <Button onClick={onExport} variant="secondary"><Download size={16} /> Экспорт</Button> : null}
        </div>
      </div>
    </FilterBar>
  );
}
