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
    <aside aria-label={title} aria-live="polite" className="secure-password-panel" role="dialog">
      <div className="secure-password-head">
        <div>
          <strong>{title}</strong>
          <span>{accountLogin}</span>
        </div>
        <button aria-label="Закрыть временный пароль" className="secure-password-close" onClick={onDismiss} type="button">
          ×
        </button>
      </div>
      <div className="secure-password-body">
        <span>Временный пароль</span>
        <code>{password}</code>
      </div>
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
