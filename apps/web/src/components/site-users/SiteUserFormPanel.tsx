import { useState } from "react";
import { Panel } from "../ui";
import type { SiteUser } from "../../types";
import type { SiteUserFormPayload } from "../../repositories/siteUsersRepository";

const defaultPayload: SiteUserFormPayload = {
  fullName: "",
  login: "",
  role: "Оператор",
  status: "Активен",
};

export function SiteUserFormPanel({
  canManage = true,
  onCreateUser,
  onNotify,
}: {
  canManage?: boolean;
  onCreateUser?: (payload: SiteUserFormPayload) => Promise<void> | void;
  onNotify: (message: string) => void;
}) {
  const [payload, setPayload] = useState<SiteUserFormPayload>(defaultPayload);
  const [passwordResetRequested, setPasswordResetRequested] = useState(false);
  const [saving, setSaving] = useState(false);

  function requestPasswordReset() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления пользователями сайта.");
      return;
    }

    setPasswordResetRequested(true);
    onNotify("Сброс пароля будет выполнен через backend");
  }

  function clearForm() {
    setPayload(defaultPayload);
    setPasswordResetRequested(false);
    onNotify("Форма пользователя очищена");
  }

  async function submit() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления пользователями сайта.");
      return;
    }

    if (!payload.login.trim() || !payload.fullName.trim()) {
      onNotify("Заполните логин и ФИО пользователя");
      return;
    }

    setSaving(true);
    try {
      await onCreateUser?.(payload);
      setPayload(defaultPayload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Создание пользователя сайта" className="user-form-panel">
      <div className="form-stack">
        <label>
          Логин
          <input
            onChange={(event) => setPayload((current) => ({ ...current, login: event.target.value }))}
            placeholder="Введите логин"
            value={payload.login}
          />
        </label>
        <label>
          ФИО
          <input
            onChange={(event) => setPayload((current) => ({ ...current, fullName: event.target.value }))}
            placeholder="Введите ФИО сотрудника"
            value={payload.fullName}
          />
        </label>
        <label>
          Роль
          <select
            onChange={(event) => setPayload((current) => ({ ...current, role: event.target.value as SiteUser["role"] }))}
            value={payload.role}
          >
            <option>Оператор</option>
            <option>Руководитель</option>
            <option>Аудитор</option>
            <option>Администратор</option>
          </select>
        </label>
        <label>
          Сброс пароля
          <button className="button ghost" disabled={!canManage} onClick={requestPasswordReset} type="button">
            Запросить сброс пароля
          </button>
        </label>
        {passwordResetRequested ? (
          <div className="notice info-soft">
            <strong>Пароль не генерируется в UI</strong>
            <span>Временный пароль должен вернуться только из backend как одноразовый результат операции.</span>
          </div>
        ) : null}
        <label>
          Статус
          <select
            onChange={(event) => setPayload((current) => ({ ...current, status: event.target.value as SiteUser["status"] }))}
            value={payload.status}
          >
            <option>Активен</option>
            <option>Неактивен</option>
            <option>Заблокирован</option>
          </select>
        </label>
      </div>
      <div className="drawer-actions">
        <button className="button ghost" onClick={clearForm} type="button">
          Очистить
        </button>
        <button className="button primary" disabled={saving || !canManage} onClick={submit} type="button">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
    </Panel>
  );
}
