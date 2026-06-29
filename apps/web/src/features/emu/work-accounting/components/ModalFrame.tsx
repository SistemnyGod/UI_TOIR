import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function ModalFrame({
  children,
  onClose,
  subtitle,
  title,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
  wide?: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const modal = (
    <div className="emu-modal-backdrop" onClick={onClose} role="presentation">
      <section className={`emu-modal ${wide ? "emu-modal-wide" : ""}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button onClick={onClose} type="button">×</button>
        </header>
        {children}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
