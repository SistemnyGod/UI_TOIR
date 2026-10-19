import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SiteUserAccessCatalogDto } from "../../../api/contracts";
import type { SiteUser } from "../../../types";
import type { SiteUserFormPayload } from "../../../repositories/siteUsersRepository";
import { SITE_USER_ROLES, SITE_USER_STATUSES } from "../../../repositories/siteUsersRepository";

import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import "./siteUserForm.css";

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
  if (!user) return { ...defaultPayload, enabledModuleKeys: [], permissionCodes: [], permissionOverrides: [] };
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

  const baseline = useRef(JSON.stringify(payload));
  const modulesInitialized = useRef(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const [saveError, setSaveError] = useState("");
  const formId = useId();
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify(payload) !== baseline.current, pending: saving, onClose: () => onClose?.() });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (initialUser || modulesInitialized.current || !catalog?.modules.length) return;
    modulesInitialized.current = true;
    const enabledModuleKeys = catalog.modules.map(module => module.key);
    baseline.current = JSON.stringify({ ...JSON.parse(baseline.current), enabledModuleKeys });
    // A late access catalog adds its defaults without replacing the profile being typed.
    setPayload(current => ({ ...current, enabledModuleKeys }));
  }, [catalog, initialUser?.id]);

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
    if (submitting.current || !canManage) return;
    if (!valid) {
      onNotify("Заполните обязательные поля и проверьте совпадение паролей.");
      return;
    }

    submitting.current = true; setSaving(true); setSaveError("");
    try {
      if (isEdit && initialUser) await onUpdateUser?.(initialUser.id, payload);
      else await onCreateUser?.(payload);
    } catch (error) {
      if (mounted.current) setSaveError(error instanceof Error ? error.message : "Не удалось сохранить пользователя. Введённые данные остались в форме.");
    } finally {
      submitting.current = false; if (mounted.current) setSaving(false);
    }
  }

  return (
    <><ModalShell title={isEdit ? "Редактирование пользователя" : "Новый пользователь"} subtitle="Профиль учётной записи и базовый доступ." className="site-user-editor" pending={saving} onClose={requestClose} actions={<>
      <Button disabled={saving} onClick={requestClose} variant="ghost">Отмена</Button>
      <Button disabled={!canManage || !valid || saving} isLoading={saving} form={formId} type="submit" variant="primary">{isEdit ? "Сохранить изменения" : "Создать пользователя"}</Button>
    </>}>
      <form id={formId} onSubmit={event => { event.preventDefault(); void submit(); }}>
      {saveError ? <p role="alert" className="site-user-editor-error">{saveError}</p> : null}
      <fieldset disabled={saving || !canManage} className="site-user-editor-fields">
      <div className="site-user-editor-grid">
        <section className="site-user-form-section">
          <h3>Профиль</h3>
          <label>Логин *<input autoComplete="username" value={payload.login} onChange={(event) => update("login", event.target.value)} placeholder="Введите логин" /></label>
          <label>ФИО *<input value={payload.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="Введите ФИО полностью" /></label>
          <label>Роль *
            <select value={payload.role} onChange={(event) => update("role", event.target.value as SiteUser["role"])}>
              {SITE_USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>Статус
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
            <div><h3>Быстрый доступ</h3><p>Права роли действуют по умолчанию. Выбранные модули добавляют базовые права просмотра.</p></div>
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

      </fieldset></form>
    </ModalShell>{discardDialog}</>
  );
}
