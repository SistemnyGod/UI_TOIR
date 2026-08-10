import { useState } from "react";
import { filterEmuEmployeeWorkload, type EmuEmployeeWorkload } from "../../../../domain/emuWorkBoard";
import { Button, FilterBar, Panel } from "../../../../shared/ui";
import { employeeWorkloadLabel } from "../workAccountingUtils";

export function EmployeeWorkloadPanel({
  canCreate,
  employees,
  onCreateForEmployee,
  onSelectEmployee,
  onSelectWork,
}: {
  canCreate: boolean;
  employees: EmuEmployeeWorkload[];
  onCreateForEmployee: (employeeId: string) => void;
  onSelectEmployee: (employeeId: string) => void;
  onSelectWork: (workId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = filterEmuEmployeeWorkload(employees, query, "all");
  const hasFilters = Boolean(query.trim());

  return (
    <Panel className="emu-workload-panel" title="Сотрудники" note="Текущая загрузка и доступность сотрудников">
      <FilterBar ariaLabel="Фильтры загрузки сотрудников" className="emu-workload-filters">
        <label>
          Поиск сотрудников
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Поиск сотрудников" placeholder="Поиск сотрудника" />
        </label>
      </FilterBar>
      <div className="emu-workload-list">
        {rows.map((employee) => {
          const positionLabel = employee.position || "Должность не указана";
          const sectionLabel = employee.sectionNames.join(", ") || employee.department || "Участок не указан";
          const statusLabel = employeeWorkloadLabel(employee.status);
          return (
            <button
              aria-label={`${employee.fullName}. ${positionLabel}. Участок: ${sectionLabel}. Статус: ${statusLabel}`}
              className={`status-${employee.status}`}
              key={employee.employeeId}
              onClick={() => {
                if (employee.status === "free" && canCreate) {
                  onCreateForEmployee(employee.employeeId);
                  return;
                }
                if (employee.workSessionIds.length === 1) {
                  onSelectWork(employee.workSessionIds[0]);
                  return;
                }
                onSelectEmployee(employee.employeeId);
              }}
              title={`${employee.fullName} · ${positionLabel} · ${sectionLabel}`}
              type="button"
            >
              <span className="emu-workload-copy">
                <strong title={employee.fullName}>{employee.fullName}</strong>
                <small title={`${positionLabel} · ${sectionLabel}`}>{positionLabel} · {sectionLabel}</small>
              </span>
              <em><span className="visually-hidden">Статус: </span>{statusLabel}</em>
            </button>
          );
        })}
        {rows.length === 0 ? (
          <div className="emu-workload-empty" role="status" aria-live="polite">
            <strong>{employees.length === 0 ? "Сотрудников нет" : "Сотрудники не найдены"}</strong>
            <span>{employees.length === 0 ? "Добавьте сотрудников в избранное, чтобы назначать им работы." : "Измените поисковый запрос."}</span>
            {hasFilters ? <Button onClick={() => setQuery("")} variant="ghost">Сбросить поиск</Button> : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
