import { useEffect, useMemo, useState } from "react";
import { Panel } from "../../../shared/ui";
import type { SiteUser } from "../../../types";
import type { SiteUserFormPayload } from "../../../repositories/siteUsersRepository";
import { SITE_USER_ROLES, SITE_USER_STATUSES } from "../../../repositories/siteUsersRepository";

const defaultPayload: SiteUserFormPayload = {
  confirmPassword: "",
  fullName: "",
  initialPassword: "",
  login: "",
  permissionCodes: [],
  role: "Оператор",
  status: "Активен",
};

function payloadFromUser(user?: SiteUser): SiteUserFormPayload {
  if (!user) return defaultPayload;

  return {
    confirmPassword: "",
    fullName: user.fullName,
    initialPassword: "",
    login: user.login,
    permissionCodes: user.directPermissions ?? [],
    role: user.role,
    status: user.status,
  };
}

export function SiteUserFormPanel({
  canManage = true,
  initialUser,
  mode = initialUser ? "edit" : "create",
  onClose,
  onCreateUser,
  onNotify,
  onUpdateUser,
}: {
  canManage?: boolean;
  initialUser?: SiteUser;
  mode?: "create" | "edit";
  onClose?: () => void;
  onCreateUser?: (payload: SiteUserFormPayload) => Promise<void> | void;
  onNotify: (message: string) => void;
  onUpdateUser?: (userId: string, payload: SiteUserFormPayload) => Promise<void> | void;
}) {
  const [payload, setPayload] = useState<SiteUserFormPayload>(() => payloadFromUser(initialUser));
  const [passwordNotice, setPasswordNotice] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPayload(payloadFromUser(initialUser));
    setPasswordNotice(false);
  }, [initialUser]);

  const isEdit = mode === "edit" && Boolean(initialUser);
  const password = payload.initialPassword?.trim() ?? "";
  const confirmPassword = payload.confirmPassword?.trim() ?? "";
  const passwordIsValid = isEdit || (password.length >= 8 && password === confirmPassword);
  const isValid = payload.login.trim().length > 0 && payload.fullName.trim().length > 0 && passwordIsValid;
  const roleHint = useMemo(() => {
    if (payload.role === "Администратор") return "Полный доступ ко всем модулям. Используйте только для системных администраторов.";
    if (payload.role === "Оператор ЭМУ") return "Базовая роль для учета работ. Точные права и участки задаются в правой панели доступа.";
    if (payload.role === "Руководитель") return "Отчеты, аналитика и контроль команды без системного администрирования.";
    if (payload.role === "Аудитор") return "Просмотр, аудит и экспорт без изменения данных.";
    return "Базовая роль для обходов, назначений и результатов.";
  }, [payload.role]);

  function clearForm() {
    setPayload(payloadFromUser(initialUser));
    setPasswordNotice(false);
    onNotify(isEdit ? "Форма редактирования восстановлена" : "Форма пользователя очищена");
  }

  function requestPasswordResetNotice() {
    setPasswordNotice(true);
    onNotify("Сброс пароля будет выполнен через backend");
  }

  async function submit() {
    if (!canManage) {
      onNotify("Недостаточно прав для управления пользователями.");
      return;
    }

    if (payload.login.trim().length === 0 || payload.fullName.trim().length === 0) {
      onNotify("Заполните логин и ФИО пользователя");
      return;
    }

    if (!isEdit && password.length < 8) {
      onNotify("Укажите временный пароль не короче 8 символов");
      return;
    }

    if (!isEdit && password !== confirmPassword) {
      onNotify("Пароль и подтверждение не совпадают");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && initialUser) {
        await onUpdateUser?.(initialUser.id, payload);
      } else {
        await onCreateUser?.(payload);
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось сохранить пользователя");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title={isEdit ? "Редактирование пользователя" : "Новый пользователь"}
      note={isEdit ? "Измените профиль, роль и статус. Индивидуальные права настраиваются в правой панели." : "Создайте учетную запись. Временный пароль будет показан после сохранения."}
      className="site-user-form-panel"
      actions={
        <button className="button ghost" onClick={onClose} type="button">
          Закрыть
        </button>
      }
    >
      <div className="site-user-form-layout">
        <section className="site-user-form-section">
          <h4>Профиль</h4>
          <div className="site-user-form-grid">
            <label>
              Логин
              <input
                value={payload.login}
                onChange={(event) => setPayload((current) => ({ ...current, login: event.target.value }))}
                placeholder="login"
                disabled={isEdit}
              />
            </label>
            <label>
              ФИО
              <input
                value={payload.fullName}
                onChange={(event) => setPayload((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Фамилия Имя Отчество"
              />
            </label>
            <label>
              Роль
              <select value={payload.role} onChange={(event) => setPayload((current) => ({ ...current, role: event.target.value as SiteUser["role"] }))}>
                {SITE_USER_ROLES.map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
            <label>
              Статус
              <select value={payload.status} onChange={(event) => setPayload((current) => ({ ...current, status: event.target.value as SiteUser["status"] }))}>
                {SITE_USER_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="span-2">
              Комментарий администратора
              <textarea placeholder="Например: закрепить за участком после создания, проверить права на ЭМУ" rows={3} />
            </label>
            {!isEdit ? (
              <>
                <label>
                  Временный пароль
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setPayload((current) => ({ ...current, initialPassword: event.target.value }))}
                    placeholder="Минимум 8 символов"
                    type="password"
                    value={payload.initialPassword ?? ""}
                  />
                </label>
                <label>
                  Подтвердите пароль
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setPayload((current) => ({ ...current, confirmPassword: event.target.value }))}
                    placeholder="Повторите пароль"
                    type="password"
                    value={payload.confirmPassword ?? ""}
                  />
                </label>
              </>
            ) : null}
          </div>
        </section>

        <aside className="site-user-form-aside">
          <h4>Права и пароль</h4>
          <p>{roleHint}</p>
          <div className="site-user-form-summary">
            <span>
              <b>Роль</b>
              {payload.role}
            </span>
            <span>
              <b>Статус</b>
              {payload.status}
            </span>
          </div>
          <div className="site-user-password-callout">
            <strong>Пароль</strong>
            <span>{isEdit ? "Сброс выполняется сервером и не показывает постоянный пароль в интерфейсе." : "Пароль задается вручную при создании. Передайте его пользователю по защищенному каналу."}</span>
            {isEdit ? (
              <button className="button ghost small" onClick={requestPasswordResetNotice} type="button">
                Запросить сброс пароля
              </button>
            ) : null}
            {passwordNotice ? <em>Пароль не генерируется в UI</em> : null}
          </div>
          <ul>
            <li>Роль задает базовый набор прав.</li>
            <li>Индивидуальные права добавляются или снимаются справа во вкладке “Права”.</li>
            <li>Ограничения по участкам ЭМУ задаются во вкладке “Участки”.</li>
            <li>{isEdit ? "Сброс пароля доступен в профиле пользователя." : "Созданный пароль не хранится в открытом виде."}</li>
          </ul>
        </aside>
      </div>

      <footer className="site-user-modal-actions">
        <button className="button ghost" onClick={clearForm} type="button">
          Очистить
        </button>
        <button className="button ghost" onClick={onClose} type="button">
          Отмена
        </button>
        <button className="button primary" disabled={!canManage || !isValid || saving} onClick={submit} type="button">
          {saving ? "Сохраняем..." : isEdit ? "Сохранить изменения" : "Создать пользователя"}
        </button>
      </footer>
    </Panel>
  );
}
