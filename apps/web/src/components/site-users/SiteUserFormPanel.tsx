import { useState } from "react";
import { Panel } from "../ui";

export function SiteUserFormPanel({ onNotify }: { onNotify: (message: string) => void }) {
  const [formKey, setFormKey] = useState(0);
  const [generatedPassword, setGeneratedPassword] = useState("");

  function generateTemporaryPassword() {
    setGeneratedPassword("tmp-Patrol-360");
    onNotify("Временный пароль сгенерирован в UI-прототипе");
  }

  function clearForm() {
    setFormKey((value) => value + 1);
    setGeneratedPassword("");
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
          <button className="button ghost" onClick={generateTemporaryPassword} type="button">
            Сгенерировать временный пароль
          </button>
        </label>
        {generatedPassword ? (
          <div className="notice info-soft">
            <strong>Временный пароль</strong>
            <span>{generatedPassword}</span>
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
