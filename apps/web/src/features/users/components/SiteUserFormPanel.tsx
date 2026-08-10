import { useEffect, useMemo, useState } from "react";
import type { SiteUserAccessCatalogDto } from "../../../api/contracts";
import type { SiteUser } from "../../../types";
import type { SiteUserFormPayload } from "../../../repositories/siteUsersRepository";
import { SITE_USER_ROLES, SITE_USER_STATUSES } from "../../../repositories/siteUsersRepository";

const defaultPayload: SiteUserFormPayload = {
  confirmPassword: "",
  fullName: "",
  initialPassword: "",
  login: "",
  permissionCodes: [],
  permissionOverrides: [],
  enabledModuleKeys: [],
  requirePasswordChange: true,
  role: SITE_USER_ROLES[0],
  status: SITE_USER_STATUSES[0],
};

function payloadFromUser(user?: SiteUser): SiteUserFormPayload {
  if (!user) return defaultPayload;
  return {
    ...defaultPayload,
    fullName: user.fullName,
    login: user.login,
    permissionCodes: user.directPermissions ?? [],
    permissionOverrides: user.permissionOverrides ?? [],
    requirePasswordChange: user.requirePasswordChange ?? false,
    role: user.role,
    status: user.status,
  };
}

export function SiteUserFormPanel({
  canManage = true,
  catalog,
  initialUser,
  mode = initialUser ? "edit" : "create",
  onClose,
  onCreateUser,
  onNotify,
  onUpdateUser,
}: {
  canManage?: boolean;
  catalog?: SiteUserAccessCatalogDto | null;
  initialUser?: SiteUser;
  mode?: "create" | "edit";
  onClose?: () => void;
  onCreateUser?: (payload: SiteUserFormPayload) => Promise<void> | void;
  onNotify: (message: string) => void;
  onUpdateUser?: (userId: string, payload: SiteUserFormPayload) => Promise<void> | void;
}) {
  const [payload, setPayload] = useState<SiteUserFormPayload>(() => payloadFromUser(initialUser));
  const [saving, setSaving] = useState(false);
  const isEdit = mode === "edit" && Boolean(initialUser);

  useEffect(() => {
    const next = payloadFromUser(initialUser);
    if (!initialUser && catalog?.modules.length && !next.enabledModuleKeys?.length) {
      next.enabledModuleKeys = catalog.modules.map((module) => module.key);
    }
    setPayload(next);
  }, [catalog, initialUser]);

  const password = payload.initialPassword?.trim() ?? "";
  const confirmation = payload.confirmPassword?.trim() ?? "";
  const passwordValid = isEdit || (password.length >= 8 && password === confirmation);
  const valid = payload.login.trim().length > 0 && payload.fullName.trim().length > 0 && passwordValid;
  const selectedModules = useMemo(() => new Set(payload.enabledModuleKeys ?? []), [payload.enabledModuleKeys]);

  function update<K extends keyof SiteUserFormPayload>(key: K, value: SiteUserFormPayload[K]) {
    setPayload((current) => ({ ...current, [key]: value }));
  }

  function toggleModule(moduleKey: string) {
    setPayload((current) => {
      const next = new Set(current.enabledModuleKeys ?? []);
      next.has(moduleKey) ? next.delete(moduleKey) : next.add(moduleKey);
      return { ...current, enabledModuleKeys: [...next] };
    });
  }

  async function submit() {
    if (!valid) {
      onNotify("Заполните обязательные поля и проверьте совпадение паролей.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && initialUser) await onUpdateUser?.(initialUser.id, payload);
      else await onCreateUser?.(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="site-user-form">
      <header className="site-user-form-header">
        <div>
          <span className="eyebrow">Администрирование</span>
          <h2 id="site-user-form-title">{isEdit ? "Редактирование пользователя" : "Новый пользователь"}</h2>
          <p>Создайте учётную запись и назначьте базовый доступ.</p>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="Закрыть">×</button>
      </header>

      <div className="site-user-form-grid">
        <section className="site-user-form-section">
          <h3>Профиль</h3>
          <label>Логин *<input autoComplete="username" value={payload.login} onChange={(event) => update("login", event.target.value)} placeholder="Введите логин" /></label>
          <label>ФИО *<input value={payload.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="Введите ФИО полностью" /></label>
          <label>Роль *
            <select value={payload.role} onChange={(event) => update("role", event.target.value as SiteUser["role"])}>
              {SITE_USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>Status
            <select value={payload.status} onChange={(event) => update("status", event.target.value as SiteUser["status"])}>
              {SITE_USER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          {!isEdit ? (
            <>
              <label>Временный пароль *
                <input autoComplete="new-password" type="password" value={payload.initialPassword} onChange={(event) => update("initialPassword", event.target.value)} placeholder="Минимум 8 символов" />
              </label>
              <label>Подтвердите пароль *
                <input autoComplete="new-password" type="password" value={payload.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} placeholder="Повторите пароль" />
              </label>
              <label className="site-user-check-row"><input checked={payload.requirePasswordChange !== false} onChange={(event) => update("requirePasswordChange", event.target.checked)} type="checkbox" /> Потребовать смену пароля при первом входе</label>
            </>
          ) : null}
        </section>

        <section className="site-user-form-section">
          <div className="site-user-form-section-heading">
            <div><h3>Быстрый доступ</h3><p>Role rights remain the baseline. Selected modules get базовых прав просмотра.</p></div>
            <strong>{selectedModules.size}/{catalog?.modules.length ?? 0}</strong>
          </div>
          <div className="site-user-role-cards">
            {SITE_USER_ROLES.map((role) => (
              <button className={"site-user-role-card " + (payload.role === role ? "is-selected" : "")} key={role} onClick={() => update("role", role)} type="button">
                <span className="site-user-role-radio" />
                <strong>{role}</strong>
                <small>{role === SITE_USER_ROLES[4] ? "Полный доступ к системе" : role === SITE_USER_ROLES[3] ? "Просмотр и аудит" : "Операционный доступ"}</small>
              </button>
            ))}
          </div>
          <h3>Модули</h3>
          <div className="site-user-module-checks">
            {(catalog?.modules ?? []).map((module) => (
              <label className="site-user-module-check" key={module.key}>
                <input checked={selectedModules.has(module.key)} onChange={() => toggleModule(module.key)} type="checkbox" />
                <span><strong>{module.name || module.key}</strong><small>{module.description}</small></span>
              </label>
            ))}
            {!catalog?.modules.length ? <p className="user-access-muted">Каталог доступа загружается или недоступен.</p> : null}
          </div>
          <div className="site-user-create-summary">
            <strong>Будет назначено</strong>
            <span>{selectedModules.size} модулей · безопасный профиль роли</span>
            <span>{catalog?.modules.filter((module) => selectedModules.has(module.key)).reduce((sum, module) => sum + module.permissions.filter((permission) => permission.isViewDefault).length, 0) ?? 0} базовых прав просмотра</span>
          </div>
        </section>
      </div>

      <footer className="site-user-modal-actions">
        <button className="button ghost" onClick={onClose} type="button">Отмена</button>
        <button className="button primary" disabled={!canManage || !valid || saving} onClick={() => void submit()} type="button">
          {saving ? "Сохранение..." : isEdit ? "Сохранить изменения" : "Создать пользователя"}
        </button>
      </footer>
    </div>
  );
}
