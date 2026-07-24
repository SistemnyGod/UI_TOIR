import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X } from "lucide-react";

export type PpeButtonVariant = "primary" | "secondary" | "ghost" | "link" | "danger" | "icon";
export type PpeButtonSize = "compact" | "default" | "touch";

export type PpeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  loading?: boolean;
  size?: PpeButtonSize;
  variant?: PpeButtonVariant;
};

export function PpeButton({
  children,
  className = "",
  disabled,
  icon,
  loading = false,
  size = "default",
  type = "button",
  variant = "secondary",
  ...props
}: PpeButtonProps) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={`ppe-ui-button is-${variant} is-${size} ${className}`.trim()}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="ppe-ui-button-spinner" size={16} /> : icon}
      {children ? <span className="ppe-ui-button-label">{children}</span> : null}
    </button>
  );
}

export type PpeModalShellProps = {
  ariaLabel: string;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  closeDisabled?: boolean;
  description?: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  initialFocusSelector?: string;
  onClose: () => void;
  title: ReactNode;
};

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const ppeModalStack: symbol[] = [];

export function PpeModalShell({
  ariaLabel,
  bodyClassName = "",
  children,
  className = "",
  closeDisabled = false,
  description,
  eyebrow,
  footer,
  initialFocusSelector,
  onClose,
  title,
}: PpeModalShellProps) {
  const titleId = useId();
  const modalRef = useRef<HTMLElement>(null);
  const modalIdRef = useRef(Symbol("ppe-modal"));
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    const modalId = modalIdRef.current;
    ppeModalStack.push(modalId);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const modal = modalRef.current;
    const preferred = initialFocusSelector
      ? modal?.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    const firstFocusable = preferred ?? modal?.querySelector<HTMLElement>(focusableSelector);
    window.requestAnimationFrame(() => firstFocusable?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (ppeModalStack[ppeModalStack.length - 1] !== modalId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !modal) return;

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      const stackIndex = ppeModalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) ppeModalStack.splice(stackIndex, 1);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [initialFocusSelector]);

  return createPortal(
    <div
      className="ppe-v2-modal-backdrop ppe-ui-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
      role="presentation"
    >
      <section
        aria-busy={closeDisabled || undefined}
        aria-label={ariaLabel}
        aria-modal="true"
        aria-describedby={description ? `${titleId}-description` : undefined}
        className={`ppe-v2-modal ppe-ui-modal ${className}`.trim()}
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="ppe-v2-modal-head ppe-ui-modal-head">
          <div>
            {eyebrow ? <span className="ppe-v2-eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={`${titleId}-description`}>{description}</p> : null}
          </div>
          <PpeButton aria-label="Закрыть" disabled={closeDisabled} icon={<X size={20} />} onClick={onClose} variant="icon" />
        </header>
        <div className={`ppe-v2-modal-body ppe-ui-modal-body ${bodyClassName}`.trim()}>{children}</div>
        {footer ? <footer className="ppe-v2-modal-actions ppe-ui-modal-actions">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
