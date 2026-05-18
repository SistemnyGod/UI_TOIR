import { useState, type FormEvent } from "react";
import { getMobileAccountAccessLabel } from "../../domain/mobileAccounts";
import type { CreateMobileAccountPayload, MobileAccount } from "../../types";
import { EmptyState, Field } from "../ui";
import { MobileAccountAccessScope } from "./MobileAccountAccessScope";

const employeeCandidates: string[] = [];

interface MobileAccountCreateDrawerProps {
  selected?: MobileAccount;
  onCreateAccount: (payload: CreateMobileAccountPayload) => Promise<void> | void;
  onEmployeeNameDraftChange?: (employeeName: string) => void;
  onNotify: (message: string) => void;
}

export function MobileAccountCreateDrawer({
  selected,
  onCreateAccount,
  onEmployeeNameDraftChange,
  onNotify,
}: MobileAccountCreateDrawerProps) {
  const [employeeName, setEmployeeName] = useState("");
  const [employeeScope, setEmployeeScope] = useState<MobileAccount["employeeScope"]>("selected");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateEmployeeName(value: string) {
    setEmployeeName(value);
    onEmployeeNameDraftChange?.(value);
  }

  async function submitCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSubmitting(true);
    try {
      await onCreateAccount({
        employee: String(formData.get("employee") ?? ""),
        employeeScope,
        login: String(formData.get("login") ?? ""),
        role: String(formData.get("role") ?? "Маршрутный обходчик"),
        bindEmployee: employeeScope === "all" || formData.get("bindEmployee") === "on",
        restrictToBoundDevice: formData.get("restrictToBoundDevice") === "on",
        temporaryPassword: formData.get("temporaryPassword") === "on",
      });

      updateEmployeeName("");
      setEmployeeScope("selected");
      form.reset();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="side-drawer create-account-drawer" onSubmit={submitCreateAccount}>
      <div className="drawer-title">
        <div>
          <h2>Создать мобильный аккаунт</h2>
          <p>Пошаговое создание доступа для входа в мобильное приложение</p>
        </div>
      </div>

      <h3>1. Доступ сотрудников</h3>
      <MobileAccountAccessScope
        employeeName={employeeName}
        scope={employeeScope}
        onEmployeeNameChange={updateEmployeeName}
        onScopeChange={setEmployeeScope}
      />

      {employeeCandidates.length > 0 ? (
        <div className="candidate-list">
          {employeeCandidates.map((name, index) => (
            <button
              className={index === 0 ? "active" : ""}
              key={name}
              onClick={() => {
                updateEmployeeName(name);
                onNotify(`Сотрудник ${name} выбран для привязки`);
              }}
              type="button"
            >
              <span className="radio-dot" />
              <strong>{name}</strong>
              <em>Маршрутный обходчик</em>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Кандидатов нет"
          description="Список сотрудников для быстрой привязки появится после загрузки справочника."
        />
      )}

      <h3>2. Учетные данные</h3>
      {selected ? (
        <dl className="meta-list">
          <Field label="Логин" value={selected.login} />
          <Field label="Статус пароля" value={selected.password} />
          <Field label="Доступ" value={getMobileAccountAccessLabel(selected)} />
        </dl>
      ) : (
        <div className="notice info-soft">
          <strong>Логин и пароль будут сгенерированы</strong>
          <span>Поля появятся после выбора сотрудника или создания черновика аккаунта.</span>
        </div>
      )}

      <label className="full-label">
        Логин
        <input name="login" placeholder="Сгенерируется автоматически, если оставить пустым" />
      </label>
      <label className="toggle-filter">
        <input defaultChecked name="temporaryPassword" type="checkbox" /> Выдать временный пароль
      </label>
      {employeeScope === "selected" ? (
        <label className="toggle-filter">
          <input defaultChecked name="bindEmployee" type="checkbox" /> Сразу привязать к указанным сотрудникам
        </label>
      ) : null}

      <h3>3. Роль и ограничения</h3>
      <div className="form-stack">
        <label>
          Роль
          <select defaultValue={selected?.role ?? "Маршрутный обходчик"} name="role">
            <option>Маршрутный обходчик</option>
            <option>Складской приемщик</option>
            <option>Администратор мобильного доступа</option>
          </select>
        </label>
        <label>
          Подразделение
          <select defaultValue="day">
            <option value="day">Дневная смена</option>
            <option value="night">Ночная смена</option>
          </select>
        </label>
        <label>
          Автоматический выход при неактивности
          <select defaultValue="15">
            <option value="15">15 минут</option>
          </select>
        </label>
      </div>

      <label className="toggle-filter">
        <input defaultChecked name="restrictToBoundDevice" type="checkbox" /> Разрешать вход только с привязанного
        устройства
      </label>
      <label className="toggle-filter">
        <input defaultChecked type="checkbox" /> Привязать текущее устройство при первом входе
      </label>

      <div className="drawer-actions">
        <button className="button ghost" onClick={() => onNotify("Черновик мобильного аккаунта очищен")} type="button">
          Отмена
        </button>
        <button className="button ghost" disabled={isSubmitting} type="submit">
          Создать и привязать
        </button>
        <button className="button primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Сохранение..." : "Создать аккаунт"}
        </button>
      </div>
    </form>
  );
}
