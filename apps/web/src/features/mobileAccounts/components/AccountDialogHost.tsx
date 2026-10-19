import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "../../../shared/ui/useModalFocus";

export function AccountDialogHost({ title, panel, busy, onClose, children, restoreFocusRef }: { title: string; panel: string; busy: boolean; onClose: () => void; children: ReactNode; restoreFocusRef?: RefObject<HTMLElement | null> }) {
  const requestClose = () => { if (!busy) onClose(); };
  const { backdropRef, dialogRef } = useModalFocus<HTMLDivElement>(requestClose, restoreFocusRef);
  return createPortal(<div className="modal-backdrop aui-dialog-backdrop" ref={backdropRef} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <div aria-label={title} aria-modal="true" aria-busy={busy} className={`account-dialog-v2 ${panel}`} ref={dialogRef} role="dialog" tabIndex={-1}>
      <fieldset className="aui-dialog-fieldset" disabled={busy}>{children}</fieldset>
    </div>
  </div>, document.body);
}
