interface TemporaryPasswordPanelProps {
  accountLogin: string;
  password: string;
  title: string;
  onDismiss: () => void;
  onNotify: (message: string) => void;
}

export function TemporaryPasswordPanel({
  accountLogin,
  password,
  title,
  onDismiss,
  onNotify,
}: TemporaryPasswordPanelProps) {
  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      onNotify("Временный пароль скопирован");
    } catch {
      onNotify("Скопируйте временный пароль вручную");
    }
  }

  return (
    <aside className="secure-password-panel" aria-live="polite">
      <div>
        <strong>{title}</strong>
        <span>{accountLogin}</span>
      </div>
      <code>{password}</code>
      <p>Покажите пароль сотруднику один раз. После закрытия панель не сохраняет пароль в истории уведомлений.</p>
      <div className="secure-password-actions">
        <button className="button ghost" onClick={copyPassword} type="button">
          Скопировать
        </button>
        <button className="button primary" onClick={onDismiss} type="button">
          Скрыть
        </button>
      </div>
    </aside>
  );
}
