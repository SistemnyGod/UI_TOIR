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

export function PpeModalShell({
  ariaLabel,
  bodyClassName = "",
  children,
  className = "",
  description,
  eyebrow,
  footer,
  initialFocusSelector,
  onClose,
  title,
}: PpeModalShellProps) {
  const titleId = useId();
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
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
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [initialFocusSelector, onClose]);

  return createPortal(
    <div
      className="ppe-v2-modal-backdrop ppe-ui-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-label={ariaLabel}
        aria-modal="true"
        className={`ppe-v2-modal ppe-ui-modal ${className}`.trim()}
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="ppe-v2-modal-head ppe-ui-modal-head">
          <div>
            {eyebrow ? <span className="ppe-v2-eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <PpeButton aria-label="Закрыть" icon={<X size={20} />} onClick={onClose} variant="icon" />
        </header>
        <div className={`ppe-v2-modal-body ppe-ui-modal-body ${bodyClassName}`.trim()}>{children}</div>
        {footer ? <footer className="ppe-v2-modal-actions ppe-ui-modal-actions">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
