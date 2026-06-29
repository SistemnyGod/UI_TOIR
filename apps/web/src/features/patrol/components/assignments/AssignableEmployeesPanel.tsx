import { Chip, EmptyState, Panel } from "../../../../shared/ui";
import type { Employee, ScreenId } from "../../../../types";

interface AssignableEmployeesPanelProps {
  employees: Employee[];
  selectedEmployeeId: string;
  onNavigate: (screen: ScreenId) => void;
  onSelectEmployee: (id: string) => void;
}

export function AssignableEmployeesPanel({
  employees,
  selectedEmployeeId,
  onNavigate,
  onSelectEmployee,
}: AssignableEmployeesPanelProps) {
  return (
    <Panel title="Сотрудники" note="Кого можно назначить сейчас" actions={<Chip tone="blue">{employees.length}</Chip>}>
      {employees.length > 0 ? (
        <div className="select-list">
          {employees.map((item) => (
            <button
              className={`select-card employee-card ${selectedEmployeeId === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => onSelectEmployee(item.id)}
              type="button"
            >
              <span className="radio-dot" />
              <div className="avatar small">{item.name.slice(0, 2)}</div>
              <div>
                <strong>{item.name}</strong>
                <small>ID: {item.id.replace("e-", "")} / {item.role}</small>
                <em>{item.zone}</em>
              </div>
              <Chip>{item.status}</Chip>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Сотрудников нет"
          description="Список будет загружаться из справочника сотрудников. Пока можно настроить внешний вид назначения."
          action={
            <button className="button ghost" onClick={() => onNavigate("employees")} type="button">
              Открыть сотрудников
            </button>
          }
        />
      )}
    </Panel>
  );
}
