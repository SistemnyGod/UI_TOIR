import { useState, type Dispatch, type SetStateAction } from "react";
import { filterEmuEmployeeWorkload, type EmuEmployeeWorkload, type EmuEmployeeWorkloadStatus } from "../../../../domain/emuWorkBoard";
import { Button, FilterBar, Panel, PaginationBar, type PageSizeOption } from "../../../../shared/ui";
import { employeeWorkloadLabel } from "../workAccountingUtils";

export type EmployeeWorkloadView = {
  query: string;
  status: EmuEmployeeWorkloadStatus | "all";
  page: number;
  pageSize: PageSizeOption;
};
export const initialWorkloadView: EmployeeWorkloadView = { query: "", status: "all", page: 1, pageSize: 25 };

export function EmployeeWorkloadPanel({
  canCreate,
  employees,
  onCreateForEmployee,
  onSelectEmployee,
  onSelectWork,
  view,
  onViewChange,
}: {
  canCreate: boolean;
  employees: EmuEmployeeWorkload[];
  onCreateForEmployee: (employeeId: string) => void;
  onSelectEmployee: (employeeId: string) => void;
  onSelectWork: (workId: string) => void;
  view?: EmployeeWorkloadView;
  onViewChange?: Dispatch<SetStateAction<EmployeeWorkloadView>>;
}) {
  const [internalView, setInternalView] = useState(initialWorkloadView);
  const { query, status, page, pageSize } = view ?? internalView;
  const setView = onViewChange ?? setInternalView;
  const rows = filterEmuEmployeeWorkload(employees, query, status);
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const hasFilters = Boolean(query.trim()) || status !== "all";

  return (
    <Panel className="emu-workload-panel" title="Сотрудники" note="Занятость по всем доступным участкам">
      <FilterBar ariaLabel="Фильтры загрузки сотрудников" className="emu-workload-filters">
        <label>
          Поиск сотрудников
          <input value={query} onChange={(event) => { const query = event.target.value; setView(current => ({ ...current, query, page: 1 })); }} aria-label="Поиск сотрудников" placeholder="ФИО, должность" />
        </label>
        <label>Занятость<select aria-label="Фильтр занятости" value={status} onChange={event => { const status = event.target.value as EmployeeWorkloadView["status"]; setView(current => ({ ...current, status, page: 1 })); }}><option value="all">Все сотрудники</option><option value="free">Свободны</option><option value="working">В работе</option><option value="waiting">На паузе</option><option value="conflict">Конфликт работ</option></select></label>
      </FilterBar>
      <div className="emu-workload-list">
        {rows.slice((safePage - 1) * pageSize, safePage * pageSize).map((employee) => {
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
            {hasFilters ? <Button onClick={() => setView(current => ({ ...current, query: "", status: "all", page: 1 }))} variant="ghost">Сбросить поиск</Button> : null}
          </div>
        ) : null}
      </div>
      {rows.length > 25 ? <PaginationBar page={safePage} pageSize={pageSize} total={rows.length} onPageChange={page => setView(current => ({ ...current, page }))} onPageSizeChange={pageSize => setView(current => ({ ...current, pageSize, page: 1 }))} /> : null}
    </Panel>
  );
}
