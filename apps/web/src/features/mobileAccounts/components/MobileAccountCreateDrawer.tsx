import { useId, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Info, Plus, Settings2 } from "lucide-react";
import type { CreateMobileAccountPayload, MobileAccount } from "../../../types";
import { CloseIcon, EyeIcon, FieldError, FieldGroup, readFieldErrors, SelectField, TextField } from "./accountFormParts";
import { useAccountPanelState } from "./useAccountPanelState";

interface MobileAccountCreateDrawerProps {
  selected?: MobileAccount;
  onCreateAccount: (payload: CreateMobileAccountPayload) => Promise<void> | void;
  onEmployeeNameDraftChange?: (employeeName: string) => void;
  onClose?: () => void;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNotify: (message: string) => void;
}

export function MobileAccountCreateDrawer({
  onClose,
  onSaved,
  onCreateAccount,
  onDirtyChange,
}: MobileAccountCreateDrawerProps) {
  const [form, setForm] = useState({
    login: "",
    password: "",
    confirmPassword: "",
    role: "Маршрутный обходчик",
    status: "Не привязан" as MobileAccount["status"],
    language: "ru",
    credentialMode: "temporary" as "temporary" | "custom",
    requirePasswordChange: false,
    restrictToLinkedDevices: false,
  });
  const initialForm = useRef(JSON.stringify(form));
  const lifecycle = useAccountPanelState("create", JSON.stringify(form) !== initialForm.current, onDirtyChange);
  const formId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorMessage, setErrorMessage] = useState("");

  function patchForm(patch: Partial<typeof form>) {
    setForm((current) => ({ ...current, ...patch }));
    setErrorMessage("");
    setFieldErrors({});
  }

  function validateForm() {
    if (form.login.trim().length < 3) return "Логин должен содержать минимум 3 символа";
    if (form.credentialMode === "custom" && !form.password.trim()) return "Введите пароль";
    if (form.credentialMode === "custom" && form.password.length < 8) return "Пароль должен содержать минимум 8 символов";
    if (form.credentialMode === "custom" && form.password !== form.confirmPassword) return "Пароли должны совпадать";
    if (!form.role.trim()) return "Выберите роль";
    return "";
  }

  async function submitCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lifecycle.inFlight.current) return;

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    lifecycle.inFlight.current = true;
    setIsSubmitting(true);
    try {
      setFieldErrors({});
      setErrorMessage("");
      await onCreateAccount({
        employee: "",
        employeeScope: "selected",
        login: form.login.trim(),
        role: form.role,
        bindEmployee: false,
        restrictToBoundDevice: form.restrictToLinkedDevices,
        temporaryPassword: form.credentialMode === "temporary",
        password: form.credentialMode === "custom" ? form.password : undefined,
        confirmPassword: form.credentialMode === "custom" ? form.confirmPassword : undefined,
        status: form.status,
        language: form.language,
        requirePasswordChange: form.requirePasswordChange,
        restrictToLinkedDevices: form.restrictToLinkedDevices,
      });

      if (!lifecycle.isCurrent()) return;
      setForm({
        login: "",
        password: "",
        confirmPassword: "",
        role: "",
        status: "Не привязан",
        language: "ru",
        credentialMode: "temporary",
        requirePasswordChange: false,
        restrictToLinkedDevices: false,
      });
      (onSaved ?? onClose)?.();
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      const nextFieldErrors = readFieldErrors(error);
      setFieldErrors(nextFieldErrors);
      setErrorMessage(
        nextFieldErrors.login?.[0] ??
          nextFieldErrors.password?.[0] ??
          nextFieldErrors.role?.[0] ??
          (error instanceof Error ? error.message : "Не удалось создать аккаунт"),
      );
    } finally {
      if (lifecycle.isCurrent()) { lifecycle.inFlight.current = false; setIsSubmitting(false); }
    }
  }

  return (
    <section className="account-create-modal-card">
      <header className="account-create-head"><div><h3>Создать мобильный аккаунт</h3><p>Доступ к мобильному приложению.</p></div><button aria-label="Закрыть окно" className="account-create-close" disabled={isSubmitting} onClick={onClose} type="button"><CloseIcon /></button></header>
      <div className="aui-create-steps" aria-label="Этапы создания"><span className="current"><b>1</b>Данные аккаунта</span><i aria-hidden="true" /><span><b>2</b>Привязка сотрудников</span></div>
      <form className="aui-create-body" id={formId} onSubmit={submitCreateAccount}>
        <fieldset disabled={isSubmitting}>
          <section className="aui-create-section"><h4>Данные входа</h4>
            <FieldGroup label="Логин"><TextField autoFocus icon="user" onChange={(value) => patchForm({ login: value })} placeholder="Введите логин (например, ivan.petrov)" value={form.login} /><FieldError errors={fieldErrors.login} /></FieldGroup>
            <div className="account-create-grid">
              <FieldGroup label="Роль"><SelectField icon="user" onChange={(value) => patchForm({ role: value })} options={[{ label: "Маршрутный обходчик", value: "Маршрутный обходчик" }, { label: "Инспектор", value: "Инспектор" }, { label: "Оператор", value: "Оператор" }, { label: "Администратор", value: "Администратор" }]} value={form.role} /><FieldError errors={fieldErrors.role} /></FieldGroup>
              <FieldGroup label="Статус аккаунта"><SelectField icon="user" onChange={(value) => patchForm({ status: value as MobileAccount["status"] })} options={[{ label: "Не привязан", value: "Не привязан" }, { label: "Активен", value: "Активен" }, { label: "Заблокирован", value: "Заблокирован" }]} value={form.status} /></FieldGroup>
            </div>
          </section>
          <section className="aui-create-section"><h4>Пароль</h4>
            <div className="account-credential-toggle" role="radiogroup" aria-label="Способ выдачи пароля">
              <label className={form.credentialMode === "temporary" ? "selected" : ""}><input name={formId + "-password-mode"} checked={form.credentialMode === "temporary"} onChange={() => patchForm({ credentialMode: "temporary" })} type="radio" /><span>Временный пароль</span></label>
              <label className={form.credentialMode === "custom" ? "selected" : ""}><input name={formId + "-password-mode"} checked={form.credentialMode === "custom"} onChange={() => patchForm({ credentialMode: "custom" })} type="radio" /><span>Задать вручную</span></label>
            </div>
            {form.credentialMode === "custom" ? <div className="account-create-grid account-create-password-grid">
              <FieldGroup label="Пароль" hint="Минимум 8 символов."><TextField icon="lock" onChange={(value) => patchForm({ password: value })} placeholder="Введите пароль" right={<button aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} className="account-create-eye" onClick={() => setShowPassword((value) => !value)} type="button"><EyeIcon hidden={showPassword} /></button>} type={showPassword ? "text" : "password"} value={form.password} /></FieldGroup>
              <FieldGroup label="Подтвердите пароль"><TextField icon="lock" onChange={(value) => patchForm({ confirmPassword: value })} placeholder="Повторите пароль" right={<button aria-label={showConfirmPassword ? "Скрыть подтверждение пароля" : "Показать подтверждение пароля"} className="account-create-eye" onClick={() => setShowConfirmPassword((value) => !value)} type="button"><EyeIcon hidden={showConfirmPassword} /></button>} type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} /></FieldGroup>
            </div> : <p className="aui-create-note"><Info aria-hidden="true" size={17} />Пароль будет показан один раз после создания.</p>}
          </section>
          <section className="aui-create-section"><h4>Параметры доступа</h4>
            <label className="aui-checkbox"><input checked={form.requirePasswordChange} onChange={(event) => patchForm({ requirePasswordChange: event.currentTarget.checked })} type="checkbox" />Требовать смену пароля при первом входе</label>
            <label className="aui-checkbox"><input checked={form.restrictToLinkedDevices} onChange={(event) => patchForm({ restrictToLinkedDevices: event.currentTarget.checked })} type="checkbox" />Только привязанные устройства</label>
          </section>
          <details className="aui-create-extra"><summary><Settings2 aria-hidden="true" size={21} /><span><strong>Дополнительные настройки</strong><small>Язык: {form.language === "ru" ? "Русский" : "English"}</small></span><ChevronDown aria-hidden="true" size={17} /></summary><FieldGroup label="Язык интерфейса"><SelectField icon="globe" onChange={(value) => patchForm({ language: value })} options={[{ label: "Русский", value: "ru" }, { label: "English", value: "en" }]} value={form.language} /></FieldGroup></details>
          {errorMessage ? <div className="account-create-error" role="alert">{errorMessage}</div> : null}
        </fieldset>
      </form>
      <footer className="account-create-actions"><span className="aui-create-note"><Info aria-hidden="true" size={17} />Далее — привязка сотрудников.</span><div><button className="aui-button" disabled={isSubmitting} onClick={onClose} type="button">Отмена</button><button className="aui-button primary" disabled={isSubmitting} form={formId} type="submit"><Plus aria-hidden="true" size={19} />{isSubmitting ? "Создание…" : "Создать аккаунт"}</button></div></footer>
    </section>
  );
}
