import {
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { LoaderCircle } from "lucide-react";

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
