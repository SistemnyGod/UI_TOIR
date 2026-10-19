import { type ReactNode } from "react";
import { ModalShell } from "../../../../shared/ui";

export function ModalFrame({
  children,
  className = "",
  onClose,
  subtitle,
  title,
  wide = false,
  actions,
  pending = false,
  leaveDialog,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  subtitle?: string;
  title: string;
  wide?: boolean;
  actions?: ReactNode;
  pending?: boolean;
  leaveDialog?: ReactNode;
}) {
  return (
    <><ModalShell
      className={`emu-modal emu-accounting-dialog ${wide ? "emu-modal-wide" : ""} ${className}`.trim()}
      onClose={() => { if (!pending) onClose(); }}
      actions={actions}
      subtitle={subtitle}
      title={title}
      pending={pending}
    >
      {actions ? <fieldset className="emu-work-dialog-fields" disabled={pending} aria-busy={pending}>{children}</fieldset> : children}
    </ModalShell>{leaveDialog}</>
  );
}
