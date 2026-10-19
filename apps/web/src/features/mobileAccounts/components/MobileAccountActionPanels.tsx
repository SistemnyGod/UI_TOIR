import { useState, type FormEvent } from "react";
import type { MobileAccount } from "../../../types";
import { AccountPanelCard } from "./accountFormParts";
import { useAccountPanelState } from "./useAccountPanelState";

export function MobileAccountPasswordPanel({
  selected,
  onClose,
  onSaved,
  onNotify,
  onResetPassword,
}: {
  selected?: MobileAccount;
  onClose?: () => void;
  onSaved?: () => void;
  onNotify: (message: string) => void;
  onResetPassword: () => Promise<void> | void;
}) {
  const lifecycle = useAccountPanelState(selected?.id, false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected) {
      onNotify("Сначала выберите мобильный аккаунт.");
      return;
    }

    if (lifecycle.inFlight.current) return;
    setErrorMessage("");
    lifecycle.inFlight.current = true;
    setIsSubmitting(true);
    try {
      await onResetPassword();
      if (lifecycle.isCurrent()) (onSaved ?? onClose)?.();
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сбросить пароль.");
    } finally {
      if (lifecycle.isCurrent()) { lifecycle.inFlight.current = false; setIsSubmitting(false); }
    }
  }

  return (
    <AccountPanelCard
      title="Изменение пароля"
      note="Временный пароль будет показан один раз после сброса."
      onClose={onClose}
    >
      <form className="account-panel-form" onSubmit={submitPassword}>
        <div className="password-reset-summary">
          <span>Аккаунт</span>
          <strong>{selected?.login ?? "Аккаунт не выбран"}</strong>
          <em>Сброс пароля потребует смену при следующем входе.</em>
        </div>

        <label className="toggle-filter">
          <input defaultChecked readOnly type="checkbox" /> Требовать смену пароля при следующем входе
        </label>

        {errorMessage ? <div className="account-create-error" role="alert">{errorMessage}</div> : null}
        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button primary" disabled={isSubmitting || !selected} type="submit">
            {isSubmitting ? "Сброс..." : "Сбросить пароль"}
          </button>
        </div>
      </form>
    </AccountPanelCard>
  );
}

export function MobileAccountDeletePanel({
  selected,
  onClose,
  onSaved,
  onDeleteAccount,
}: {
  selected?: MobileAccount;
  onClose?: () => void;
  onSaved?: () => void;
  onDeleteAccount: () => Promise<void> | void;
}) {
  const lifecycle = useAccountPanelState(selected?.id, false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitDelete() {
    if (!selected) return;

    if (lifecycle.inFlight.current) return;
    setErrorMessage("");
    lifecycle.inFlight.current = true;
    setIsSubmitting(true);
    try {
      await onDeleteAccount();
      if (lifecycle.isCurrent()) (onSaved ?? onClose)?.();
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      setErrorMessage(error instanceof Error ? error.message : "Не удалось удалить аккаунт.");
    } finally {
      if (lifecycle.isCurrent()) { lifecycle.inFlight.current = false; setIsSubmitting(false); }
    }
  }

  return (
    <AccountPanelCard
      title="Удаление аккаунта"
      note="Удаление отключит мобильный вход и отвяжет сотрудников от аккаунта."
      onClose={onClose}
    >
      <div className="account-panel-form">
        <div className="account-delete-warning">
          <strong>Удалить аккаунт {selected?.login ?? ""}?</strong>
          <span>Действие нельзя отменить. Для временного закрытия доступа лучше использовать блокировку.</span>
        </div>

        {errorMessage ? <div className="account-create-error" role="alert">{errorMessage}</div> : null}
        <div className="account-panel-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="button danger" disabled={isSubmitting || !selected} onClick={submitDelete} type="button">
            {isSubmitting ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </div>
    </AccountPanelCard>
  );
}

