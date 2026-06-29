import { useMemo, useState } from "react";
import { Chip, EmptyState, Panel, ProgressBar } from "../../../../shared/ui";
import type { EmployeeDirectoryItem } from "../../../../types";

interface EmployeeDirectoryPanelProps {
  allEmployeesCount?: number;
  canManage?: boolean;
  employees: EmployeeDirectoryItem[];
  selectedEmployeeId?: string;
  onOpenAddFromAccounting?: () => void;
  onOpenCreate: () => void;
  onSelectEmployee: (id: string) => void;
}

export function EmployeeDirectoryPanel({
  allEmployeesCount,
  employees,
  canManage = true,
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
        [
          employee.fullName,
          employee.personnelNo,
          employee.position,
          employee.department,
          employee.employeeGroup,
        ].join(" ").toLowerCase().includes(normalizedQuery);

      return (
        matchesQuery &&
        (department === "all" || employee.department === department) &&
        (position === "all" || employee.position === position) &&
        (group === "all" || employee.employeeGroup === group) &&
        (status === "all" || employee.status === status)
      );
    });
  }, [department, employees, group, position, query, status]);

  return (
    <Panel
      title="Сотрудники обхода территории"
      note={`Избранные сотрудники для обходов: ${employees.length}${typeof allEmployeesCount === "number" ? ` из ${allEmployeesCount} в общем справочнике` : ""}`}
      actions={
        <>
          {onOpenAddFromAccounting ? (
            <button className="button ghost" disabled={!canManage} onClick={onOpenAddFromAccounting} type="button">
              Добавить из бухгалтерии
            </button>
          ) : null}
          <button className="button primary" disabled={!canManage} onClick={onOpenCreate} title={!canManage ? "Недостаточно прав для управления сотрудниками." : undefined} type="button">
            Создать сотрудника
          </button>
        </>
      }
    >
      <div className="filters employee-filters">
        <label className="wide-filter">
          Поиск
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="ФИО, табельный номер, должность, подразделение, группа"
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Табельный N</th>
                <th>Должность</th>
                <th>Подразделение</th>
                <th>Группа</th>
                <th>Статус</th>
                <th>Маршруты сегодня</th>
                <th>Мобильный аккаунт</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => {
                const rowProgress = Math.round((employee.routesDone / Math.max(1, employee.routesTotal)) * 100);
                return (
                  <tr
                    className={`clickable ${selectedEmployeeId === employee.id ? "selected" : ""}`}
                    key={employee.id}
                    onClick={() => onSelectEmployee(employee.id)}
                  >
                    <td>
                      <div className="identity-cell">
                        <span className="avatar small">{employee.initials}</span>
                        <div>
                          <strong>{employee.fullName}</strong>
                          <span className="muted-line">{employee.department}</span>
                        </div>
                      </div>
                    </td>
                    <td>{employee.personnelNo}</td>
                    <td>{employee.position}</td>
                    <td>{employee.zone}</td>
                    <td>{employee.employeeGroup || "-"}</td>
                    <td>
                      <Chip>{employee.status}</Chip>
                    </td>
                    <td>
                      <div className="table-progress wide-progress">
                        <ProgressBar value={rowProgress} />
                        <span>
                          {employee.routesDone} / {employee.routesTotal}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Chip>{employee.mobileStatus}</Chip>
                    </td>
                    <td>{employee.lastSeen}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={employees.length > 0 ? "Сотрудники не найдены" : "Сотрудники обхода не добавлены"}
          description={employees.length > 0 ? "Измените фильтры или поисковый запрос." : "Добавьте сотрудников из бухгалтерии или создайте нового вручную."}
          action={
            <div className="inline-actions">
              {onOpenAddFromAccounting ? (
                <button className="button ghost" disabled={!canManage} onClick={onOpenAddFromAccounting} type="button">
                  Добавить из бухгалтерии
                </button>
              ) : null}
              <button className="button primary" disabled={!canManage} onClick={onOpenCreate} title={!canManage ? "Недостаточно прав для управления сотрудниками." : undefined} type="button">
                Создать сотрудника
              </button>
            </div>
          }
        />
      )}
      <div className="table-footer">
        <span>
          Показано {filteredEmployees.length} из {employees.length}
        </span>
        <div className="pagination">
          <button disabled={filteredEmployees.length === 0} type="button">
            &lt;
          </button>
          <button className="active" type="button">
            1
          </button>
          <button disabled={filteredEmployees.length === 0} type="button">
            &gt;
          </button>
        </div>
      </div>
    </Panel>
  );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
}
