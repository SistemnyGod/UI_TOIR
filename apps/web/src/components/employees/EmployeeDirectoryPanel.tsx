import { Chip, EmptyState, Panel, ProgressBar } from "../ui";
import type { EmployeeDirectoryItem } from "../../types";

interface EmployeeDirectoryPanelProps {
  employees: EmployeeDirectoryItem[];
  selectedEmployeeId?: string;
  onOpenCreate: () => void;
  onSelectEmployee: (id: string) => void;
}

export function EmployeeDirectoryPanel({
  employees,
  selectedEmployeeId,
  onOpenCreate,
  onSelectEmployee,
}: EmployeeDirectoryPanelProps) {
  return (
    <Panel
      title="Справочник сотрудников"
      note="ФИО, должность, участок и связь с мобильным аккаунтом"
      actions={
        <>
          <button className="button primary" onClick={onOpenCreate} type="button">
            Создать сотрудника
          </button>
        </>
      }
    >
      <div className="filters employee-filters">
        <label className="wide-filter">
          Поиск
          <input placeholder="ФИО, табельный номер, должность, участок" />
        </label>
        <label>
          Участок
          <select defaultValue="all">
            <option value="all">Все участки</option>
          </select>
        </label>
        <label>
          Должность
          <select defaultValue="all">
            <option value="all">Все должности</option>
          </select>
        </label>
        <label>
          Статус
          <select defaultValue="all">
            <option value="all">Все статусы</option>
          </select>
        </label>
      </div>

      {employees.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Табельный N</th>
                <th>Должность</th>
                <th>Участок</th>
                <th>Статус</th>
                <th>Маршруты сегодня</th>
                <th>Мобильный аккаунт</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
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
          title="Сотрудники не загружены"
          description="Форма и фильтры готовы. Реестр заполнится после подключения справочника сотрудников."
          action={
            <button className="button ghost" onClick={onOpenCreate} type="button">
              Создать сотрудника
            </button>
          }
        />
      )}
      <div className="table-footer">
        <span>
          Показано {employees.length} из {employees.length}
        </span>
        <div className="pagination">
          <button disabled={employees.length === 0} type="button">
            &lt;
          </button>
          <button className="active" type="button">
            1
          </button>
          <button disabled={employees.length === 0} type="button">
            &gt;
          </button>
        </div>
      </div>
    </Panel>
  );
}
