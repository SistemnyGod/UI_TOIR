import { type ReactNode } from "react";
import { ModalShell } from "../../../../shared/ui";

export function ModalFrame({
  children,
  className = "",
  onClose,
  subtitle,
  title,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  subtitle?: string;
  title: string;
  wide?: boolean;
}) {
  return (
    <ModalShell
      className={`emu-modal ${wide ? "emu-modal-wide" : ""} ${className}`.trim()}
      onClose={onClose}
      subtitle={subtitle}
      title={title}
    >
      {children}
    </ModalShell>
  );
}
