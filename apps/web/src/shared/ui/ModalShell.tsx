import { X } from "lucide-react";
import { useId } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "./useModalFocus";

export function ModalShell({
  title,
  subtitle,
  actions,
  children,
  onClose,
  className = "",
  restoreFocusRef,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const subtitleId = useId();
  const { backdropRef, closeButtonRef, dialogRef } = useModalFocus<HTMLElement>(onClose, restoreFocusRef);

  const modal = (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      ref={backdropRef}
      role="presentation"
    >
      <section
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal-shell ${className}`}
        ref={dialogRef}
        role="dialog"
      >
        <header className="modal-shell-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>
          <button aria-label="Закрыть" className="modal-shell-close" onClick={onClose} ref={closeButtonRef} type="button">
            <X aria-hidden="true" size={18} strokeWidth={2.4} />
          </button>
        </header>
        <div className="modal-shell-body">{children}</div>
        {actions ? <footer className="modal-shell-actions">{actions}</footer> : null}
      </section>
    </div>
  );

  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}
