import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MobileAccount, UpdateMobileAccountPayload } from "../../../types";
import { AccountPanelCard, displayKnownValue, EmployeeTokenList, FieldError, MAX_BOUND_EMPLOYEES, readFieldErrors, statusHelpText } from "./accountFormParts";
import { useAccountPanelState } from "./useAccountPanelState";
import { AccountEditConfirmation } from "./AccountEditConfirmation";

export function MobileAccountEditPanel({
  selected,
  onClose,
  onSaved,
  onDirtyChange,
  onNotify,
  onOpenLink,
  onUpdateAccount,
}: {
  selected?: MobileAccount;
  onClose?: () => void;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNotify: (message: string) => void;
  onOpenLink?: () => void;
  onUpdateAccount: (payload: UpdateMobileAccountPayload) => Promise<void> | void;
}) {
  const baseline = useRef(selected);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({
    login: selected?.login ?? "",
    role: displayKnownValue(selected?.role) || "Маршрутный обходчик",
    status: (displayKnownValue(selected?.status) || "Активен") as MobileAccount["status"],
    password: "",
    confirmPassword: "",
  });

  const initialForm = useRef(JSON.stringify(form));
  const lifecycle = useAccountPanelState(selected?.id, JSON.stringify(form) !== initialForm.current, onDirtyChange);

  useEffect(() => {
    baseline.current = selected;
    const nextForm = {
      login: selected?.login ?? "",
      role: displayKnownValue(selected?.role) || "Маршрутный обходчик",
      status: (displayKnownValue(selected?.status) || "Активен") as MobileAccount["status"],
      password: "",
      confirmPassword: "",
    };
    initialForm.current = JSON.stringify(nextForm);
    setForm(nextForm);
    setFieldErrors({});
    setErrorMessage("");
    setShowConfirm(false);
    setIsSubmitting(false);
  }, [selected?.id]);

  function patchForm(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setFieldErrors({});
    setShowConfirm(false);
  }

  const normalizedLogin = form.login.trim();
  const normalizedPassword = form.password.trim();
  const passwordChangeRequested = normalizedPassword.length > 0 || form.confirmPassword.length > 0;
  const passwordValidationError = passwordChangeRequested
    ? normalizedPassword.length < 8
      ? "Новый пароль должен содержать минимум 8 символов."
      : normalizedPassword !== form.confirmPassword
        ? "Пароли не совпадают."
        : ""
    : "";
  const isValid =
    normalizedLogin.length >= 3 &&
    Boolean(form.role) &&
    Boolean(form.status) &&
    !passwordValidationError;
  const hasChanges = baseline.current
    ? normalizedLogin !== baseline.current.login ||
      form.role !== displayKnownValue(baseline.current.role) ||
      form.status !== displayKnownValue(baseline.current.status) ||
      passwordChangeRequested
    : false;

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected) {
      onNotify("Сначала выберите мобильный аккаунт.");
      return;
    }

    if (!isValid) {
      setFieldErrors({
        ...(normalizedLogin.length < 3
          ? { login: ["Логин должен содержать минимум 3 символа."] }
          : {}),
        ...(passwordValidationError ? { password: [passwordValidationError] } : {}),
      });
      return;
    }

    if (hasChanges) setShowConfirm(true);
  }

  async function confirmEdit() {
    if (lifecycle.inFlight.current || !selected || !hasChanges || !isValid) return;

    lifecycle.inFlight.current = true;
    setIsSubmitting(true);
    try {
      setFieldErrors({});
      setErrorMessage("");
      await onUpdateAccount({
        login: normalizedLogin,
        role: form.role,
        status: form.status,
        password: passwordChangeRequested ? normalizedPassword : undefined,
        confirmPassword: passwordChangeRequested ? form.confirmPassword : undefined,
      });
      if (lifecycle.isCurrent()) { setShowConfirm(false); (onSaved ?? onClose)?.(); }
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      setShowConfirm(false);
      setFieldErrors(readFieldErrors(error));
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить аккаунт.");
    } finally {
      if (lifecycle.isCurrent()) { lifecycle.inFlight.current = false; setIsSubmitting(false); }
    }
  }

  return (
    <AccountPanelCard
      title="Редактирование аккаунта"
      note="Измените логин, роль, статус или задайте новый пароль."
      onClose={onClose}
    >
      <form className="account-panel-form account-edit-form" onSubmit={submitEdit}>
        <section className="account-edit-section">
          <div className="account-edit-section-head">
            <div>
              <strong>Основные параметры</strong>
              <span>Настройки входа и уровня доступа</span>
            </div>
            <span className={"account-edit-status " + (form.status === "Заблокирован" ? "blocked" : "active")}>
              {form.status}
            </span>
          </div>

          <div className="account-form-grid two">
            <label className="account-edit-field">
              <span>Логин <b>*</b></span>
              <input
                autoComplete="username"
                autoFocus
                onChange={(event) => patchForm({ login: event.currentTarget.value })}
                placeholder="Введите логин"
                value={form.login}
              />
              <small>Не менее трёх символов, без пробелов по краям</small>
              <FieldError errors={fieldErrors.login} />
            </label>
            <label className="account-edit-field">
              <span>Роль <b>*</b></span>
              <select onChange={(event) => patchForm({ role: event.currentTarget.value })} value={form.role}>
                <option>Маршрутный обходчик</option>
                <option>Инспектор</option>
                <option>Оператор</option>
                <option>Администратор</option>
                <option>Администратор мобильного доступа</option>
              </select>
              <small>Определяет доступные функции мобильного приложения</small>
              <FieldError errors={fieldErrors.role} />
            </label>
          </div>

          <label className="account-edit-field account-edit-field-wide">
            <span>Статус аккаунта <b>*</b></span>
            <select
              onChange={(event) => patchForm({ status: event.currentTarget.value as MobileAccount["status"] })}
              value={form.status}
            >
              <option>Активен</option>
              <option>Не привязан</option>
              <option>Заблокирован</option>
            </select>
            <small>{statusHelpText(form.status)}</small>
            <FieldError errors={fieldErrors.status} />
          </label>
        </section>

        <section className="account-edit-section account-edit-password-section">
          <div className="account-edit-section-head">
            <div>
              <strong>Пароль</strong>
              <span>Оставьте поля пустыми, если менять пароль не нужно.</span>
            </div>
            <span className="account-edit-password-badge">Защищён</span>
          </div>
          <div className="account-form-grid two">
            <label className="account-edit-field">
              <span>Новый пароль</span>
              <input
                autoComplete="new-password"
                onChange={(event) => patchForm({ password: event.currentTarget.value })}
                placeholder="Минимум 8 символов"
                type="password"
                value={form.password}
              />
              <small>Пароль передаётся на сервер только после подтверждения.</small>
              <FieldError errors={fieldErrors.password} />
            </label>
            <label className="account-edit-field">
              <span>Подтверждение пароля</span>
              <input
                autoComplete="new-password"
                onChange={(event) => patchForm({ confirmPassword: event.currentTarget.value })}
                placeholder="Повторите новый пароль"
                type="password"
                value={form.confirmPassword}
              />
              <small>Оба значения должны совпадать.</small>
            </label>
          </div>
        </section>

        <section className="selected-employee-block account-edit-section">
          <div className="account-edit-section-head">
            <div>
              <strong>Привязанные сотрудники</strong>
              <span>{selected?.boundEmployees.length ?? 0} из {MAX_BOUND_EMPLOYEES}</span>
            </div>
            <button
              className="button ghost account-edit-link-button"
              disabled={hasChanges}
              onClick={onOpenLink}
              title={hasChanges ? "Сначала сохраните изменения аккаунта" : undefined}
              type="button"
            >
              Управлять привязками
            </button>
          </div>
          <EmployeeTokenList employees={selected?.boundEmployees ?? []} />
          <p className="account-edit-help">
            {hasChanges
              ? "Сначала сохраните изменения аккаунта, затем управляйте привязками."
              : "Добавление и удаление сотрудников выполняется в отдельном окне управления привязками."}
          </p>
        </section>

        {!isValid && form.login.length > 0 && !passwordValidationError ? (
          <div className="account-edit-validation" role="alert">
            Логин должен содержать минимум 3 символа.
          </div>
        ) : null}

        {errorMessage ? <div className="account-create-error" role="alert">{errorMessage}</div> : null}
        {showConfirm ? (
          <AccountEditConfirmation login={normalizedLogin} role={form.role} status={form.status} changesPassword={passwordChangeRequested} pending={isSubmitting} onClose={() => setShowConfirm(false)} onConfirm={() => void confirmEdit()} />
        ) : null}

        <div className="account-panel-actions account-edit-actions">
          {hasChanges && !showConfirm ? (
            <span className="account-edit-change-hint">Изменения готовы к сохранению</span>
          ) : null}
          <div>
            <button className="button ghost" onClick={onClose} type="button">Отмена</button>
            <button className="button primary" disabled={isSubmitting || !selected || !isValid || !hasChanges} type="submit">
              {isSubmitting ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>
        </div>
      </form>
    </AccountPanelCard>
  );
}

