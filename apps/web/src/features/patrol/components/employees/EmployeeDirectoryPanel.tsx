import { useMemo, useState } from "react";
import { Chip, EmptyState, Panel } from "../../../../shared/ui";
import type { EmployeeDirectoryItem } from "../../../../types";

interface EmployeeDirectoryPanelProps {
  allEmployeesCount?: number;
  canManage?: boolean;
  employees: EmployeeDirectoryItem[];
  isSaving?: boolean;
  selectedEmployeeId?: string;
  onOpenAddFromAccounting?: () => void;
  onOpenCreate: () => void;
  onSelectEmployee: (id: string) => void;
}

export function EmployeeDirectoryPanel({
  allEmployeesCount,
  employees,
  canManage = true,
  isSaving = false,
  selectedEmployeeId,
  onOpenAddFromAccounting,
  onOpenCreate,
  onSelectEmployee,
}: EmployeeDirectoryPanelProps) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [position, setPosition] = useState("all");
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const departments = useMemo(() => uniqueValues(employees.map((employee) => employee.department)), [employees]);
  const positions = useMemo(() => uniqueValues(employees.map((employee) => employee.position)), [employees]);
  const groups = useMemo(() => uniqueValues(employees.map((employee) => employee.employeeGroup)), [employees]);
  const statuses = useMemo(() => uniqueValues(employees.map((employee) => employee.status)), [employees]);
  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesQuery =
        !normalizedQuery ||
        [employee.fullName, employee.personnelNo, employee.position, employee.department, employee.employeeGroup]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return (
        matchesQuery &&
        (department === "all" || employee.department === department) &&
        (position === "all" || employee.position === position) &&
        (group === "all" || employee.employeeGroup === group) &&
        (status === "all" || employee.status === status)
      );
    });
  }, [department, employees, group, position, query, status]);
  const hasActiveFilters = Boolean(query.trim()) || department !== "all" || position !== "all" || group !== "all" || status !== "all";
  const activeCount = employees.filter((employee) => employee.status === "Активен" || employee.status === "На смене").length;
  const mobileCount = employees.filter((employee) => employee.mobileStatus === "Привязан").length;

  function resetFilters() {
    setQuery("");
    setDepartment("all");
    setPosition("all");
    setGroup("all");
    setStatus("all");
  }

  return (
    <Panel
      title="Сотрудники обхода территории"
      note={`Рабочий список для назначения маршрутов: ${employees.length}${typeof allEmployeesCount === "number" ? ` из ${allEmployeesCount} в общем справочнике` : ""}`}
      actions={
        <>
          {onOpenAddFromAccounting ? (
            <button className="button ghost" disabled={!canManage || isSaving} onClick={onOpenAddFromAccounting} type="button">
              Выбрать из справочника
            </button>
          ) : null}
          <button
            className="button primary"
            disabled={!canManage || isSaving}
            onClick={onOpenCreate}
            title={!canManage ? "Недостаточно прав для управления сотрудниками." : undefined}
            type="button"
          >
            Создать сотрудника
          </button>
        </>
      }
    >
      <div className="employee-directory-summary" aria-label="Сводка по сотрудникам обхода">
        <span><strong>{employees.length}</strong> в списке</span>
        <span><strong>{activeCount}</strong> доступны</span>
        <span><strong>{mobileCount}</strong> с мобильным входом</span>
      </div>

      <div className="filters employee-filters">
        <label className="wide-filter">
          Поиск
          <input
            aria-label="Поиск сотрудников обхода"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="ФИО, табельный номер, должность, подразделение"
          />
        </label>
        <label>
          Подразделение
          <select value={department} onChange={(event) => setDepartment(event.currentTarget.value)}>
            <option value="all">Все подразделения</option>
            {departments.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Должность
          <select value={position} onChange={(event) => setPosition(event.currentTarget.value)}>
            <option value="all">Все должности</option>
            {positions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Основная группа
          <select value={group} onChange={(event) => setGroup(event.currentTarget.value)}>
            <option value="all">Все группы</option>
            {groups.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Статус
          <select value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
            <option value="all">Все статусы</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      {filteredEmployees.length > 0 ? (
        <div className="employee-roster-list">
          {filteredEmployees.map((employee) => (
            <button
              aria-label={`Открыть профиль: ${employee.fullName}`}
              aria-pressed={selectedEmployeeId === employee.id}
              className={`employee-roster-row ${selectedEmployeeId === employee.id ? "selected" : ""}`}
              key={employee.id}
              onClick={() => onSelectEmployee(employee.id)}
              type="button"
            >
              <div className="identity-cell employee-roster-identity">
                <span className="avatar small">{employee.initials}</span>
                <div>
                  <strong>{employee.fullName}</strong>
                  <span className="muted-line">{employee.position || "Должность не указана"}</span>
                </div>
              </div>
              <div className="employee-roster-meta">
                <span>{employee.department || employee.zone || "Без подразделения"}</span>
                <span>{employee.employeeGroup || "Без группы"}</span>
              </div>
              <div className="employee-roster-badges">
                <Chip>{employee.status}</Chip>
                <Chip>{employee.mobileStatus}</Chip>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title={employees.length > 0 ? "Сотрудники не найдены" : "Сотрудники обхода не добавлены"}
          description={employees.length > 0 ? "Измените фильтры или сбросьте поисковый запрос." : "Выберите сотрудников из общего справочника или создайте нового."}
          action={
            employees.length > 0 && hasActiveFilters ? (
              <button className="button ghost" onClick={resetFilters} type="button">Сбросить фильтры</button>
            ) : (
              <div className="inline-actions">
                {onOpenAddFromAccounting ? (
                  <button className="button ghost" disabled={!canManage || isSaving} onClick={onOpenAddFromAccounting} type="button">
                    Выбрать из справочника
                  </button>
                ) : null}
                <button className="button primary" disabled={!canManage || isSaving} onClick={onOpenCreate} type="button">
                  Создать сотрудника
                </button>
              </div>
            )
          }
        />
      )}

      <div className="employee-directory-footer">
        <span>Показано {filteredEmployees.length} из {employees.length}</span>
        {hasActiveFilters ? <button className="link-button" onClick={resetFilters} type="button">Сбросить фильтры</button> : null}
      </div>
    </Panel>
  );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
}
