import { Chip, EmptyState, Field } from "../../../../shared/ui";
import type { EmployeeDirectoryItem, ScreenId } from "../../../../types";

interface EmployeeProfileDrawerProps {
  canManage?: boolean;
  employee?: EmployeeDirectoryItem;
  onDeleteEmployee: (id: string) => void;
  onEditEmployee: (employee: EmployeeDirectoryItem) => void;
  onNavigate: (screen: ScreenId) => void;
}

export function EmployeeProfileDrawer({
  employee,
  canManage = true,
  onDeleteEmployee,
  onEditEmployee,
  onNavigate,
}: EmployeeProfileDrawerProps) {
  return (
    <aside className="side-drawer profile-drawer">
      {!employee ? (
        <EmptyState
          title="Сотрудник не выбран"
          description="Профиль сотрудника появится после загрузки справочника или выбора строки."
        />
      ) : (
        <>
          <div className="profile-head employee-profile-head">
            <span className="avatar profile-avatar">{employee.initials}</span>
            <div className="employee-profile-title">
              <h2>{employee.fullName}</h2>
              <p>{employee.position}</p>
            </div>
            <Chip>{employee.status}</Chip>
          </div>
          <div className="drawer-actions employee-profile-actions">
            <button className="button primary" disabled={!canManage} onClick={() => onEditEmployee(employee)} type="button">
              Редактировать
            </button>
            <button className="button ghost" onClick={() => onNavigate("assign")} type="button">
              Назначить маршрут
            </button>
            <button className="button ghost danger-text" disabled={!canManage} onClick={() => onDeleteEmployee(employee.id)} type="button">
              Деактивировать
            </button>
          </div>

          <section className="employee-profile-section">
            <h3>Основные данные</h3>
            <dl className="meta-list compact-meta">
              <Field label="Табельный" value={employee.personnelNo} />
              <Field label="Подразделение" value={employee.department || "Не указано"} />
              <Field label="Группа" value={employee.employeeGroup || "Не указана"} />
              <Field label="Бригада" value={employee.brigade || "Не указана"} />
              <Field label="Смена" value={employee.shift} />
            </dl>
          </section>

          <section className="employee-profile-section">
            <h3>Кадровая информация</h3>
            <dl className="meta-list compact-meta">
              <Field label="Дата приема" value={employee.hiredAt || "Не указана"} />
              <Field label="Дата рождения" value={employee.birthDate || "Не указана"} />
              <Field label="Руководитель" value={employee.leader || "Не указан"} />
              <Field label="Телефон" value={employee.phone || "Не указан"} />
              <Field label="Email" value={employee.email || "Не указан"} />
            </dl>
          </section>
        </>
      )}
    </aside>
  );
}
