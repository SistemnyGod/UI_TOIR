import { Chip, EmptyState, Field, Panel, ProgressBar } from "../../../../shared/ui";
import type { EmployeeDirectoryItem, ScreenId } from "../../../../types";

interface EmployeeProfileDrawerProps {
  canManage?: boolean;
  employee?: EmployeeDirectoryItem;
  progress: number;
  onDeleteEmployee: (id: string) => void;
  onEditEmployee: (employee: EmployeeDirectoryItem) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
}

export function EmployeeProfileDrawer({
  employee,
  canManage = true,
  progress,
  onDeleteEmployee,
  onEditEmployee,
  onNavigate,
  onNotify,
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
          <div className="profile-head">
            <span className="avatar profile-avatar">{employee.initials}</span>
            <div>
              <h2>{employee.fullName}</h2>
              <p>{employee.position}</p>
            </div>
            <Chip>{employee.status}</Chip>
          </div>
          <div className="drawer-actions">
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

          <div className="profile-grid">
            <Panel title="Маршруты сегодня">
              <div className="profile-kpi">
                <strong>{employee.routesDone}</strong>
                <span>из {employee.routesTotal}</span>
              </div>
              <ProgressBar value={progress} />
              <Chip>{progress >= 70 ? "В процессе" : "На смене"}</Chip>
            </Panel>
            <Panel title="Мобильный аккаунт">
              <dl className="meta-list compact-meta">
                <Field label="Статус" value={<Chip>{employee.mobileStatus}</Chip>} />
                <Field label="Телефон" value={employee.phone || "Не указан"} />
                <Field label="Последний вход" value={employee.lastSeen} />
              </dl>
              <button
                className="link-button danger-text"
                onClick={() => onNotify("Блокировка входа будет выполнена через модуль мобильных аккаунтов")}
                type="button"
              >
                Заблокировать вход
              </button>
            </Panel>
          </div>

          <Panel title="Ключевые данные">
            <dl className="meta-list">
              <Field label="Табельный номер" value={employee.personnelNo} />
              <Field label="Дата приема" value={employee.hiredAt || "Не указана"} />
              <Field label="Дата рождения" value={employee.birthDate || "Не указана"} />
              <Field label="Подразделение" value={employee.department || "Не указано"} />
              <Field label="Основная группа" value={employee.employeeGroup || "Не указана"} />
              <Field label="Бригада" value={employee.brigade || "Не указана"} />
              <Field label="Смена" value={employee.shift} />
              <Field label="Руководитель" value={employee.leader || "Не указан"} />
              <Field label="Email" value={employee.email || "Не указан"} />
            </dl>
          </Panel>
        </>
      )}
    </aside>
  );
}
