import { useState } from "react";
import { Panel } from "../ui";

export function SiteUserFormPanel({ onNotify }: { onNotify: (message: string) => void }) {
  const [formKey, setFormKey] = useState(0);
  const [passwordResetRequested, setPasswordResetRequested] = useState(false);

  function requestPasswordReset() {
    setPasswordResetRequested(true);
    onNotify("Сброс пароля будет выполнен через backend");
  }

  function clearForm() {
    setFormKey((value) => value + 1);
    setPasswordResetRequested(false);
    onNotify("Форма пользователя очищена");
  }

  return (
    <Panel title="Создание / редактирование пользователя" className="user-form-panel">
      <div className="form-stack" key={formKey}>
        <label>
          Логин
          <input placeholder="Введите логин" />
        </label>
        <label>
          ФИО
          <input placeholder="Введите ФИО сотрудника" />
        </label>
        <label>
          Роль
          <select defaultValue="Оператор">
            <option>Оператор</option>
            <option>Руководитель</option>
            <option>Аудитор</option>
            <option>Администратор</option>
          </select>
        </label>
        <label>
          Сброс пароля
          <button className="button ghost" onClick={requestPasswordReset} type="button">
            Запросить сброс пароля
          </button>
        </label>
        {passwordResetRequested ? (
          <div className="notice info-soft">
            <strong>Пароль не генерируется в UI</strong>
            <span>Временный пароль должен вернуться только из backend как одноразовый результат операции.</span>
          </div>
        ) : null}
        <label className="toggle-filter">
          <input defaultChecked type="checkbox" /> Активен
        </label>
        <label>
          Разрешенные модули
          <select defaultValue="6">
            <option value="6">Выбрано 6 модулей</option>
          </select>
        </label>
      </div>
      <div className="drawer-actions">
        <button className="button ghost" onClick={clearForm} type="button">
          Очистить
        </button>
        <button
          className="button primary"
          onClick={() => onNotify("Пользователь сохранен как локальный UI-черновик")}
          type="button"
        >
          Сохранить
        </button>
      </div>
    </Panel>
  );
}
