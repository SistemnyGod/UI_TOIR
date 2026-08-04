import { useState } from "react";
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
  const valid = payload.currentPassword.length > 0 && payload.newPassword.length >= 8 && payload.newPassword === payload.confirmPassword;

  async function submit() {
    setSubmitted(true);
    if (!valid) return;
    await onChangePassword(payload);
  }

  return (
    <main className="auth-screen">
      <section className="auth-card forced-password-card">
        <span className="eyebrow">Security</span>
        <h1>Change temporary password</h1>
        <p className="auth-subtitle">Set a personal password before continuing to Patrol360.</p>
        <label>Current password<input autoComplete="current-password" type="password" value={payload.currentPassword} onChange={(event) => setPayload((current) => ({ ...current, currentPassword: event.target.value }))} /></label>
        <label>New password<input autoComplete="new-password" type="password" value={payload.newPassword} onChange={(event) => setPayload((current) => ({ ...current, newPassword: event.target.value }))} /></label>
        <label>Confirm new password<input autoComplete="new-password" type="password" value={payload.confirmPassword} onChange={(event) => setPayload((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
        {submitted && !valid ? <p className="auth-error">Use at least 8 characters and make both new passwords equal.</p> : null}
        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        <div className="auth-actions">
          <button className="button primary" disabled={isSubmitting} onClick={() => void submit()} type="button">{isSubmitting ? "Saving..." : "Change password"}</button>
          <button className="button ghost" disabled={isSubmitting} onClick={onLogout} type="button">Sign out</button>
        </div>
      </section>
    </main>
  );
}
