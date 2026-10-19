import { useRef, useState } from "react";
import type { ChangePasswordDto } from "../../api/contracts";

export function ForcedPasswordChangeScreen({
  errorMessage,
  isSubmitting,
  onChangePassword,
  onLogout,
}: {
  errorMessage?: string;
  isSubmitting?: boolean;
  onChangePassword: (payload: ChangePasswordDto) => Promise<boolean>;
  onLogout: () => void;
}) {
  const [payload, setPayload] = useState<ChangePasswordDto>({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const busy = pending || isSubmitting;
  const valid = payload.currentPassword.length > 0 && payload.newPassword.length >= 8 && payload.newPassword === payload.confirmPassword;

  async function submit() {
    setSubmitted(true);
    if (!valid || inFlight.current || isSubmitting) return;
    inFlight.current = true; setPending(true);
    try { await onChangePassword(payload); }
    finally { inFlight.current = false; setPending(false); }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card forced-password-card">
        <span className="eyebrow">Безопасность аккаунта</span>
        <h1>Изменение временного пароля</h1>
        <p className="auth-subtitle">Установите личный пароль, чтобы продолжить работу. Минимум 8 символов.</p>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={busy} className="auth-password-fields">
        <label>Текущий пароль<input autoComplete="current-password" type="password" value={payload.currentPassword} onChange={(event) => setPayload((current) => ({ ...current, currentPassword: event.target.value }))} /></label>
        <label>Новый пароль<input autoComplete="new-password" type="password" value={payload.newPassword} onChange={(event) => setPayload((current) => ({ ...current, newPassword: event.target.value }))} /></label>
        <label>Подтверждение нового пароля<input autoComplete="new-password" type="password" value={payload.confirmPassword} onChange={(event) => setPayload((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
        </fieldset>
        {submitted && !valid ? <p className="auth-error" role="alert">Введите текущий пароль и новый пароль длиной от 8 символов. Подтверждение должно совпадать.</p> : null}
        {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
        <div className="auth-actions">
          <button className="button primary" disabled={busy} type="submit">{busy ? "Сохраняем…" : "Сохранить пароль"}</button>
          <button className="button ghost" disabled={busy} onClick={onLogout} type="button">Выйти из аккаунта</button>
        </div></form>
      </section>
    </main>
  );
}
