import type { ReactNode } from "react";

export type ActionMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export function ActionMenu({
  label = "Действия",
  items,
  className = "",
}: {
  label?: string;
  items: ActionMenuItem[];
  className?: string;
}) {
  return (
    <details className={`action-menu ${className}`}>
      <summary aria-label={label} title={label}>
        <span aria-hidden="true">...</span>
      </summary>
      <div className="action-menu-list" role="menu">
        {items.map((item) => (
          <button
            className={item.danger ? "danger" : ""}
            disabled={item.disabled}
            key={item.id}
            onClick={() => item.onSelect()}
            role="menuitem"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}

export function ActionMenuSection({ children }: { children: ReactNode }) {
  return <div className="action-menu-section">{children}</div>;
}
