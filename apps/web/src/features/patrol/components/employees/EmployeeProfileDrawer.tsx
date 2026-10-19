import { useRef, useState } from "react";
import { Button, Chip, EmptyState, Field, ModalShell } from "../../../../shared/ui";
import type { EmployeeDirectoryItem, ScreenId } from "../../../../types";

interface EmployeeProfileDrawerProps {
  canManage?: boolean;
  canAssign?: boolean;
  employee?: EmployeeDirectoryItem;
  isSaving?: boolean;
  onDeactivateEmployee: (id: string) => Promise<void> | void;
  onEditEmployee: (employee: EmployeeDirectoryItem) => void;
  onNavigate: (screen: ScreenId) => void;
  onRemoveFromPatrol: (id: string) => Promise<void> | void;
}

export function EmployeeProfileDrawer({
  employee,
  canManage = true,
  canAssign = true,
  isSaving = false,
  onDeactivateEmployee,
  onEditEmployee,
  onNavigate,
  onRemoveFromPatrol,
}: EmployeeProfileDrawerProps) {
  const [deactivateTarget, setDeactivateTarget] = useState<EmployeeDirectoryItem | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function runAction(action: () => Promise<void> | void) {
    if (busy.current || isSaving) return;
    busy.current = true;
    setPending(true);
    setError("");
    try { await action(); setDeactivateTarget(null); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось выполнить действие. Повторите попытку."); }
    finally { busy.current = false; setPending(false); }
  }
  return (
    <aside className="side-drawer profile-drawer employee-profile-drawer">
      <button type="button" className="link-button employee-back-to-list" onClick={() => document.querySelector(".employee-directory-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}>← К списку сотрудников</button>
      {!employee ? (
        <EmptyState
          title="Сотрудник не выбран"
          description="Выберите сотрудника в рабочем списке, чтобы открыть профиль и действия."
        />
      ) : (
        <>
          <div className="profile-head employee-profile-head">
            <span className="avatar profile-avatar">{employee.initials}</span>
            <div className="employee-profile-title">
              <h2>{employee.fullName}</h2>
              <p>{employee.position || "Должность не указана"}</p>
            </div>
            <Chip>{employee.status}</Chip>
          </div>

          <div className="employee-profile-primary-action">
            <Button disabled={!canAssign} onClick={() => onNavigate("assign")} variant="primary">
              Назначить маршрут
            </Button>
          </div>

          <div className="drawer-actions employee-profile-actions">
            <Button disabled={!canManage || isSaving || pending} onClick={() => onEditEmployee(employee)} variant="ghost">
              Редактировать
            </Button>
            <Button disabled={!canManage || isSaving || pending} onClick={() => runAction(() => onRemoveFromPatrol(employee.id))} variant="ghost">
              Убрать из обхода
            </Button>
            <Button className="danger-text" disabled={!canManage || isSaving || pending} onClick={() => { setError(""); setDeactivateTarget(employee); }} variant="ghost">
              Деактивировать в справочнике
            </Button>
          </div>
          {error && !deactivateTarget ? <p role="alert" className="employee-form-error">{error}</p> : null}
          <div className="employee-mobile-summary"><span>Мобильный аккаунт</span><Chip>{employee.mobileStatus}</Chip><small>Привязка управляется во вкладке «Мобильные аккаунты».</small></div>

          <section className="employee-profile-section">
            <h3>Основные данные</h3>
            <dl className="meta-list compact-meta">
              <Field label="Табельный" value={employee.personnelNo} />
              <Field label="Подразделение" value={employee.department || "Не указано"} />
              <Field label="Группа" value={employee.employeeGroup || "Не указана"} />
              <Field label="Бригада" value={employee.brigade || "Не указана"} />
              <Field label="Смена" value={employee.shift || "Не указана"} />
            </dl>
          </section>

          <details className="employee-profile-section employee-hr-details">
            <summary><h3>Кадровая информация</h3></summary>
            <dl className="meta-list compact-meta">
              <Field label="Дата приёма" value={employee.hiredAt || "Не указана"} />
              <Field label="Дата рождения" value={employee.birthDate || "Не указана"} />
              <Field label="Руководитель" value={employee.leader || "Не указан"} />
              <Field label="Телефон" value={employee.phone || "Не указан"} />
              <Field label="Email" value={employee.email || "Не указан"} />
            </dl>
          </details>
        </>
      )}
      {deactivateTarget ? <ModalShell className="employee-deactivate-modal" title="Деактивировать сотрудника?" subtitle={deactivateTarget.fullName} pending={pending} onClose={() => { if (!pending) setDeactivateTarget(null); }} actions={<>
        <Button disabled={pending} onClick={() => setDeactivateTarget(null)} variant="ghost">Отмена</Button>
        <Button disabled={pending || !canManage} isLoading={pending} onClick={() => runAction(() => onDeactivateEmployee(deactivateTarget.id))} variant="danger">Деактивировать</Button>
      </>}><p>Действие меняет статус в общем справочнике. Чтобы убрать сотрудника только из рабочего списка, используйте «Убрать из обхода».</p>{error ? <p role="alert" className="employee-form-error">{error}</p> : null}</ModalShell> : null}
    </aside>
  );
}
