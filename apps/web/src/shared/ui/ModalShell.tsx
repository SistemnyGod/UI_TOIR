import { X } from "lucide-react";
import { useId } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "./useModalFocus";

export function ModalShell({
  title,
  subtitle,
  titleBadge,
  headerActions,
  actions,
  children,
  onClose,
  className = "",
  restoreFocusRef,
  initialFocusSelector,
  pending = false,
}: {
  title: string;
  subtitle?: string;
  titleBadge?: ReactNode;
  headerActions?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  initialFocusSelector?: string;
  pending?: boolean;
}) {
  const titleId = useId();
  const subtitleId = useId();
  const requestClose = () => { if (!pending) onClose(); };
  const { backdropRef, closeButtonRef, dialogRef } = useModalFocus<HTMLElement>(requestClose, restoreFocusRef, initialFocusSelector);
  const closeButton = <button aria-label="Закрыть" className="modal-shell-close" disabled={pending} onClick={requestClose} ref={closeButtonRef} type="button">
    <X aria-hidden="true" size={18} strokeWidth={2.4} />
  </button>;

  const modal = (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
      ref={backdropRef}
      role="presentation"
    >
      <section
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        aria-busy={pending || undefined}
        className={`modal-shell ${className}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-shell-header">
          <div>
            {titleBadge ? <div className="modal-shell-title-row"><h2 id={titleId}>{title}</h2>{titleBadge}</div> : <h2 id={titleId}>{title}</h2>}
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>
          {headerActions ? <div className="modal-shell-header-controls">{headerActions}{closeButton}</div> : closeButton}
        </header>
        <div className="modal-shell-body">{children}</div>
        {actions ? <footer className="modal-shell-actions">{actions}</footer> : null}
      </section>
    </div>
  );

  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}
