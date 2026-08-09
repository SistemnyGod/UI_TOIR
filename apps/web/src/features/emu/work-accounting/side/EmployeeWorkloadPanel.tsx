import { useState } from "react";
import { filterEmuEmployeeWorkload, type EmuEmployeeWorkload, type EmuEmployeeWorkloadStatus } from "../../../../domain/emuWorkBoard";
import { Button, FilterBar, Panel, SectionTabs } from "../../../../shared/ui";
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
  const [status, setStatus] = useState<EmuEmployeeWorkloadStatus | "all">("all");
  const rows = filterEmuEmployeeWorkload(employees, query, status);
  const hasFilters = Boolean(query.trim()) || status !== "all";
  const counts = employees.reduce<Record<EmuEmployeeWorkloadStatus | "all", number>>(
    (acc, employee) => {
      acc.all += 1;
      acc[employee.status] += 1;
      return acc;
    },
    { all: 0, conflict: 0, free: 0, waiting: 0, working: 0 },
  );

  return (
    <Panel className="emu-workload-panel" title="Сотрудники" note="Текущая загрузка и доступность сотрудников">
      <FilterBar ariaLabel="Фильтры загрузки сотрудников" className="emu-workload-filters">
        <label>
          Поиск сотрудников
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Поиск сотрудников" placeholder="Поиск сотрудника" />
        </label>
        <SectionTabs
          ariaLabel="Статус загрузки сотрудников"
          value={status}
          onChange={setStatus}
          tabs={(["all", "free", "working", "waiting", "conflict"] as const).map((item) => ({ id: item, label: employeeWorkloadLabel(item), count: counts[item] }))}
        />
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
            <span>{employees.length === 0 ? "Добавьте сотрудников в избранное, чтобы назначать им работы." : "Измените поиск или выберите другой статус."}</span>
            {hasFilters ? <Button onClick={() => { setQuery(""); setStatus("all"); }} variant="ghost">Сбросить фильтры</Button> : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
