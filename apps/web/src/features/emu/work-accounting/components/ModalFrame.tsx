import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

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
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgroundState = new Map<HTMLElement, boolean>();
    const backdrop = backdropRef.current;

    for (const element of Array.from(document.body.children)) {
      if (!(element instanceof HTMLElement) || element === backdrop) {
        continue;
      }

      backgroundState.set(element, element.inert);
      element.inert = true;
    }

    closeButtonRef.current?.focus();

    return () => {
      for (const [element, wasInert] of backgroundState) {
        element.inert = wasInert;
      }
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1)
        : (currentIndex === focusableElements.length - 1 ? 0 : currentIndex + 1);

      event.preventDefault();
      focusableElements[nextIndex].focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const modal = (
    <div className="emu-modal-backdrop" onClick={onClose} ref={backdropRef} role="presentation">
      <section aria-labelledby={titleId} aria-modal="true" className={`emu-modal ${wide ? "emu-modal-wide" : ""} ${className}`.trim()} onClick={(event) => event.stopPropagation()} ref={dialogRef} role="dialog">
        <header>
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button aria-label="Закрыть" onClick={onClose} ref={closeButtonRef} type="button">×</button>
        </header>
        {children}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
