import type { EmuWorkSessionDto } from "../../../../api/contracts";
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
}) {
  const selectedEmployees = employees.filter((employee) => selectedIds.includes(employee.id));
  const visibleEmployees = employees.slice(0, 36);
  const hiddenCount = Math.max(0, employees.length - visibleEmployees.length);
  const sourceCount = totalCount ?? employees.length;

  return (
    <div className="emu-picker-shell">
      <div className="emu-picker-toolbar">
        <div>
          <strong>Сотрудники</strong>
          <span>
            {showAll
              ? "Выбрано " + selectedIds.length + " · показано " + visibleEmployees.length + " из " + sourceCount
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
              className={selectedIds.includes(employee.id) ? "selected" : ""}
              key={employee.id}
              onClick={() => setSelectedIds((value) => toggle(value, employee.id))}
              type="button"
            >
              <strong title={employee.fullName}>
                {favoriteIds?.has(employee.id) ? <span aria-label="В избранном" className="emu-favorite-mark">★</span> : null}
                {formatEmployeeShortName(employee.fullName)}
              </strong>
              <small>{employee.position || employee.department}</small>
              {shouldShowEmployeeState(state) ? <em className={"emu-employee-status " + statusClass(state)}>{employeeStatusLabel(state)}</em> : null}
            </button>
          );
        })}
      </div>
      {hiddenCount > 0 ? <p className="emu-picker-hint">Уточните поиск, чтобы увидеть еще {hiddenCount} сотрудников.</p> : null}
    </div>
  );
}
