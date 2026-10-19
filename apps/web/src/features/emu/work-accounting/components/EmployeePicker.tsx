import { useEffect, useState } from "react";
import type { EmuWorkSessionDto } from "../../../../api/contracts";
import { PaginationBar, type PageSizeOption } from "../../../../shared/ui";
import type { EmuEmployeeOption } from "../types";
import {
  employeeStatusLabel,
  formatEmployeeShortName,
  getEmployeeWorkState,
  shouldShowEmployeeState,
  statusClass,
  toggle,
} from "../workAccountingUtils";

export function EmployeePicker({
  currentWorkId,
  employees,
  favoriteCount,
  favoriteIds,
  onToggleShowAll,
  selectedIds,
  sessions,
  setSelectedIds,
  showAll = true,
  totalCount,
  allEmployees = employees,
}: {
  currentWorkId: string;
  employees: EmuEmployeeOption[];
  favoriteCount?: number;
  favoriteIds?: ReadonlySet<string>;
  onToggleShowAll?: () => void;
  selectedIds: string[];
  sessions: EmuWorkSessionDto[];
  setSelectedIds: (updater: (value: string[]) => string[]) => void;
  showAll?: boolean;
  totalCount?: number;
  allEmployees?: EmuEmployeeOption[];
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const selectedSet = new Set(selectedIds);
  const selectedEmployees = allEmployees.filter((employee) => selectedSet.has(employee.id));
  const safePage = Math.min(page, Math.max(1, Math.ceil(employees.length / pageSize)));
  const visibleEmployees = employees.slice((safePage - 1) * pageSize, safePage * pageSize);
  // Search and mode changes return to the first page; background updates with
  // the same IDs keep the operator's place.
  const employeeIdsKey = employees.map(employee => employee.id).join(":");
  useEffect(() => { setPage(1); }, [employeeIdsKey, showAll]);
  const sourceCount = totalCount ?? employees.length;

  return (
    <div className="emu-picker-shell">
      <div className="emu-picker-toolbar">
        <div>
          <strong>Сотрудники</strong>
          <span>
            {showAll
              ? "Выбрано " + selectedIds.length + " · найдено " + employees.length
              : "Быстрый выбор · " + (favoriteCount ?? visibleEmployees.length) + " избранных"}
          </span>
        </div>
        <div className="emu-picker-toolbar-actions">
          {onToggleShowAll ? (
            <button
              aria-pressed={showAll}
              className="emu-picker-mode-toggle"
              onClick={onToggleShowAll}
              type="button"
            >
              {showAll ? "Только избранные" : "Все сотрудники (" + sourceCount + ")"}
            </button>
          ) : null}
          {selectedIds.length > 0 ? <button onClick={() => setSelectedIds(() => [])} type="button">Снять выбор</button> : null}
        </div>
      </div>
      {selectedEmployees.length > 0 ? (
        <div className="emu-selected-strip">
          {selectedEmployees.map((employee) => (
            <span key={employee.id} title={employee.fullName}>{formatEmployeeShortName(employee.fullName)}</span>
          ))}
        </div>
      ) : null}
      <div className="emu-picker">
        {visibleEmployees.length === 0 ? (
          <div className="emu-picker-empty">
            <strong>Сотрудники не найдены</strong>
            <span>{showAll ? "Измените поиск или проверьте справочник сотрудников." : "Избранные сотрудники не настроены. Откройте полный список."}</span>
          </div>
        ) : null}
        {visibleEmployees.map((employee) => {
          const state = getEmployeeWorkState(employee.id, sessions, currentWorkId);
          return (
            <button
              aria-label={`${employee.fullName} (${formatEmployeeShortName(employee.fullName)})`}
              aria-pressed={selectedSet.has(employee.id)}
              className={selectedIds.includes(employee.id) ? "selected" : ""}
              key={employee.id}
              onClick={() => setSelectedIds((value) => toggle(value, employee.id))}
              type="button"
            >
              <strong title={employee.fullName}>
                {favoriteIds?.has(employee.id) ? <span aria-label="В избранном" className="emu-favorite-mark">★</span> : null}
                {employee.fullName}
              </strong>
              <small>№ {employee.personnelNo || "—"} · {employee.position || employee.department}</small>
              {shouldShowEmployeeState(state) ? <em className={"emu-employee-status " + statusClass(state)}>{employeeStatusLabel(state)}</em> : null}
            </button>
          );
        })}
      </div>
      {employees.length > 25 ? <PaginationBar page={safePage} pageSize={pageSize} total={employees.length} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} /> : null}
    </div>
  );
}
