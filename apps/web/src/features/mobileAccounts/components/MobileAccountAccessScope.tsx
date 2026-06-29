import type { MobileAccount } from "../../../types";

export function MobileAccountAccessScope({
  employeeName,
  scope,
  onEmployeeNameChange,
  onScopeChange,
}: {
  employeeName: string;
  scope: MobileAccount["employeeScope"];
  onEmployeeNameChange: (value: string) => void;
  onScopeChange: (value: MobileAccount["employeeScope"]) => void;
}) {
  return (
    <div className="access-scope-block">
      <div className="access-scope-options">
        <label className={`access-scope-card ${scope === "selected" ? "selected" : ""}`}>
          <input
            checked={scope === "selected"}
            name="employeeScope"
            onChange={() => onScopeChange("selected")}
            type="radio"
            value="selected"
          />
          <span>
            <strong>Конкретные сотрудники</strong>
            <small>Аккаунт телефона будет доступен только выбранным сотрудникам.</small>
          </span>
        </label>
        <label className={`access-scope-card ${scope === "all" ? "selected" : ""}`}>
          <input
            checked={scope === "all"}
            name="employeeScope"
            onChange={() => onScopeChange("all")}
            type="radio"
            value="all"
          />
          <span>
            <strong>Все сотрудники</strong>
            <small>Общий вход для всех сотрудников, которым разрешено проходить обходы.</small>
          </span>
        </label>
      </div>

      {scope === "selected" ? (
        <label className="full-label">
          ФИО сотрудника
          <textarea
            name="employee"
            onChange={(event) => onEmployeeNameChange(event.target.value)}
            placeholder="Введите ФИО. Можно указать несколько сотрудников через запятую."
            value={employeeName}
          />
        </label>
      ) : (
        <div className="notice info-soft">
          <strong>Доступ всем сотрудникам</strong>
          <span>
            Аккаунт будет создан без персональной привязки. Backend позже проверит права и список допущенных
            сотрудников.
          </span>
        </div>
      )}
    </div>
  );
}
