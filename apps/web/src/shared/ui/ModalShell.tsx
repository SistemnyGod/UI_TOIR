import type { ReactNode } from "react";

export function ModalShell({
  title,
  subtitle,
  actions,
  children,
  onClose,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className={`modal-shell ${className}`} role="dialog">
        <header className="modal-shell-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button aria-label="Закрыть" className="modal-shell-close" onClick={onClose} type="button">
            Г—
          </button>
        </header>
        <div className="modal-shell-body">{children}</div>
        {actions ? <footer className="modal-shell-actions">{actions}</footer> : null}
      </section>
    </div>
  );
}
